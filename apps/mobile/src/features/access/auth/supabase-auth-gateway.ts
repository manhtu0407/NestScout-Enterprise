import { isAuthApiError, isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';

import { classifyAuthError } from './auth-errors';
import type { AuthGateway, IdentityCheck, SessionIdentity } from './auth-gateway';

const eventTypes = {
  SIGNED_IN: 'signed_in',
  TOKEN_REFRESHED: 'refreshed',
  USER_UPDATED: 'updated',
} as const;

// getUser() is answered by the Auth server, so it is the identity authority. Only a
// structured answer that names a dead session or account ends the session; HTTP
// status alone is not trusted (403/404 also mean unsupported features, rate limits
// and project misconfiguration). Anything unrecognised, 5xx, 429 and transport
// failures stay "unreachable": the session is kept but nothing is authorized.
// Codes: https://supabase.com/docs/guides/auth/debugging/error-codes
const sessionRejectedCodes: ReadonlySet<string> = new Set([
  'bad_jwt',
  'session_expired',
  'session_not_found',
  'user_not_found',
  'user_banned',
  'refresh_token_not_found',
  'refresh_token_already_used',
]);

export function classifyIdentityError(error: unknown): IdentityCheck {
  // The SDK maps the session_not_found response to AuthSessionMissingError.
  if (isAuthSessionMissingError(error)) return { status: 'invalid' };
  if (isAuthApiError(error) && error.code && sessionRejectedCodes.has(error.code)) return { status: 'invalid' };
  return { status: 'unreachable' };
}

function identityOf(user: unknown): SessionIdentity | null {
  const id = (user as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? { userId: id } : null;
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
        // A session returned by this call was issued by the Auth server for the code
        // just confirmed, which is what lets the caller treat it as a verified login.
        const identity = identityOf(data?.session?.user);
        return identity ? { ok: true, value: identity } : { ok: false, failure: 'unknown' };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },

    async restoreSession() {
      // Read from storage and not server-checked: an unverified claim only.
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      return identityOf(data?.session?.user);
    },

    async verifyIdentity(): Promise<IdentityCheck> {
      try {
        const { data, error } = await client.auth.getUser();
        if (error) return classifyIdentityError(error);
        const identity = identityOf(data?.user);
        return identity ? { status: 'valid', identity } : { status: 'unreachable' };
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
