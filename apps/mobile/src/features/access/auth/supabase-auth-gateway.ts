import { isAuthApiError, isAuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';

import { classifyAuthError } from './auth-errors';
import type { AuthGateway, IdentityCheck, SessionIdentity } from './auth-gateway';

const eventTypes = {
  SIGNED_IN: 'signed_in',
  TOKEN_REFRESHED: 'refreshed',
  USER_UPDATED: 'updated',
} as const;

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
  if (isAuthSessionMissingError(error)) return { status: 'invalid' };
  if (isAuthApiError(error) && error.code && sessionRejectedCodes.has(error.code)) return { status: 'invalid' };
  return { status: 'unreachable' };
}

function identityOf(user: unknown): SessionIdentity | null {
  const id = (user as { id?: unknown } | null | undefined)?.id;
  return typeof id === 'string' && id.length > 0 ? { userId: id } : null;
}

export function createSupabaseAuthGateway(client: SupabaseClient): AuthGateway {
  async function removeRefusedSession(refusedToken: string): Promise<IdentityCheck> {
    const { data, error } = await client.auth.getSession();
    if (error) return classifyIdentityError(error);
    const current = data?.session;
    if (!current) return { status: 'invalid' };
    if (current.access_token !== refusedToken) return { status: 'unreachable' };
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
        const identity = identityOf(data?.session?.user);
        return identity ? { ok: true, value: identity } : { ok: false, failure: 'unknown' };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },

    async restoreSession() {
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      return identityOf(data?.session?.user);
    },

    async verifyIdentity(): Promise<IdentityCheck> {
      try {
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
        const { error } = await client.auth.signOut({ scope: 'local' });
        return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true, value: undefined };
      } catch {
        return { ok: false, failure: 'network' };
      }
    },

    subscribe(listener) {
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
