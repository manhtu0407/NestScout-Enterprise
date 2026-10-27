import type { IdentityCheck } from '../auth/auth-gateway';
import type { CapabilityResult, WorkerGrant } from '../capability/capability-repository';
import type { AppMode } from '../mode/app-mode';

export type AccessNotice = 'worker_unavailable' | 'worker_unverified';

type CapabilityState =
  | { status: 'loading' }
  | { status: 'resolved'; worker: WorkerGrant; refreshing: boolean }
  | { status: 'error'; refreshing: boolean };

export type AccessState = {
  bootstrapped: boolean;
  userId: string | null;
  identity: 'verified' | 'unverified';
  capability: CapabilityState;
  // Identifies the capability lookup whose answer may still be applied.
  requestId: number;
  preferenceLoaded: boolean;
  selectedMode: AppMode;
  pendingMode: AppMode | null;
  notice: AccessNotice | null;
  intent: AppMode | null;
  otpPhone: string | null;
  // Earliest time a new code may be requested, set from server outcomes.
  resendAvailableAt: number | null;
};

export type AccessAction =
  | { type: 'bootstrapped'; userId: string | null; identity: AccessState['identity'] }
  | { type: 'session_established'; userId: string }
  | { type: 'session_refreshed'; userId: string }
  | { type: 'session_ended' }
  | { type: 'recheck_requested' }
  | { type: 'capability_received'; requestId: number; userId: string; result: CapabilityResult }
  | { type: 'preference_loaded'; userId: string; mode: AppMode | null }
  | { type: 'mode_requested'; mode: AppMode }
  | { type: 'intent_set'; intent: AppMode | null }
  | { type: 'otp_requested'; phone: string; resendAt: number }
  | { type: 'otp_throttled'; resendAt: number }
  | { type: 'otp_cleared' }
  | { type: 'notice_dismissed' };

export const initialAccessState: AccessState = {
  bootstrapped: false,
  userId: null,
  identity: 'unverified',
  capability: { status: 'loading' },
  requestId: 0,
  preferenceLoaded: false,
  selectedMode: 'client',
  pendingMode: null,
  notice: null,
  intent: null,
  otpPhone: null,
  resendAvailableAt: null,
};

function signedOut(state: AccessState): AccessState {
  return {
    ...initialAccessState,
    bootstrapped: true,
    requestId: state.requestId + 1,
  };
}

function withNewLookup(state: AccessState): AccessState {
  const capability: CapabilityState =
    state.capability.status === 'loading' ? state.capability : { ...state.capability, refreshing: true };
  return { ...state, capability, requestId: state.requestId + 1 };
}

export function accessReducer(state: AccessState, action: AccessAction): AccessState {
  switch (action.type) {
    case 'bootstrapped':
      if (state.bootstrapped) return state;
      return action.userId === null
        ? { ...state, bootstrapped: true, userId: null }
        : { ...state, bootstrapped: true, userId: action.userId, identity: action.identity, requestId: state.requestId + 1 };

    case 'session_established':
      if (state.userId === action.userId) return { ...state, bootstrapped: true, otpPhone: null };
      return {
        ...initialAccessState,
        bootstrapped: true,
        userId: action.userId,
        identity: 'verified',
        requestId: state.requestId + 1,
        intent: state.intent,
      };

    case 'session_refreshed':
      return state.userId === action.userId
        ? withNewLookup(state)
        : accessReducer(state, { type: 'session_established', userId: action.userId });

    case 'session_ended':
      return signedOut(state);

    case 'recheck_requested':
      return state.userId === null || !state.bootstrapped ? state : withNewLookup(state);

    case 'capability_received': {
      if (action.requestId !== state.requestId || action.userId !== state.userId) return state;
      const { result } = action;
      if (result.kind === 'session_invalid') return signedOut(state);
      if (result.kind === 'error') {
        return {
          ...state,
          capability: { status: 'error', refreshing: false },
          pendingMode: null,
          intent: null,
          notice: state.pendingMode === 'worker' || state.intent === 'worker' || state.selectedMode === 'worker' ? 'worker_unverified' : state.notice,
        };
      }
      const wantsWorker = state.pendingMode === 'worker' || state.intent === 'worker';
      const active = result.worker === 'active';
      return {
        ...state,
        capability: { status: 'resolved', worker: result.worker, refreshing: false },
        selectedMode: active ? (wantsWorker ? 'worker' : state.selectedMode) : 'client',
        pendingMode: null,
        intent: null,
        notice: wantsWorker && !active ? 'worker_unavailable' : active ? null : state.notice,
      };
    }

    case 'preference_loaded':
      if (action.userId !== state.userId || state.preferenceLoaded) return state;
      // A stored preference cannot override a backend answer that already denied Worker.
      return {
        ...state,
        preferenceLoaded: true,
        selectedMode: state.capability.status === 'resolved' && state.capability.worker !== 'active' ? 'client' : (action.mode ?? state.selectedMode),
      };

    case 'mode_requested':
      if (state.userId === null) return state;
      if (action.mode === 'client') return { ...state, selectedMode: 'client', pendingMode: null, notice: null };
      return { ...withNewLookup(state), pendingMode: 'worker', notice: null };

    case 'intent_set':
      return { ...state, intent: action.intent };

    case 'otp_requested':
      return { ...state, otpPhone: action.phone, resendAvailableAt: action.resendAt };

    case 'otp_throttled':
      return { ...state, resendAvailableAt: action.resendAt };

    case 'otp_cleared':
      return { ...state, otpPhone: null, resendAvailableAt: null };

    case 'notice_dismissed':
      return { ...state, notice: null };
  }
}

export function identityAction(check: IdentityCheck, fallbackUserId: string): AccessAction {
  if (check.status === 'valid') return { type: 'bootstrapped', userId: check.identity.userId, identity: 'verified' };
  if (check.status === 'invalid') return { type: 'bootstrapped', userId: null, identity: 'unverified' };
  return { type: 'bootstrapped', userId: fallbackUserId, identity: 'unverified' };
}

export type AccessPhase = 'bootstrapping' | 'guest' | 'resolving' | 'client' | 'worker';
export type WorkerStatus = 'checking' | 'authorized' | 'none' | 'revoked' | 'unknown';

export type AccessView = {
  phase: AccessPhase;
  userId: string | null;
  identity: AccessState['identity'];
  workerStatus: WorkerStatus;
  canUseWorker: boolean;
  notice: AccessNotice | null;
  otpPhone: string | null;
  resendAvailableAt: number | null;
};

// Worker mode needs a resolved, active backend grant AND a selection of Worker;
// every other state, including a failed lookup, resolves to Client.
export function deriveAccess(state: AccessState): AccessView {
  const { capability } = state;
  const canUseWorker = capability.status === 'resolved' && capability.worker === 'active';
  const workerStatus: WorkerStatus =
    capability.status === 'loading' ? 'checking'
      : capability.status === 'error' ? 'unknown'
        : capability.worker === 'active' ? 'authorized' : capability.worker;
  let phase: AccessPhase;
  if (!state.bootstrapped) phase = 'bootstrapping';
  else if (state.userId === null) phase = 'guest';
  else if (capability.status === 'loading' || !state.preferenceLoaded) phase = 'resolving';
  else phase = canUseWorker && state.selectedMode === 'worker' ? 'worker' : 'client';
  return {
    phase,
    userId: state.userId,
    identity: state.identity,
    workerStatus,
    canUseWorker,
    notice: state.notice,
    otpPhone: state.otpPhone,
    resendAvailableAt: state.resendAvailableAt,
  };
}
