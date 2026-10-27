import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { AuthGateway, AuthOutcome } from '../auth/auth-gateway';
import type { CapabilityRepository } from '../capability/capability-repository';
import type { AppMode } from '../mode/app-mode';
import type { PreferredModeStore } from '../mode/preferred-mode-store';
import { accessReducer, deriveAccess, identityAction, initialAccessState, type AccessView } from './access-reducer';

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

const identityTimeoutMs = 8000;
const resendCooldownMs = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function AccessProvider({ services, children }: { services: AccessServices; children: ReactNode }) {
  const { auth, capabilities, preferredMode } = services;
  const [state, dispatch] = useReducer(accessReducer, initialAccessState);
  const { userId, requestId, bootstrapped, preferenceLoaded, selectedMode, otpPhone } = state;

  // Bootstrap and session events. The listener only forwards values to the reducer.
  useEffect(() => {
    let active = true;
    const unsubscribe = auth.subscribe((event) => {
      if (!active) return;
      if (event.type === 'signed_out') dispatch({ type: 'session_ended' });
      else if (event.type === 'signed_in') dispatch({ type: 'session_established', userId: event.identity.userId });
      else dispatch({ type: 'session_refreshed', userId: event.identity.userId });
    });
    auth.setForeground(AppState.currentState === 'active');
    const appState = AppState.addEventListener('change', (next) => {
      auth.setForeground(next === 'active');
      if (next === 'active') dispatch({ type: 'recheck_requested' });
    });
    void (async () => {
      const restored = await auth.restoreSession().catch(() => null);
      if (!restored) return active && dispatch({ type: 'bootstrapped', userId: null, identity: 'unverified' });
      const check = await withTimeout(auth.verifyIdentity(), identityTimeoutMs, { status: 'unreachable' as const });
      if (check.status === 'invalid') await auth.signOut();
      if (active) dispatch(identityAction(check, restored.userId));
    })();
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
    };
  }, [auth]);

  // Authoritative capability lookup; a newer request supersedes older answers.
  useEffect(() => {
    if (!bootstrapped || userId === null) return;
    let active = true;
    void capabilities.fetchCapabilities().then((result) => {
      if (!active) return;
      dispatch({ type: 'capability_received', requestId, userId, result });
      if (result.kind === 'session_invalid') void auth.signOut();
    });
    return () => {
      active = false;
    };
  }, [capabilities, auth, userId, requestId, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) return;
    if (userId === null) {
      void preferredMode.clear().catch(() => undefined);
      return;
    }
    let active = true;
    void preferredMode.load(userId).then((mode) => {
      if (active) dispatch({ type: 'preference_loaded', userId, mode });
    });
    return () => {
      active = false;
    };
  }, [preferredMode, userId, bootstrapped]);

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
      dispatch({ type: 'session_established', userId: outcome.value.userId });
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
