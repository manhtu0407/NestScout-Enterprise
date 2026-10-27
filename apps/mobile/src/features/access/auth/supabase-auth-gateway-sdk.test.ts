import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { AuthEvent } from './auth-gateway';
import { createSupabaseAuthGateway } from './supabase-auth-gateway';

// These tests run the real Supabase Auth client (the same GoTrueClient the app uses)
// against a scripted Auth server and in-memory storage, so session replacement,
// event ordering and sign-out behave as the SDK implements them. Nothing here is
// evidence about the hosted or local Supabase Auth service itself.

type Hold = { promise: Promise<void>; release: () => void };

function hold(): Hold {
  let release = () => undefined as void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

type Request = { method: string; path: string; scope: string | null; token: string | null };

function createAuthServer() {
  const owners = new Map<string, string>();
  const rejections = new Map<string, { status: number; code?: string }>();
  const requests: Request[] = [];
  const gates: { user?: Hold; logout?: Hold } = {};
  // Replaces the answer of GET /user for every token that is not already rejected.
  let userAnswer: ((token: string | null) => Response | Promise<Response>) | undefined;
  let issued = 0;
  let nextUser = 'user-a';

  function issue(userId: string) {
    issued += 1;
    const tokens = { access: `access-${issued}`, refresh: `refresh-${issued}` };
    owners.set(tokens.access, userId);
    owners.set(tokens.refresh, userId);
    return { access_token: tokens.access, refresh_token: tokens.refresh, expires_in: 3600, token_type: 'bearer', user: { id: userId, aud: 'authenticated' } };
  }

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl = async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const bearer = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '') ?? null;
    requests.push({ method, path: url.pathname, scope: url.searchParams.get('scope'), token: bearer });

    if (method === 'GET' && url.pathname === '/auth/v1/user') {
      await gates.user?.promise;
      const rejected = bearer ? rejections.get(bearer) : undefined;
      if (rejected) return json(rejected.status, { code: rejected.status, ...(rejected.code ? { error_code: rejected.code } : {}), msg: 'rejected' });
      if (userAnswer) return userAnswer(bearer);
      const owner = bearer ? owners.get(bearer) : undefined;
      return owner ? json(200, { id: owner, aud: 'authenticated' }) : json(401, { code: 401, error_code: 'bad_jwt', msg: 'unknown token' });
    }
    if (method === 'POST' && url.pathname === '/auth/v1/verify') return json(200, issue(nextUser));
    if (method === 'POST' && url.pathname === '/auth/v1/token') {
      const owner = owners.get((JSON.parse(init?.body ?? '{}') as { refresh_token?: string }).refresh_token ?? '');
      return owner ? json(200, issue(owner)) : json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'unknown refresh token' });
    }
    if (method === 'POST' && url.pathname === '/auth/v1/logout') {
      await gates.logout?.promise;
      return new Response(null, { status: 204 });
    }
    return json(404, { code: 404, error_code: 'not_found', msg: url.pathname });
  };

  return {
    fetchImpl,
    requests,
    gates,
    reject: (token: string, code?: string, status = 403) => rejections.set(token, { status, code }),
    answerUser: (answer: typeof userAnswer) => {
      userAnswer = answer;
    },
    json,
    // The SDK issues requests from promise chains, so a test waits for a request to appear.
    async seen(predicate: (request: Request) => boolean) {
      for (let attempt = 0; attempt < 200; attempt++) {
        if (requests.some(predicate)) return;
        await new Promise((resolve) => setImmediate(resolve));
      }
      throw new Error('The expected request never reached the Auth server.');
    },
    signInAs: (userId: string) => {
      nextUser = userId;
    },
    logouts: () => requests.filter((request) => request.path === '/auth/v1/logout'),
  };
}

const storageKey = 'test-auth-token';

function createHarness() {
  const data = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  };
  const server = createAuthServer();
  const client: SupabaseClient = createClient('http://127.0.0.1:54321', 'publishable-key-for-tests', {
    auth: { storage, storageKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    global: { fetch: server.fetchImpl as typeof fetch },
  });
  const gateway = createSupabaseAuthGateway(client);
  const events: AuthEvent[] = [];
  const unsubscribe = gateway.subscribe((event) => events.push(event));
  const stored = () => (data.has(storageKey) ? (JSON.parse(data.get(storageKey) as string) as { access_token: string }) : null);
  return { client, gateway, server, events, stored, unsubscribe };
}

async function signIn(harness: ReturnType<typeof createHarness>, userId = 'user-a') {
  harness.server.signInAs(userId);
  const outcome = await harness.gateway.verifyOtp('+84912345678', '123456');
  expect(outcome).toEqual({ ok: true, value: { userId } });
  return (harness.stored() as { access_token: string }).access_token;
}

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function start(userId = 'user-a') {
  const harness = createHarness();
  cleanups.push(harness.unsubscribe);
  return signIn(harness, userId).then((token) => ({ ...harness, token }));
}

const userRequests = (harness: ReturnType<typeof createHarness>) => harness.server.requests.filter((request) => request.path === '/auth/v1/user');

describe('identity answers about the stored session', () => {
  test('a valid session is verified with its own access token and left in place', async () => {
    const harness = await start();
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'valid', identity: { userId: 'user-a' } });
    expect(userRequests(harness).map((request) => request.token)).toEqual([harness.token]);
    expect(harness.stored()?.access_token).toBe(harness.token);
    expect(harness.server.logouts()).toHaveLength(0);
  });

  test('the answer concerns the session that was read, even if it is replaced before the request is sent', async () => {
    const harness = await start();
    const read = harness.client.auth.getSession.bind(harness.client.auth);
    let replacement: string | undefined;
    jest.spyOn(harness.client.auth, 'getSession').mockImplementationOnce(async () => {
      const stored = await read();
      replacement = await signIn(harness);
      return stored;
    });
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'valid', identity: { userId: 'user-a' } });
    expect(replacement).not.toBe(harness.token);
    expect(userRequests(harness).map((request) => request.token)).toEqual([harness.token]);
  });

  test('no stored session is an invalid answer and sends nothing to the server', async () => {
    const harness = createHarness();
    cleanups.push(harness.unsubscribe);
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'invalid' });
    expect(harness.server.requests).toHaveLength(0);
  });

  // Statuses and codes come back through the SDK, so the classifier is exercised on the
  // error objects the SDK really produces. 'removedByGateway' counts the local sign-out
  // request that follows a refusal; session_not_found is removed by the SDK itself.
  test.each([
    [403, 'bad_jwt', 'invalid', 1],
    [401, 'bad_jwt', 'invalid', 1],
    [403, 'session_expired', 'invalid', 1],
    [403, 'session_not_found', 'invalid', 0],
    [403, 'user_not_found', 'invalid', 1],
    [403, 'user_banned', 'invalid', 1],
    [400, 'refresh_token_not_found', 'invalid', 1],
    [400, 'refresh_token_already_used', 'invalid', 1],
    // Same statuses, different reasons: not evidence that the session is dead.
    [403, 'not_admin', 'unreachable', 0],
    [403, 'insufficient_aal', 'unreachable', 0],
    [403, 'captcha_failed', 'unreachable', 0],
    [403, 'phone_provider_disabled', 'unreachable', 0],
    [403, undefined, 'unreachable', 0],
    [404, undefined, 'unreachable', 0],
    [404, 'identity_not_found', 'unreachable', 0],
    [401, undefined, 'unreachable', 0],
    [429, 'over_request_rate_limit', 'unreachable', 0],
    [500, 'unexpected_failure', 'unreachable', 0],
    [502, undefined, 'unreachable', 0],
    [503, undefined, 'unreachable', 0],
  ] as const)('HTTP %s (%s) is %s', async (status, code, expected, signOutRequests) => {
    const harness = await start();
    harness.server.reject(harness.token, code, status);
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: expected });
    expect(harness.stored() === null).toBe(expected === 'invalid');
    expect(harness.server.logouts().map((request) => request.scope)).toEqual(signOutRequests === 0 ? [] : ['local']);
  });

  test('a transport failure is unreachable and keeps the session', async () => {
    const harness = await start();
    harness.server.answerUser(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'unreachable' });
    expect(harness.stored()?.access_token).toBe(harness.token);
  });

  test.each([
    ['an empty success payload', {}],
    ['a user without an id', { aud: 'authenticated' }],
    ['a non-string id', { id: 42 }],
    ['an empty id', { id: '' }],
  ])('%s is never a verified identity', async (_name, body) => {
    const harness = await start();
    harness.server.answerUser(async () => harness.server.json(200, body));
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'unreachable' });
    expect(harness.stored()?.access_token).toBe(harness.token);
  });
});

describe('removing a refused session', () => {
  test('signs the refused session out locally with its own token and announces it before answering', async () => {
    const harness = await start();
    harness.server.reject(harness.token, 'bad_jwt');
    expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'invalid' });
    expect(harness.stored()).toBeNull();
    expect(harness.server.logouts()).toEqual([{ method: 'POST', path: '/auth/v1/logout', scope: 'local', token: harness.token }]);
    expect(harness.events).toContainEqual({ type: 'signed_out' });
  });

  test('a session the SDK already dropped while the answer was pending needs no further sign-out', async () => {
    const harness = await start();
    harness.server.reject(harness.token, 'bad_jwt');
    harness.server.gates.user = hold();
    const answer = harness.gateway.verifyIdentity();
    await harness.server.seen((request) => request.path === '/auth/v1/user');
    await harness.client.auth.signOut({ scope: 'local' });
    harness.server.gates.user.release();
    expect(await answer).toEqual({ status: 'invalid' });
    // Only the explicit sign-out above reached the server.
    expect(harness.server.logouts()).toHaveLength(1);
  });

  // Replacement BEFORE the stored session is compared with the refused token. This is
  // the same-account case that an account-keyed removal got wrong.
  test.each([
    ['the same account signs in again', 'user-a'],
    ['another account signs in', 'user-b'],
  ])('%s while the answer is pending: the new session is kept and the answer is not applied to it', async (_name, userId) => {
    const harness = await start();
    harness.server.reject(harness.token, 'bad_jwt');
    harness.server.gates.user = hold();
    const answer = harness.gateway.verifyIdentity();
    await harness.server.seen((request) => request.path === '/auth/v1/user');

    harness.server.signInAs(userId);
    expect(await harness.gateway.verifyOtp('+84912345678', '123456')).toEqual({ ok: true, value: { userId } });
    const replacement = harness.stored()?.access_token;
    expect(replacement).not.toBe(harness.token);

    harness.server.gates.user.release();
    expect(await answer).toEqual({ status: 'unreachable' });
    expect(harness.stored()?.access_token).toBe(replacement);
    expect(harness.server.logouts()).toHaveLength(0);
    expect(harness.events).not.toContainEqual({ type: 'signed_out' });
  });

  test('a token refresh while the answer is pending keeps the refreshed session', async () => {
    const harness = await start();
    harness.server.reject(harness.token, 'bad_jwt');
    harness.server.gates.user = hold();
    const answer = harness.gateway.verifyIdentity();
    await harness.server.seen((request) => request.path === '/auth/v1/user');

    const refreshed = await harness.client.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    const replacement = harness.stored()?.access_token;
    expect(replacement).not.toBe(harness.token);

    harness.server.gates.user.release();
    expect(await answer).toEqual({ status: 'unreachable' });
    expect(harness.stored()?.access_token).toBe(replacement);
    expect(harness.server.logouts()).toHaveLength(0);
  });

  // Replacement AFTER the comparison. The SDK has no lock and no compare-and-remove, and
  // signOut() removes whichever session is stored when it finishes, so these two windows
  // are NOT closed. The tests pin the SDK behaviour so a change in it is noticed; they do
  // not endorse the outcome, which fails closed: the user is signed out and signs in again.
  describe('known SDK limit: replacement after the comparison', () => {
    test('between the comparison and the start of signOut(), the new session is signed out and revoked', async () => {
      const harness = await start();
      harness.server.reject(harness.token, 'bad_jwt');
      const original = harness.client.auth.signOut.bind(harness.client.auth);
      let replacement: string | undefined;
      jest.spyOn(harness.client.auth, 'signOut').mockImplementationOnce(async (options) => {
        replacement = await signIn(harness);
        return original(options);
      });
      expect(await harness.gateway.verifyIdentity()).toEqual({ status: 'invalid' });
      expect(replacement).not.toBe(harness.token);
      expect(harness.stored()).toBeNull();
      expect(harness.server.logouts().map((request) => request.token)).toEqual([replacement]);
    });

    test('the SDK itself removes whichever session is stored when the server reports session_not_found for the token it was sent', async () => {
      const harness = await start();
      harness.server.reject(harness.token, 'session_not_found');
      harness.server.gates.user = hold();
      const answer = harness.gateway.verifyIdentity();
      await harness.server.seen((request) => request.path === '/auth/v1/user');

      const replacement = await signIn(harness);
      expect(harness.stored()?.access_token).toBe(replacement);

      harness.server.gates.user.release();
      expect(await answer).toEqual({ status: 'invalid' });
      expect(harness.stored()).toBeNull();
      expect(harness.server.logouts()).toHaveLength(0);
    });

    test('while signOut() waits for the server, a new session is removed with the refused one', async () => {
      const harness = await start();
      harness.server.reject(harness.token, 'bad_jwt');
      harness.server.gates.logout = hold();
      const answer = harness.gateway.verifyIdentity();
      await harness.server.seen((request) => request.path === '/auth/v1/logout');

      const replacement = await signIn(harness);
      expect(harness.stored()?.access_token).toBe(replacement);

      harness.server.gates.logout.release();
      expect(await answer).toEqual({ status: 'invalid' });
      expect(harness.stored()).toBeNull();
      expect(harness.server.logouts().map((request) => request.token)).toEqual([harness.token]);
    });
  });
});
