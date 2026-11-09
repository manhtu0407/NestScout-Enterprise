import type { SupabaseClient } from '@supabase/supabase-js';

import { classifySocialError } from './auth-errors';
import type { AuthGateway, AuthOutcome, SessionIdentity, SocialProvider } from './auth-gateway';
import type { SocialRuntime } from './social-runtime';

type SocialSignInApi = Pick<AuthGateway, 'signInWithProvider' | 'completeRedirect'>;

const deniedErrors: ReadonlySet<string> = new Set(['access_denied', 'user_cancelled_authorize']);

function identityOf(user: unknown): SessionIdentity | null {
  const id = (user as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? { userId: id } : null;
}

function callbackParams(url: string): URLSearchParams {
  const parsed = new URL(url);
  const merged = new URLSearchParams(parsed.search);
  for (const [key, value] of new URLSearchParams(parsed.hash.replace(/^#/, ''))) if (!merged.has(key)) merged.set(key, value);
  return merged;
}

export function createSocialSignIn(client: SupabaseClient, runtime: SocialRuntime | null): SocialSignInApi {
  async function exchange(url: string): Promise<AuthOutcome<SessionIdentity>> {
    const params = callbackParams(url);
    const providerError = params.get('error');
    if (providerError) return { ok: false, failure: deniedErrors.has(providerError) ? 'cancelled' : 'unknown' };
    const code = params.get('code');
    if (!code) return { ok: false, failure: 'unknown' };
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, failure: classifySocialError(error) };
    const identity = identityOf(data?.session?.user);
    return identity ? { ok: true, value: identity } : { ok: false, failure: 'unknown' };
  }

  async function withIdToken(runtimeApi: SocialRuntime): Promise<AuthOutcome<SessionIdentity> | null> {
    const credential = await runtimeApi.appleCredential();
    if (credential.status === 'cancelled') return { ok: false, failure: 'cancelled' };
    if (credential.status === 'unavailable') return null;
    const { data, error } = await client.auth.signInWithIdToken({ provider: 'apple', token: credential.token, nonce: credential.nonce });
    if (error) return { ok: false, failure: classifySocialError(error) };
    const identity = identityOf(data?.session?.user);
    return identity ? { ok: true, value: identity } : { ok: false, failure: 'unknown' };
  }

  async function viaBrowser(provider: SocialProvider, runtimeApi: SocialRuntime) {
    const redirectTo = runtimeApi.redirectUrl();
    const { data, error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: !runtimeApi.navigatesPage } });
    if (error) return { ok: false, failure: classifySocialError(error) } as const;
    if (runtimeApi.navigatesPage) return { ok: true, value: { status: 'redirecting' } } as const;
    if (!data?.url) return { ok: false, failure: 'unknown' } as const;
    const result = await runtimeApi.openBrowser(data.url, redirectTo);
    if (result.type !== 'success') return { ok: false, failure: 'cancelled' } as const;
    const outcome = await exchange(result.url);
    return outcome.ok ? { ok: true, value: { status: 'signed_in', identity: outcome.value } } as const : outcome;
  }

  return {
    async signInWithProvider(provider) {
      if (runtime === null) return { ok: false, failure: 'provider_unavailable' };
      try {
        if (provider === 'apple') {
          const native = await withIdToken(runtime);
          if (native !== null) return native.ok ? { ok: true, value: { status: 'signed_in', identity: native.value } } : native;
        }
        return await viaBrowser(provider, runtime);
      } catch {
        return { ok: false, failure: 'unknown' };
      }
    },

    async completeRedirect() {
      if (runtime === null) return null;
      const url = runtime.pendingCallback();
      if (url === null) return null;
      runtime.clearCallback();
      try {
        return await exchange(url);
      } catch {
        return { ok: false, failure: 'unknown' };
      }
    },
  };
}
