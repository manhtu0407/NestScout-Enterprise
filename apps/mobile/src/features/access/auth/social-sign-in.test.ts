import { AuthApiError, type SupabaseClient } from '@supabase/supabase-js';

import type { AppleCredential, BrowserResult, SocialRuntime } from './social-runtime';
import { createSocialSignIn } from './social-sign-in';

const session = { data: { session: { user: { id: 'user-g' } } }, error: null };
const redirectUrl = 'nestscout://auth/callback';

function stubClient(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient;
}

function runtimeOf(overrides: Partial<SocialRuntime> = {}): SocialRuntime {
  return {
    redirectUrl: () => redirectUrl,
    navigatesPage: false,
    openBrowser: async (): Promise<BrowserResult> => ({ type: 'cancel' }),
    appleCredential: async (): Promise<AppleCredential> => ({ status: 'unavailable' }),
    pendingCallback: () => null,
    clearCallback: jest.fn(),
    ...overrides,
  };
}

describe('browser sign-in on a native shell', () => {
  test('opens the provider page, exchanges the returned code and reports the session', async () => {
    const signInWithOAuth = jest.fn(async () => ({ data: { url: 'https://provider.test/auth' }, error: null }));
    const exchangeCodeForSession = jest.fn(async () => session);
    const openBrowser = jest.fn(async (): Promise<BrowserResult> => ({ type: 'success', url: `${redirectUrl}?code=abc123` }));
    const api = createSocialSignIn(stubClient({ signInWithOAuth, exchangeCodeForSession }), runtimeOf({ openBrowser }));
    expect(await api.signInWithProvider('google')).toEqual({ ok: true, value: { status: 'signed_in', identity: { userId: 'user-g' } } });
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: redirectUrl, skipBrowserRedirect: true } });
    expect(openBrowser).toHaveBeenCalledWith('https://provider.test/auth', redirectUrl);
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  test('a dismissed browser never creates a session', async () => {
    const exchangeCodeForSession = jest.fn();
    const api = createSocialSignIn(
      stubClient({ signInWithOAuth: async () => ({ data: { url: 'https://provider.test/auth' }, error: null }), exchangeCodeForSession }),
      runtimeOf(),
    );
    expect(await api.signInWithProvider('google')).toEqual({ ok: false, failure: 'cancelled' });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('a provider denial is a cancellation and any other callback error or missing code is a failure', async () => {
    const exchangeCodeForSession = jest.fn();
    const client = stubClient({ signInWithOAuth: async () => ({ data: { url: 'https://provider.test/auth' }, error: null }), exchangeCodeForSession });
    const returning = (url: string) => createSocialSignIn(client, runtimeOf({ openBrowser: async () => ({ type: 'success', url }) }));
    expect(await returning(`${redirectUrl}?error=access_denied`).signInWithProvider('google')).toEqual({ ok: false, failure: 'cancelled' });
    expect(await returning(`${redirectUrl}#error=server_error`).signInWithProvider('google')).toEqual({ ok: false, failure: 'unknown' });
    expect(await returning(redirectUrl).signInWithProvider('google')).toEqual({ ok: false, failure: 'unknown' });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('a rejected code exchange or a session-less answer is not a sign-in', async () => {
    const opened = { signInWithOAuth: async () => ({ data: { url: 'https://provider.test/auth' }, error: null }) };
    const runtime = runtimeOf({ openBrowser: async () => ({ type: 'success', url: `${redirectUrl}?code=bad` }) });
    const rejected = createSocialSignIn(stubClient({ ...opened, exchangeCodeForSession: async () => ({ data: { session: null }, error: new AuthApiError('invalid flow state', 400, 'flow_state_not_found') }) }), runtime);
    expect(await rejected.signInWithProvider('google')).toEqual({ ok: false, failure: 'unknown' });
    const empty = createSocialSignIn(stubClient({ ...opened, exchangeCodeForSession: async () => ({ data: { session: null }, error: null }) }), runtime);
    expect(await empty.signInWithProvider('google')).toEqual({ ok: false, failure: 'unknown' });
  });

  test('a disabled provider is reported as unavailable', async () => {
    const disabled = new AuthApiError('Unsupported provider: provider is not enabled', 400, 'validation_failed');
    const api = createSocialSignIn(stubClient({ signInWithOAuth: async () => ({ data: { url: null }, error: disabled }) }), runtimeOf());
    expect(await api.signInWithProvider('google')).toEqual({ ok: false, failure: 'provider_unavailable' });
  });

  test('a thrown browser error is reported without leaking its message', async () => {
    const api = createSocialSignIn(
      stubClient({ signInWithOAuth: async () => ({ data: { url: 'https://provider.test/auth' }, error: null }) }),
      runtimeOf({ openBrowser: async () => { throw new Error('secret detail'); } }),
    );
    expect(await api.signInWithProvider('google')).toEqual({ ok: false, failure: 'unknown' });
  });

  test('without a runtime every provider is unavailable', async () => {
    const api = createSocialSignIn(stubClient({}), null);
    expect(await api.signInWithProvider('apple')).toEqual({ ok: false, failure: 'provider_unavailable' });
    expect(await api.completeRedirect()).toBeNull();
  });
});

describe('native Apple sign-in', () => {
  test('exchanges the identity token and the raw nonce through signInWithIdToken', async () => {
    const signInWithIdToken = jest.fn(async () => session);
    const signInWithOAuth = jest.fn();
    const api = createSocialSignIn(
      stubClient({ signInWithIdToken, signInWithOAuth }),
      runtimeOf({ appleCredential: async () => ({ status: 'ok', token: 'id-token', nonce: 'raw-nonce' }) }),
    );
    expect(await api.signInWithProvider('apple')).toEqual({ ok: true, value: { status: 'signed_in', identity: { userId: 'user-g' } } });
    expect(signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'id-token', nonce: 'raw-nonce' });
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  test('a cancelled Apple sheet creates no session and calls nothing', async () => {
    const signInWithIdToken = jest.fn();
    const api = createSocialSignIn(stubClient({ signInWithIdToken }), runtimeOf({ appleCredential: async () => ({ status: 'cancelled' }) }));
    expect(await api.signInWithProvider('apple')).toEqual({ ok: false, failure: 'cancelled' });
    expect(signInWithIdToken).not.toHaveBeenCalled();
  });

  test('Supabase rejecting the token or returning no session is a failure', async () => {
    const credential = runtimeOf({ appleCredential: async () => ({ status: 'ok', token: 't', nonce: 'n' }) });
    const rejected = createSocialSignIn(stubClient({ signInWithIdToken: async () => ({ data: { session: null }, error: new AuthApiError('bad nonce', 400, 'validation_failed') }) }), credential);
    expect(await rejected.signInWithProvider('apple')).toEqual({ ok: false, failure: 'provider_unavailable' });
    const empty = createSocialSignIn(stubClient({ signInWithIdToken: async () => ({ data: { session: null }, error: null }) }), credential);
    expect(await empty.signInWithProvider('apple')).toEqual({ ok: false, failure: 'unknown' });
  });

  test('when the native sheet is unavailable Apple falls back to the browser flow', async () => {
    const signInWithOAuth = jest.fn(async () => ({ data: { url: 'https://apple.test/auth' }, error: null }));
    const api = createSocialSignIn(
      stubClient({ signInWithOAuth, exchangeCodeForSession: async () => session }),
      runtimeOf({ openBrowser: async () => ({ type: 'success', url: `${redirectUrl}?code=xyz` }) }),
    );
    expect(await api.signInWithProvider('apple')).toEqual({ ok: true, value: { status: 'signed_in', identity: { userId: 'user-g' } } });
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'apple', options: { redirectTo: redirectUrl, skipBrowserRedirect: true } });
  });
});

describe('browser redirect sign-in on web', () => {
  const web = (overrides: Partial<SocialRuntime> = {}) => runtimeOf({ navigatesPage: true, redirectUrl: () => 'http://localhost:8085/', ...overrides });

  test('leaves the page for the provider and reports a redirect rather than a session', async () => {
    const signInWithOAuth = jest.fn(async () => ({ data: { url: 'https://provider.test/auth' }, error: null }));
    const openBrowser = jest.fn();
    const api = createSocialSignIn(stubClient({ signInWithOAuth }), web({ openBrowser }));
    expect(await api.signInWithProvider('google')).toEqual({ ok: true, value: { status: 'redirecting' } });
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'http://localhost:8085/', skipBrowserRedirect: false } });
    expect(openBrowser).not.toHaveBeenCalled();
  });

  test('returning with a code exchanges it once and clears the address bar', async () => {
    const exchangeCodeForSession = jest.fn(async () => session);
    const clearCallback = jest.fn();
    const api = createSocialSignIn(stubClient({ exchangeCodeForSession }), web({ pendingCallback: () => 'http://localhost:8085/?code=back1', clearCallback }));
    expect(await api.completeRedirect()).toEqual({ ok: true, value: { userId: 'user-g' } });
    expect(exchangeCodeForSession).toHaveBeenCalledWith('back1');
    expect(clearCallback).toHaveBeenCalledTimes(1);
  });

  test('returning with an error reports it without creating a session', async () => {
    const exchangeCodeForSession = jest.fn();
    const api = createSocialSignIn(stubClient({ exchangeCodeForSession }), web({ pendingCallback: () => 'http://localhost:8085/?error=access_denied&error_description=denied' }));
    expect(await api.completeRedirect()).toEqual({ ok: false, failure: 'cancelled' });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('an ordinary page load has nothing to complete', async () => {
    const api = createSocialSignIn(stubClient({}), web());
    expect(await api.completeRedirect()).toBeNull();
  });
});
