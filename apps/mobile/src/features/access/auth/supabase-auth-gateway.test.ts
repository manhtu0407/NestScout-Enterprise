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

  test('identity check: an unreadable stored session or a thrown error is unreachable', async () => {
    const readFailure = createSupabaseAuthGateway(stubClient({ getSession: async () => ({ data: { session: null }, error: new AuthRetryableFetchError('offline', 0) }) }));
    expect(await readFailure.verifyIdentity()).toEqual({ status: 'unreachable' });
    const unknownFailure = createSupabaseAuthGateway(stubClient({ getSession: async () => ({ data: { session: null }, error: new AuthUnknownError('odd', new Error('cause')) }) }));
    expect(await unknownFailure.verifyIdentity()).toEqual({ status: 'unreachable' });
    const missing = createSupabaseAuthGateway(stubClient({ getSession: async () => ({ data: { session: null }, error: new AuthSessionMissingError() }) }));
    expect(await missing.verifyIdentity()).toEqual({ status: 'invalid' });
    const thrown = createSupabaseAuthGateway(stubClient({ getSession: () => Promise.reject(new Error('storage')) }));
    expect(await thrown.verifyIdentity()).toEqual({ status: 'unreachable' });
  });

  test('identity check: a refused session that cannot be removed leaves the answer unapplied', async () => {
    const session = { data: { session: { access_token: 'token-1' } }, error: null };
    const gateway = createSupabaseAuthGateway(stubClient({
      getSession: async () => session,
      getUser: async () => ({ data: { user: null }, error: new AuthApiError('invalid JWT', 403, 'bad_jwt') }),
      signOut: async () => {
        throw new Error('keychain');
      },
    }));
    expect(await gateway.verifyIdentity()).toEqual({ status: 'unreachable' });
  });

  test('identity check: a refused session whose removal returns an error is not reported as removed', async () => {
    const session = { data: { session: { access_token: 'token-1' } }, error: null };
    const gateway = createSupabaseAuthGateway(stubClient({
      getSession: async () => session,
      getUser: async () => ({ data: { user: null }, error: new AuthApiError('invalid JWT', 403, 'bad_jwt') }),
      signOut: async () => ({ error: new AuthRetryableFetchError('offline', 0) }),
    }));
    expect(await gateway.verifyIdentity()).toEqual({ status: 'unreachable' });
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

  test('a sign-out that returns an error or throws is a failure', async () => {
    const returned = createSupabaseAuthGateway(stubClient({ signOut: async () => ({ error: new AuthRetryableFetchError('offline', 0) }) }));
    expect(await returned.signOut()).toEqual({ ok: false, failure: 'network' });
    const thrown = createSupabaseAuthGateway(stubClient({ signOut: () => Promise.reject(new Error('keychain')) }));
    expect(await thrown.signOut()).toEqual({ ok: false, failure: 'network' });
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
