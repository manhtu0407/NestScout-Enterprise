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
  // The SDK cannot remove "this session only": signOut() removes whichever session is
  // stored when it finishes. The stored session is therefore compared with the refused
  // token first, and a session that replaced it (a new sign-in or a token refresh) is
  // left alone, because this answer was not about it.
  // The comparison and the removal are two SDK calls and the SDK exposes no lock or
  // compare-and-remove, so this is not atomic: signOut() waits for a server request
  // before it removes anything, and a session established during that request is
  // removed with the refused one.
  async function removeRefusedSession(refusedToken: string): Promise<IdentityCheck> {
    const { data, error } = await client.auth.getSession();
    if (error) return classifyIdentityError(error);
    const current = data?.session;
    if (!current) return { status: 'invalid' };
    if (current.access_token !== refusedToken) return { status: 'unreachable' };
    // Revoking a token the server already refused is moot, and the SDK removes the
    // local session even when that request fails. A session that cannot be removed
    // is reported through the returned error, not by throwing, and the answer is then
    // not applied: nothing is authorized and the check is repeated.
    const { error: removalError } = await client.auth.signOut({ scope: 'local' });
    return removalError ? { status: 'unreachable' } : { status: 'invalid' };
  }

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
        // The answer must concern one known session. getUser() without a token reads the
        // stored session itself, which leaves open which session was judged, so the
        // session is read once here and its access token is the one sent to the server.
        const { data: stored, error: storedError } = await client.auth.getSession();
        if (storedError) return classifyIdentityError(storedError);
        const checked = stored?.session;
        if (!checked) return { status: 'invalid' };

        const { data, error } = await client.auth.getUser(checked.access_token);
        if (!error) {
          const identity = identityOf(data?.user);
          return identity ? { status: 'valid', identity } : { status: 'unreachable' };
        }
        const check = classifyIdentityError(error);
        return check.status === 'invalid' ? await removeRefusedSession(checked.access_token) : check;
      } catch {
        return { status: 'unreachable' };
      }
    },

    async signOut() {
      try {
        // A failure after the SDK removed the session is announced as SIGNED_OUT; a
        // failure before it (expired access token, refresh unreachable) leaves the
        // session stored and announces nothing, which is why callers follow events.
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
