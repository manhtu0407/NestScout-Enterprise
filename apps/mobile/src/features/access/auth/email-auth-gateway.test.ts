import { AuthApiError, type SupabaseClient } from '@supabase/supabase-js';

import { createSupabaseAuthGateway } from './supabase-auth-gateway';

function stubClient(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient;
}

const credentials = { email: 'ten@gmail.com', password: 'mat-khau-dai-123' };
const redirect = { redirectUrl: () => 'nestscout://auth/callback' } as never;

describe('email sign-up through the gateway', () => {
  test('creates the account with the callback redirect and reports an immediate session', async () => {
    const signUp = jest.fn(async () => ({ data: { session: { user: { id: 'user-e' } } }, error: null }));
    const gateway = createSupabaseAuthGateway(stubClient({ signUp }), redirect);
    expect(await gateway.signUpWithEmail(credentials)).toEqual({ ok: true, value: { status: 'signed_in', identity: { userId: 'user-e' } } });
    expect(signUp).toHaveBeenCalledWith({ ...credentials, options: { emailRedirectTo: 'nestscout://auth/callback' } });
  });

  test('reports confirmation required when no session is issued', async () => {
    const gateway = createSupabaseAuthGateway(stubClient({ signUp: async () => ({ data: { user: { id: 'u' }, session: null }, error: null }) }));
    expect(await gateway.signUpWithEmail(credentials)).toEqual({ ok: true, value: { status: 'confirmation_required' } });
  });

  test.each([
    ['user_already_exists', 422, 'email_taken'],
    ['weak_password', 422, 'weak_password'],
    ['signup_disabled', 422, 'signup_disabled'],
    ['over_email_send_rate_limit', 429, 'rate_limited'],
  ] as const)('maps %s to %s', async (code, status, failure) => {
    const gateway = createSupabaseAuthGateway(stubClient({ signUp: async () => ({ data: { session: null }, error: new AuthApiError('refused', status, code) }) }));
    expect(await gateway.signUpWithEmail(credentials)).toEqual({ ok: false, failure });
  });

  test('a thrown transport error is a network failure without leaking its message', async () => {
    const gateway = createSupabaseAuthGateway(stubClient({ signUp: async () => { throw new TypeError('secret detail'); } }));
    expect(await gateway.signUpWithEmail(credentials)).toEqual({ ok: false, failure: 'network' });
  });
});

describe('email sign-in through the gateway', () => {
  test('signs in with the password grant and reports the identity', async () => {
    const signInWithPassword = jest.fn(async () => ({ data: { session: { user: { id: 'user-e' } } }, error: null }));
    const gateway = createSupabaseAuthGateway(stubClient({ signInWithPassword }));
    expect(await gateway.signInWithEmail(credentials)).toEqual({ ok: true, value: { userId: 'user-e' } });
    expect(signInWithPassword).toHaveBeenCalledWith(credentials);
  });

  test.each([
    ['invalid_credentials', 400, 'invalid_credentials'],
    ['email_not_confirmed', 400, 'email_not_confirmed'],
  ] as const)('maps %s to %s', async (code, status, failure) => {
    const gateway = createSupabaseAuthGateway(stubClient({ signInWithPassword: async () => ({ data: { session: null }, error: new AuthApiError('refused', status, code) }) }));
    expect(await gateway.signInWithEmail(credentials)).toEqual({ ok: false, failure });
  });

  test('a response without a session is not a sign-in', async () => {
    const gateway = createSupabaseAuthGateway(stubClient({ signInWithPassword: async () => ({ data: { session: null }, error: null }) }));
    expect(await gateway.signInWithEmail(credentials)).toEqual({ ok: false, failure: 'unknown' });
  });
});
