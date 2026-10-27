import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { AuthGateway, AuthOutcome } from '../auth/auth-gateway';
import type { CapabilityRepository } from '../capability/capability-repository';
import type { AppMode } from '../mode/app-mode';
import type { PreferredModeStore } from '../mode/preferred-mode-store';
import { withDeadline } from './deadline';
import { accessReducer, deriveAccess, initialAccessState, type AccessView } from './access-reducer';

export type AccessServices = {
  auth: AuthGateway;
  capabilities: CapabilityRepository;
  preferredMode: PreferredModeStore;
};

export type AccessApi = AccessView & {
  requestOtp(phoneE164: string): Promise<AuthOutcome>;
  verifyOtp(code: string): Promise<AuthOutcome>;
  cancelOtp(): void;
  signOut(): Promise<AuthOutcome>;
  switchMode(mode: AppMode): void;
  recheck(): void;
  setIntent(intent: AppMode | null): void;
  dismissNotice(): void;
};

const AccessContext = createContext<AccessApi | null>(null);

// Upper bounds that keep an offline or hanging backend from holding the app on a
// splash screen or leaving a stale Worker decision in place. Only the capability
// lookup is cancelled at its deadline (AbortSignal); Auth calls and storage reads
// cannot be aborted, so those are abandoned and their late answers discarded.
export const accessTimeouts = { restoreMs: 8000, identityMs: 8000, capabilityMs: 10_000, preferenceMs: 5000 } as const;
const resendCooldownMs = 60_000;

export function AccessProvider({ services, children }: { services: AccessServices; children: ReactNode }) {
  const { auth, capabilities, preferredMode } = services;
  const [state, dispatch] = useReducer(accessReducer, initialAccessState);
  const { userId, requestId, bootstrapped, preferenceLoaded, selectedMode, otpPhone, identityPending, identityRequest } = state;

  // Session events and the stored-session restore. Events only forward values: they
  // describe a claim, and the identity check below is what verifies it.
  useEffect(() => {
    let active = true;
    const unsubscribe = auth.subscribe((event) => {
      if (!active) return;
      if (event.type === 'signed_out') dispatch({ type: 'session_ended' });
      else dispatch({ type: 'session_event', event: event.type, userId: event.identity.userId });
    });
    auth.setForeground(AppState.currentState === 'active');
    const appState = AppState.addEventListener('change', (next) => {
      auth.setForeground(next === 'active');
      if (next === 'active') dispatch({ type: 'recheck_requested' });
    });
    void withDeadline(() => auth.restoreSession(), accessTimeouts.restoreMs, null).then((restored) => {
      if (active) dispatch({ type: 'restore_settled', userId: restored?.userId ?? null });
    });
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
    };
  }, [auth]);

  // Server-side identity check (getUser). A refused session is removed by the gateway
  // before the answer returns. Unreachable and unknown outcomes keep the session but
  // leave the identity unverified.
  useEffect(() => {
    if (!identityPending) return;
    let active = true;
    void withDeadline(() => auth.verifyIdentity(), accessTimeouts.identityMs, { status: 'unreachable' as const }).then((check) => {
      if (active) dispatch({ type: 'identity_checked', request: identityRequest, check });
    });
    return () => {
      active = false;
    };
  }, [auth, identityPending, identityRequest]);

  // Authoritative capability lookup; a newer request supersedes (and aborts) older ones.
  useEffect(() => {
    if (!bootstrapped || userId === null) return;
    let active = true;
    const controller = new AbortController();
    void withDeadline(
      () => capabilities.fetchCapabilities({ userId, signal: controller.signal }),
      accessTimeouts.capabilityMs,
      { kind: 'error' as const, reason: 'unavailable' as const },
      () => controller.abort(),
    ).then((result) => {
      if (active) dispatch({ type: 'capability_received', requestId, userId, result });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [capabilities, userId, requestId, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) return;
    if (userId === null) {
      void preferredMode.clear().catch(() => undefined);
      return;
    }
    let active = true;
    void withDeadline(() => preferredMode.load(userId), accessTimeouts.preferenceMs, null).then((mode) => {
      if (active) dispatch({ type: 'preference_loaded', userId, mode });
    });
    return () => {
      active = false;
    };
  }, [preferredMode, userId, bootstrapped]);

  // Cosmetic preference: losing a write only costs the remembered mode.
  useEffect(() => {
    if (userId === null || !preferenceLoaded) return;
    void preferredMode.save(userId, selectedMode).catch(() => undefined);
  }, [preferredMode, userId, preferenceLoaded, selectedMode]);

  const requestOtp = useCallback(
    async (phoneE164: string) => {
      const outcome = await auth.requestOtp(phoneE164);
      const resendAt = Date.now() + resendCooldownMs;
      if (outcome.ok) dispatch({ type: 'otp_requested', phone: phoneE164, resendAt });
      else if (outcome.failure === 'rate_limited') dispatch({ type: 'otp_throttled', resendAt });
      return outcome;
    },
    [auth],
  );

  const verifyOtp = useCallback(
    async (code: string): Promise<AuthOutcome> => {
      if (otpPhone === null) return { ok: false, failure: 'unknown' };
      const outcome = await auth.verifyOtp(otpPhone, code);
      if (!outcome.ok) return outcome;
      dispatch({ type: 'otp_verified', userId: outcome.value.userId });
      return { ok: true, value: undefined };
    },
    [auth, otpPhone],
  );

  const signOut = useCallback(async () => {
    const outcome = await auth.signOut();
    dispatch({ type: 'session_ended' });
    return outcome;
  }, [auth]);

  const view = useMemo(() => deriveAccess(state), [state]);
  const api = useMemo<AccessApi>(
    () => ({
      ...view,
      requestOtp,
      verifyOtp,
      cancelOtp: () => dispatch({ type: 'otp_cleared' }),
      signOut,
      switchMode: (mode) => dispatch({ type: 'mode_requested', mode }),
      recheck: () => dispatch({ type: 'recheck_requested' }),
      setIntent: (intent) => dispatch({ type: 'intent_set', intent }),
      dismissNotice: () => dispatch({ type: 'notice_dismissed' }),
    }),
    [view, requestOtp, verifyOtp, signOut],
  );

  return <AccessContext.Provider value={api}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessApi {
  const value = useContext(AccessContext);
  if (!value) throw new Error('useAccess must be used inside AccessProvider.');
  return value;
}
