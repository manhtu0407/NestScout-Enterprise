import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import type { AuthFailure, AuthGateway, AuthOutcome, EmailCredentials, EmailSignUp, SocialProvider, SocialSignIn } from '../auth/auth-gateway';
import type { CapabilityRepository } from '../capability/capability-repository';
import type { AppMode } from '../mode/app-mode';
import type { PreferredModeStore } from '../mode/preferred-mode-store';
import { withDeadline } from './deadline';
import { accessReducer, deriveAccess, initialAccessState, type AccessView, type HorizonDraft } from './access-reducer';

export type AccessServices = {
  auth: AuthGateway;
  capabilities: CapabilityRepository;
  preferredMode: PreferredModeStore;
};

export type AccessApi = AccessView & {
  requestOtp(phoneE164: string): Promise<AuthOutcome>;
  verifyOtp(code: string): Promise<AuthOutcome>;
  cancelOtp(): void;
  signInWithProvider(provider: SocialProvider): Promise<AuthOutcome<SocialSignIn>>;
  signUpWithEmail(credentials: EmailCredentials): Promise<AuthOutcome<EmailSignUp>>;
  signInWithEmail(credentials: EmailCredentials): Promise<AuthOutcome>;
  redirectFailure: AuthFailure | null;
  dismissRedirectFailure(): void;
  signOut(): Promise<AuthOutcome>;
  switchMode(mode: AppMode): void;
  recheck(): void;
  setIntent(intent: AppMode | null): void;
  dismissNotice(): void;
  editGuestDraft(text: string): void;
  clearGuestDraft(): void;
  updateHorizonDraft(ownerId: string | null, draft: HorizonDraft): void;
  prepareHorizonDraftTransfer(draft: HorizonDraft): void;
  clearHorizonDraft(ownerId: string | null): void;
  cancelHorizonTransfer(): void;
  cancelModeRequest(): void;
};

const AccessContext = createContext<AccessApi | null>(null);

export const accessTimeouts = { restoreMs: 8000, identityMs: 8000, capabilityMs: 10_000, preferenceMs: 5000 } as const;
const resendCooldownMs = 60_000;

export function AccessProvider({ services, children }: { services: AccessServices; children: ReactNode }) {
  const { auth, capabilities, preferredMode } = services;
  const [state, dispatch] = useReducer(accessReducer, initialAccessState);
  const [redirectFailure, setRedirectFailure] = useState<AuthFailure | null>(null);
  const ownedDraftUrls = useRef(new Set<string>());
  const { userId, requestId, bootstrapped, preferenceLoaded, selectedMode, otpPhone, identityPending, identityRequest } = state;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const next = new Set((state.horizonDraft?.images ?? []).map(image => image.uri).filter(uri => uri.startsWith('blob:')));
    for (const uri of ownedDraftUrls.current) if (!next.has(uri)) URL.revokeObjectURL(uri);
    ownedDraftUrls.current = next;
  }, [state.horizonDraft]);

  useEffect(() => {
    const owned = ownedDraftUrls;
    return () => { if (Platform.OS === 'web') for (const uri of owned.current) URL.revokeObjectURL(uri); };
  }, []);

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
    const restoreAfterRedirect = async () => {
      const completed = await auth.completeRedirect();
      if (completed && !completed.ok && active) setRedirectFailure(completed.failure);
      return auth.restoreSession();
    };
    void withDeadline(restoreAfterRedirect, accessTimeouts.restoreMs, null).then((restored) => {
      if (active) dispatch({ type: 'restore_settled', userId: restored?.userId ?? null });
    });
    return () => {
      active = false;
      unsubscribe();
      appState.remove();
    };
  }, [auth]);

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

  const signInWithProvider = useCallback(
    async (provider: SocialProvider): Promise<AuthOutcome<SocialSignIn>> => {
      setRedirectFailure(null);
      const outcome = await auth.signInWithProvider(provider);
      if (outcome.ok && outcome.value.status === 'signed_in') dispatch({ type: 'otp_verified', userId: outcome.value.identity.userId });
      return outcome;
    },
    [auth],
  );
  const signUpWithEmail = useCallback(
    async (credentials: EmailCredentials): Promise<AuthOutcome<EmailSignUp>> => {
      const outcome = await auth.signUpWithEmail(credentials);
      if (outcome.ok && outcome.value.status === 'signed_in') dispatch({ type: 'otp_verified', userId: outcome.value.identity.userId });
      return outcome;
    },
    [auth],
  );

  const signInWithEmail = useCallback(
    async (credentials: EmailCredentials): Promise<AuthOutcome> => {
      const outcome = await auth.signInWithEmail(credentials);
      if (!outcome.ok) return outcome;
      dispatch({ type: 'otp_verified', userId: outcome.value.userId });
      return { ok: true, value: undefined };
    },
    [auth],
  );
  const dismissRedirectFailure = useCallback(() => setRedirectFailure(null), []);
  const signOut = useCallback(() => auth.signOut(), [auth]);
  const cancelHorizonTransfer = useCallback(() => dispatch({ type: 'horizon_transfer_cancelled' }), []);

  const view = useMemo(() => deriveAccess(state), [state]);
  const api = useMemo<AccessApi>(
    () => ({
      ...view,
      requestOtp,
      verifyOtp,
      cancelOtp: () => dispatch({ type: 'otp_cleared' }),
      signInWithProvider,
      signUpWithEmail,
      signInWithEmail,
      redirectFailure,
      dismissRedirectFailure,
      signOut,
      switchMode: (mode) => dispatch({ type: 'mode_requested', mode }),
      recheck: () => dispatch({ type: 'recheck_requested' }),
      setIntent: (intent) => dispatch({ type: 'intent_set', intent }),
      dismissNotice: () => dispatch({ type: 'notice_dismissed' }),
      editGuestDraft: (text) => dispatch({ type: 'guest_draft_edited', text }),
      clearGuestDraft: () => dispatch({ type: 'guest_draft_cleared' }),
      updateHorizonDraft: (ownerId, draft) => dispatch({ type: 'horizon_draft_updated', ownerId, draft }),
      prepareHorizonDraftTransfer: (draft) => dispatch({ type: 'horizon_draft_transfer_requested', draft }),
      clearHorizonDraft: (ownerId) => dispatch({ type: 'horizon_draft_cleared', ownerId }),
      cancelHorizonTransfer,
      cancelModeRequest: () => dispatch({ type: 'mode_request_cancelled' }),
    }),
    [view, requestOtp, verifyOtp, signInWithProvider, signUpWithEmail, signInWithEmail, redirectFailure, dismissRedirectFailure, signOut, cancelHorizonTransfer],
  );

  return <AccessContext.Provider value={api}>{children}</AccessContext.Provider>;
}

export function useAccess(): AccessApi {
  const value = useContext(AccessContext);
  if (!value) throw new Error('useAccess must be used inside AccessProvider.');
  return value;
}
