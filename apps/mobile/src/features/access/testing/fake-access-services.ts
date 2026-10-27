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
};

// Controllable stand-ins for Supabase Auth and the capability table, used only
// by tests; the production gateway and repository are never replaced at runtime.
export function createFakeAccessServices(options: FakeOptions = {}) {
  let listener: ((event: AuthEvent) => void) | undefined;
  let stored = options.storedMode ?? null;
  const issuedCode = options.issuedCode ?? '654321';
  const signInIdentity = options.signInIdentity ?? { userId: 'user-a' };
  const calls = { requestOtp: [] as string[], verifyOtp: [] as string[], verifyIdentity: 0, signOut: 0, capability: 0, cleared: 0, signals: [] as AbortSignal[] };

  const auth: AuthGateway = {
    async requestOtp(phone) {
      calls.requestOtp.push(phone);
      return options.requestOtp ? options.requestOtp() : { ok: true, value: undefined };
    },
    async verifyOtp(phone, code) {
      calls.verifyOtp.push(code);
      if (code !== issuedCode) return { ok: false, failure: 'invalid_code' };
      listener?.({ type: 'signed_in', identity: signInIdentity });
      return { ok: true, value: signInIdentity };
    },
    restoreSession: options.restore ?? (async () => options.session ?? null),
    verifyIdentity() {
      calls.verifyIdentity += 1;
      if (options.verifyIdentity) return options.verifyIdentity();
      return Promise.resolve(options.identityCheck ?? { status: 'valid', identity: options.session ?? signInIdentity });
    },
    async signOut() {
      calls.signOut += 1;
      listener?.({ type: 'signed_out' });
      return { ok: true, value: undefined };
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
  return { services, calls, emit: (event: AuthEvent) => listener?.(event), storedMode: () => stored };
}
