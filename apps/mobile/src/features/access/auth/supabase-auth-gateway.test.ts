import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError, type SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseAuthGateway } from './supabase-auth-gateway';

function stubClient(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient;
}

describe('supabase auth gateway', () => {
  test('requests a code with the documented signInWithOtp contract', async () => {
    const signInWithOtp = jest.fn(async () => ({ data: {}, error: null }));
    const gateway = createSupabaseAuthGateway(stubClient({ signInWithOtp }));
    expect(await gateway.requestOtp('+84912345678')).toEqual({ ok: true, value: undefined });
    expect(signInWithOtp).toHaveBeenCalledWith({ phone: '+84912345678', options: { shouldCreateUser: true } });
  });

  test('verifies with type sms and reports success only when a session is returned', async () => {
    const verifyOtp = jest.fn(async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }));
    const gateway = createSupabaseAuthGateway(stubClient({ verifyOtp }));
    expect(await gateway.verifyOtp('+84912345678', '123456')).toEqual({ ok: true, value: { userId: 'user-a' } });
    expect(verifyOtp).toHaveBeenCalledWith({ phone: '+84912345678', token: '123456', type: 'sms' });

    const noSession = createSupabaseAuthGateway(stubClient({ verifyOtp: async () => ({ data: { session: null }, error: null }) }));
    expect(await noSession.verifyOtp('+84912345678', '123456')).toEqual({ ok: false, failure: 'unknown' });
  });

  test('maps Auth errors and thrown transport errors without leaking messages', async () => {
    const expired = new AuthApiError('Token has expired or is invalid', 403, 'otp_expired');
    const gateway = createSupabaseAuthGateway(stubClient({
      verifyOtp: async () => ({ data: { session: null }, error: expired }),
      signInWithOtp: async () => {
        throw new TypeError('Network request failed');
      },
    }));
    expect(await gateway.verifyOtp('+84912345678', '000000')).toEqual({ ok: false, failure: 'expired_code' });
    expect(await gateway.requestOtp('+84912345678')).toEqual({ ok: false, failure: 'network' });
  });

  test('restores a stored session and treats an error as signed out', async () => {
    const present = createSupabaseAuthGateway(stubClient({ getSession: async () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }) }));
    expect(await present.restoreSession()).toEqual({ userId: 'user-a' });
    const failed = createSupabaseAuthGateway(stubClient({ getSession: async () => ({ data: { session: null }, error: new Error('x') }) }));
    expect(await failed.restoreSession()).toBeNull();
  });

  test('identity verification separates a rejected session from an unreachable server', async () => {
    const check = (result: unknown) => createSupabaseAuthGateway(stubClient({ getUser: async () => result })).verifyIdentity();
    expect(await check({ data: { user: { id: 'user-a' } }, error: null })).toEqual({ status: 'valid', identity: { userId: 'user-a' } });
    expect(await check({ data: { user: null }, error: new AuthApiError('invalid JWT', 401, 'bad_jwt') })).toEqual({ status: 'invalid' });
    expect(await check({ data: { user: null }, error: new AuthRetryableFetchError('offline', 0) })).toEqual({ status: 'unreachable' });
    const thrown = createSupabaseAuthGateway(stubClient({ getUser: async () => { throw new TypeError('offline'); } }));
    expect(await thrown.verifyIdentity()).toEqual({ status: 'unreachable' });
  });

  test.each([
    [403, 'bad_jwt', 'invalid'],
    [401, 'bad_jwt', 'invalid'],
    [403, 'session_expired', 'invalid'],
    [403, 'session_not_found', 'invalid'],
    [403, 'user_not_found', 'invalid'],
    [403, 'user_banned', 'invalid'],
    [400, 'refresh_token_not_found', 'invalid'],
    [400, 'refresh_token_already_used', 'invalid'],
    // Same statuses, different reasons: not evidence that the session is dead.
    [403, 'not_admin', 'unreachable'],
    [403, 'insufficient_aal', 'unreachable'],
    [403, 'captcha_failed', 'unreachable'],
    [403, 'phone_provider_disabled', 'unreachable'],
    [403, undefined, 'unreachable'],
    [404, undefined, 'unreachable'],
    [404, 'identity_not_found', 'unreachable'],
    [401, undefined, 'unreachable'],
    [429, 'over_request_rate_limit', 'unreachable'],
    [500, 'unexpected_failure', 'unreachable'],
    [502, undefined, 'unreachable'],
    [503, undefined, 'unreachable'],
  ] as const)('identity check: HTTP %s (%s) is %s', async (status, code, expected) => {
    const gateway = createSupabaseAuthGateway(stubClient({ getUser: async () => ({ data: { user: null }, error: new AuthApiError('failed', status, code) }) }));
    expect(await gateway.verifyIdentity()).toEqual({ status: expected });
  });

  test('identity check: a missing session is invalid and an unclassified error never ends the session', async () => {
    const check = (error: Error) => createSupabaseAuthGateway(stubClient({ getUser: async () => ({ data: { user: null }, error }) })).verifyIdentity();
    expect(await check(new AuthSessionMissingError())).toEqual({ status: 'invalid' });
    expect(await check(new AuthUnknownError('odd', new Error('cause')))).toEqual({ status: 'unreachable' });
    expect(await check(new Error('anything else'))).toEqual({ status: 'unreachable' });
  });

  test.each([
    ['an empty success payload', { data: {}, error: null }],
    ['a null user without an error', { data: { user: null }, error: null }],
    ['a null payload', { data: null, error: null }],
    ['a user without an id', { data: { user: {} }, error: null }],
    ['a non-string id', { data: { user: { id: 42 } }, error: null }],
    ['an empty id', { data: { user: { id: '' } }, error: null }],
  ])('identity check: %s is never a verified identity', async (_name, result) => {
    const gateway = createSupabaseAuthGateway(stubClient({ getUser: async () => result }));
    expect(await gateway.verifyIdentity()).toEqual({ status: 'unreachable' });
  });

  test('identity check: a rejected promise and a thrown error are unreachable', async () => {
    const rejected = createSupabaseAuthGateway(stubClient({ getUser: () => Promise.reject(new Error('boom')) }));
    expect(await rejected.verifyIdentity()).toEqual({ status: 'unreachable' });
  });

  test('restore reports an unverified claim only and ignores a malformed stored session', async () => {
    const restore = (result: unknown) => createSupabaseAuthGateway(stubClient({ getSession: async () => result })).restoreSession();
    expect(await restore({ data: { session: { user: {} } }, error: null })).toBeNull();
    expect(await restore({ data: { session: { user: { id: '' } } }, error: null })).toBeNull();
    expect(await restore({ data: null, error: null })).toBeNull();
  });

  test('verifyOtp does not log a user in on malformed success payloads or thrown errors', async () => {
    const verify = (result: () => unknown) => createSupabaseAuthGateway(stubClient({ verifyOtp: async () => result() })).verifyOtp('+84912345678', '123456');
    expect(await verify(() => ({ data: { session: { user: {} } }, error: null }))).toEqual({ ok: false, failure: 'unknown' });
    expect(await verify(() => ({ data: null, error: null }))).toEqual({ ok: false, failure: 'unknown' });
    expect(
      await verify(() => {
        throw new TypeError('offline');
      }),
    ).toEqual({ ok: false, failure: 'network' });
  });

  test('signs out the local device session', async () => {
    const signOut = jest.fn(async () => ({ error: null }));
    expect(await createSupabaseAuthGateway(stubClient({ signOut })).signOut()).toEqual({ ok: true, value: undefined });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  describe('discardSession', () => {
    const discard = (getSession: () => unknown, signOut = jest.fn(async (): Promise<{ error: Error | null }> => ({ error: null }))) => ({
      signOut,
      run: () => createSupabaseAuthGateway(stubClient({ getSession: async () => getSession(), signOut })).discardSession('user-a'),
    });

    test('removes the local session while it still belongs to the account', async () => {
      const { run, signOut } = discard(() => ({ data: { session: { user: { id: 'user-a' } } }, error: null }));
      expect(await run()).toEqual({ ok: true, value: undefined });
      expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    test.each([
      ['a different account now holds the session', { data: { session: { user: { id: 'user-b' } } }, error: null }],
      ['the client already dropped the session', { data: { session: null }, error: null }],
    ])('does nothing when %s', async (_name, result) => {
      const { run, signOut } = discard(() => result);
      expect(await run()).toEqual({ ok: true, value: undefined });
      expect(signOut).not.toHaveBeenCalled();
    });

    test('reports failures without removing a session it could not identify', async () => {
      const unreadable = discard(() => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) }));
      expect(await unreadable.run()).toEqual({ ok: false, failure: 'network' });
      expect(unreadable.signOut).not.toHaveBeenCalled();
      const thrown = discard(() => {
        throw new TypeError('storage');
      });
      expect(await thrown.run()).toEqual({ ok: false, failure: 'network' });
      const failing = discard(
        () => ({ data: { session: { user: { id: 'user-a' } } }, error: null }),
        jest.fn(async () => ({ error: new AuthRetryableFetchError('offline', 0) })),
      );
      expect(await failing.run()).toEqual({ ok: false, failure: 'network' });
    });
  });

  test('forwards auth events as values and unsubscribes on request', () => {
    let handler: (event: string, session: unknown) => void = () => undefined;
    const unsubscribe = jest.fn();
    const onAuthStateChange = jest.fn((callback: typeof handler) => {
      handler = callback;
      return { data: { subscription: { unsubscribe } } };
    });
    const events: unknown[] = [];
    const stop = createSupabaseAuthGateway(stubClient({ onAuthStateChange })).subscribe((event) => events.push(event));
    handler('SIGNED_IN', { user: { id: 'user-a' } });
    handler('TOKEN_REFRESHED', { user: { id: 'user-a' } });
    handler('INITIAL_SESSION', { user: { id: 'user-a' } });
    handler('SIGNED_OUT', null);
    expect(events).toEqual([
      { type: 'signed_in', identity: { userId: 'user-a' } },
      { type: 'refreshed', identity: { userId: 'user-a' } },
      { type: 'signed_out' },
    ]);
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('pauses and resumes token refresh with the app state', () => {
    const startAutoRefresh = jest.fn(async () => undefined);
    const stopAutoRefresh = jest.fn(async () => undefined);
    const gateway = createSupabaseAuthGateway(stubClient({ startAutoRefresh, stopAutoRefresh }));
    gateway.setForeground(true);
    gateway.setForeground(false);
    expect(startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(stopAutoRefresh).toHaveBeenCalledTimes(1);
  });
});
