import { useCallback, useEffect, useMemo, useReducer } from 'react';

import { getDefaultOnboardingService } from './default-onboarding-service';
import type { OnboardingOutcome } from './onboarding-record';
import type { OnboardingService } from './onboarding-service';

export type OnboardingStatus = 'checking' | 'off' | 'eligible' | 'running';

type Phase =
  | { status: 'checking' }
  | { status: 'off' }
  | { status: 'eligible'; step: number; replay: boolean }
  | { status: 'running'; step: number; replay: boolean };

type State = { userId: string | null; phase: Phase };

type Action =
  | { type: 'scope'; userId: string | null }
  | { type: 'decided'; userId: string; show: boolean; step: number }
  | { type: 'replay'; userId: string }
  | { type: 'begin' }
  | { type: 'go'; step: number }
  | { type: 'end' };

function phaseFor(userId: string | null): Phase {
  return userId === null ? { status: 'off' } : { status: 'checking' };
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'scope':
      return state.userId === action.userId ? state : { userId: action.userId, phase: phaseFor(action.userId) };
    case 'decided':
      if (state.userId !== action.userId || state.phase.status !== 'checking') return state;
      return { ...state, phase: action.show ? { status: 'eligible', step: action.step, replay: false } : { status: 'off' } };
    case 'replay':
      if (state.userId !== action.userId || (state.phase.status !== 'off' && state.phase.status !== 'checking')) return state;
      return { ...state, phase: { status: 'eligible', step: 0, replay: true } };
    case 'begin':
      return state.phase.status === 'eligible' ? { ...state, phase: { ...state.phase, status: 'running' } } : state;
    case 'go':
      return state.phase.status === 'running' ? { ...state, phase: { ...state.phase, step: action.step } } : state;
    case 'end':
      return state.phase.status === 'running' || state.phase.status === 'eligible' ? { ...state, phase: { status: 'off' } } : state;
  }
}

export type OnboardingController = Readonly<{
  status: OnboardingStatus;
  step: number;
  replay: boolean;
  begin: () => void;
  go: (step: number) => void;
  conclude: (outcome: OnboardingOutcome) => void;
  requestReplay: () => void;
}>;

export function useOnboarding(userId: string | null, service?: OnboardingService): OnboardingController {
  const [state, dispatch] = useReducer(reduce, userId, (initial): State => ({ userId: initial, phase: phaseFor(initial) }));
  const phase = state.userId === userId ? state.phase : phaseFor(userId);
  const replay = phase.status === 'eligible' || phase.status === 'running' ? phase.replay : false;

  const resolve = useCallback((): OnboardingService | null => {
    try {
      return service ?? getDefaultOnboardingService();
    } catch {
      return null;
    }
  }, [service]);

  useEffect(() => {
    dispatch({ type: 'scope', userId });
    if (userId === null) return undefined;
    const resolved = resolve();
    if (resolved === null) {
      dispatch({ type: 'decided', userId, show: false, step: 0 });
      return undefined;
    }
    const controller = new AbortController();
    resolved.evaluate(userId, controller.signal).then(
      decision => { if (!controller.signal.aborted) dispatch({ type: 'decided', userId, show: decision.show, step: decision.show ? decision.step : 0 }); },
      () => { if (!controller.signal.aborted) dispatch({ type: 'decided', userId, show: false, step: 0 }); },
    );
    return () => controller.abort();
  }, [resolve, userId]);

  const begin = useCallback(() => dispatch({ type: 'begin' }), []);

  const go = useCallback((step: number) => {
    dispatch({ type: 'go', step });
    if (userId === null || replay) return;
    void resolve()?.progress(userId, step).catch(() => undefined);
  }, [replay, resolve, userId]);

  const conclude = useCallback((outcome: OnboardingOutcome) => {
    dispatch({ type: 'end' });
    if (userId === null || replay) return;
    void resolve()?.conclude(userId, outcome).catch(() => undefined);
  }, [replay, resolve, userId]);

  const requestReplay = useCallback(() => {
    if (userId !== null) dispatch({ type: 'replay', userId });
  }, [userId]);

  return useMemo<OnboardingController>(() => ({
    status: phase.status,
    step: phase.status === 'eligible' || phase.status === 'running' ? phase.step : 0,
    replay,
    begin,
    go,
    conclude,
    requestReplay,
  }), [phase, replay, begin, go, conclude, requestReplay]);
}
