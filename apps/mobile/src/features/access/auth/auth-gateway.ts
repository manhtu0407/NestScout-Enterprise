export type AuthFailure =
  | 'invalid_code'
  | 'expired_code'
  | 'rate_limited'
  | 'signup_disabled'
  | 'provider_unavailable'
  | 'network'
  | 'cancelled'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'weak_password'
  | 'unknown';

export type AuthOutcome<T = void> = { ok: true; value: T } | { ok: false; failure: AuthFailure };

export type SessionIdentity = { userId: string };

export type SocialProvider = 'google' | 'apple';

export type SocialSignIn = { status: 'signed_in'; identity: SessionIdentity } | { status: 'redirecting' };

export type EmailCredentials = { email: string; password: string };

export type EmailSignUp = { status: 'signed_in'; identity: SessionIdentity } | { status: 'confirmation_required' };

export type IdentityCheck =
  | { status: 'valid'; identity: SessionIdentity }
  | { status: 'invalid' }
  | { status: 'unreachable' };

export type AuthEvent =
  | { type: 'signed_in' | 'refreshed' | 'updated'; identity: SessionIdentity }
  | { type: 'signed_out' };

export type AuthGateway = {
  requestOtp(phoneE164: string): Promise<AuthOutcome>;
  verifyOtp(phoneE164: string, code: string): Promise<AuthOutcome<SessionIdentity>>;
  signInWithProvider(provider: SocialProvider): Promise<AuthOutcome<SocialSignIn>>;
  signUpWithEmail(credentials: EmailCredentials): Promise<AuthOutcome<EmailSignUp>>;
  signInWithEmail(credentials: EmailCredentials): Promise<AuthOutcome<SessionIdentity>>;
  completeRedirect(): Promise<AuthOutcome<SessionIdentity> | null>;
  restoreSession(): Promise<SessionIdentity | null>;
  verifyIdentity(): Promise<IdentityCheck>;
  signOut(): Promise<AuthOutcome>;
  subscribe(listener: (event: AuthEvent) => void): () => void;
  setForeground(active: boolean): void;
};
