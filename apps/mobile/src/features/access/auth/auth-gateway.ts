export type AuthFailure =
  | 'invalid_code'
  | 'expired_code'
  | 'rate_limited'
  | 'signup_disabled'
  | 'provider_unavailable'
  | 'network'
  | 'unknown';

export type AuthOutcome<T = void> = { ok: true; value: T } | { ok: false; failure: AuthFailure };

export type SessionIdentity = { userId: string };

export type IdentityCheck =
  | { status: 'valid'; identity: SessionIdentity }
  | { status: 'invalid' }
  | { status: 'unreachable' };

export type AuthEvent =
  | { type: 'signed_in' | 'refreshed' | 'updated'; identity: SessionIdentity }
  | { type: 'signed_out' };

// Seam between access state and the Supabase Auth client. Tokens never cross it.
export type AuthGateway = {
  requestOtp(phoneE164: string): Promise<AuthOutcome>;
  verifyOtp(phoneE164: string, code: string): Promise<AuthOutcome<SessionIdentity>>;
  restoreSession(): Promise<SessionIdentity | null>;
  verifyIdentity(): Promise<IdentityCheck>;
  signOut(): Promise<AuthOutcome>;
  // Removes the device session only while it still belongs to `userId`, so removing a
  // dead session can never end a different account that signed in in the meantime.
  discardSession(userId: string): Promise<AuthOutcome>;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  setForeground(active: boolean): void;
};
