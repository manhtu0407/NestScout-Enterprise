import { isAuthApiError, isAuthRetryableFetchError, isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';

import { classifyAuthError } from './auth-errors';
import type { AuthGateway, IdentityCheck } from './auth-gateway';

const eventTypes = {
  SIGNED_IN: 'signed_in',
  TOKEN_REFRESHED: 'refreshed',
  USER_UPDATED: 'updated',
} as const;

// Only an answer that says the session or account is gone ends the session. Server
// trouble (5xx, 429) and transport failures leave the stored session alone.
function classifyIdentityError(error: unknown): IdentityCheck {
  if (isAuthSessionMissingError(error)) return { status: 'invalid' };
  if (isAuthRetryableFetchError(error)) return { status: 'unreachable' };
  if (isAuthApiError(error) && [401, 403, 404].includes(error.status)) return { status: 'invalid' };
  return { status: 'unreachable' };
}

export function createSupabaseAuthGateway(client: SupabaseClient): AuthGateway {
  return {
    async requestOtp(phoneE164) {
      try {
        const { error } = await client.auth.signInWithOtp({ phone: phoneE164, options: { shouldCreateUser: true } });
        return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true, value: undefined };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },

    async verifyOtp(phoneE164, code) {
      try {
        const { data, error } = await client.auth.verifyOtp({ phone: phoneE164, token: code, type: 'sms' });
        if (error) return { ok: false, failure: classifyAuthError(error) };
        if (!data.session) return { ok: false, failure: 'unknown' };
        return { ok: true, value: { userId: data.session.user.id } };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },

    async restoreSession() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      return { userId: data.session.user.id };
    },

    async verifyIdentity(): Promise<IdentityCheck> {
      try {
        const { data, error } = await client.auth.getUser();
        if (error) return classifyIdentityError(error);
        return { status: 'valid', identity: { userId: data.user.id } };
      } catch {
        return { status: 'unreachable' };
      }
    },

    async signOut() {
      try {
        // The local session is removed even when revoking the server session fails.
        const { error } = await client.auth.signOut({ scope: 'local' });
        return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true, value: undefined };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },

    subscribe(listener) {
      // The callback only forwards a value: calling Auth methods inside it can deadlock.
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') listener({ type: 'signed_out' });
        else if (event in eventTypes && session) {
          listener({ type: eventTypes[event as keyof typeof eventTypes], identity: { userId: session.user.id } });
        }
      });
      return () => data.subscription.unsubscribe();
    },

    setForeground(active) {
      if (active) void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    },
  };
}
