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

// `invalid`: the Auth server refused the stored session, and it is already removed from
// the device when this answer is returned. `unreachable`: no answer applies to the
// stored session (offline, server error, unrecognised error, or the session was
// replaced while the check ran); nothing is authorized and nothing is removed.
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
  // Judges the stored session, and removes that same session when the server refuses it.
  verifyIdentity(): Promise<IdentityCheck>;
  signOut(): Promise<AuthOutcome>;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  setForeground(active: boolean): void;
};
