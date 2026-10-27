import type { AuthEvent, AuthGateway, AuthOutcome, IdentityCheck, SessionIdentity } from '../auth/auth-gateway';
import type { CapabilityRepository, CapabilityRequest, CapabilityResult } from '../capability/capability-repository';
import type { AppMode } from '../mode/app-mode';
import type { PreferredModeStore } from '../mode/preferred-mode-store';
import type { AccessServices } from '../state/access-provider';

export type FakeOptions = {
  session?: SessionIdentity | null;
  identityCheck?: IdentityCheck;
  verifyIdentity?: () => Promise<IdentityCheck>;
  capability?: CapabilityResult | ((request: CapabilityRequest) => Promise<CapabilityResult>);
  storedMode?: { userId: string; mode: AppMode } | null;
  restore?: () => Promise<SessionIdentity | null>;
  issuedCode?: string;
  signInIdentity?: SessionIdentity;
  requestOtp?: () => Promise<AuthOutcome>;
  signOut?: () => Promise<AuthOutcome>;
};

export function createFakeAccessServices(options: FakeOptions = {}) {
  let listener: ((event: AuthEvent) => void) | undefined;
  let stored = options.storedMode ?? null;
  const issuedCode = options.issuedCode ?? '654321';
  const signInIdentity = options.signInIdentity ?? { userId: 'user-a' };
  const calls = { requestOtp: [] as string[], verifyOtp: [] as string[], verifyIdentity: 0, signOut: 0, capability: 0, cleared: 0, signals: [] as AbortSignal[] };

  let sequence = 0;
  let current: { userId: string; id: number } | null = options.session ? { userId: options.session.userId, id: ++sequence } : null;
  const establish = (userId: string) => {
    current = { userId, id: ++sequence };
  };

  const auth: AuthGateway = {
    async requestOtp(phone) {
      calls.requestOtp.push(phone);
      return options.requestOtp ? options.requestOtp() : { ok: true, value: undefined };
    },
    async verifyOtp(phone, code) {
      calls.verifyOtp.push(code);
      if (code !== issuedCode) return { ok: false, failure: 'invalid_code' };
      establish(signInIdentity.userId);
      listener?.({ type: 'signed_in', identity: signInIdentity });
      return { ok: true, value: signInIdentity };
    },
    restoreSession: options.restore ?? (async () => options.session ?? null),
    async verifyIdentity() {
      calls.verifyIdentity += 1;
      const judged = current;
      const check = options.verifyIdentity
        ? await options.verifyIdentity()
        : (options.identityCheck ?? { status: 'valid', identity: options.session ?? signInIdentity });
      if (check.status !== 'invalid') return check;
      if (current !== judged) return { status: 'unreachable' };
      if (current !== null) {
        current = null;
        listener?.({ type: 'signed_out' });
      }
      return check;
    },
    async signOut() {
      calls.signOut += 1;
      const outcome = options.signOut ? await options.signOut() : ({ ok: true, value: undefined } as const);
      if (outcome.ok) {
        current = null;
        listener?.({ type: 'signed_out' });
      }
      return outcome;
    },
    subscribe(next) {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    setForeground: () => undefined,
  };

  const capabilities: CapabilityRepository = {
    async fetchCapabilities(request) {
      calls.capability += 1;
      calls.signals.push(request.signal);
      const capability = options.capability ?? { kind: 'resolved', worker: 'none' };
      return typeof capability === 'function' ? capability(request) : capability;
    },
  };

  const preferredMode: PreferredModeStore = {
    load: async (userId) => (stored?.userId === userId ? stored.mode : null),
    save: async (userId, mode) => {
      stored = { userId, mode };
    },
    clear: async () => {
      calls.cleared += 1;
      stored = null;
    },
  };

  const services: AccessServices = { auth, capabilities, preferredMode };
  function emit(event: AuthEvent) {
    if (event.type === 'signed_out') current = null;
    else if (event.type !== 'updated') establish(event.identity.userId);
    listener?.(event);
  }

  return { services, calls, emit, storedMode: () => stored };
}
