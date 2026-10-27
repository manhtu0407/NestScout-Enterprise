import type { IdentityCheck } from '../auth/auth-gateway';
import type { CapabilityResult, WorkerGrant } from '../capability/capability-repository';
import type { AppMode } from '../mode/app-mode';

export type AccessNotice = 'worker_unavailable' | 'worker_unverified';

type CapabilityState =
  | { status: 'loading' }
  | { status: 'resolved'; worker: WorkerGrant; refreshing: boolean }
  | { status: 'error'; refreshing: boolean };

// Identity is "verified" only after the Auth server confirmed the account in this
// run: getUser() answered for the same user, or an OTP confirmation returned a
// session. A session read from storage, and any auth event, is only a claim and
// leaves the identity "unverified" until a check answers.
export type AccessState = {
  bootstrapped: boolean;
  userId: string | null;
  identity: 'verified' | 'unverified';
  // Identifies the identity check whose answer may still be applied.
  identityRequest: number;
  identityPending: boolean;
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
  // The account whose stored session was proven dead and must be removed from the device.
  purgeSession: string | null;
};

export type SessionEventType = 'signed_in' | 'refreshed' | 'updated';

export type AccessAction =
  | { type: 'restore_settled'; userId: string | null }
  | { type: 'session_event'; event: SessionEventType; userId: string }
  | { type: 'otp_verified'; userId: string }
  | { type: 'session_ended' }
  | { type: 'identity_checked'; request: number; check: IdentityCheck }
  | { type: 'purge_done' }
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
  identityRequest: 0,
  identityPending: false,
  capability: { status: 'loading' },
  requestId: 0,
  preferenceLoaded: false,
  selectedMode: 'client',
  pendingMode: null,
  notice: null,
  intent: null,
  otpPhone: null,
  resendAvailableAt: null,
  purgeSession: null,
};

// Every reset moves both request counters so that answers to earlier checks and
// lookups can never be applied to the state that replaced them.
function reset(state: AccessState, userId: string | null, identity: AccessState['identity'], keep: Partial<AccessState> = {}): AccessState {
  return {
    ...initialAccessState,
    bootstrapped: true,
    userId,
    identity,
    requestId: state.requestId + 1,
    identityRequest: state.identityRequest + 1,
    ...keep,
  };
}

function signedOut(state: AccessState): AccessState {
  return reset(state, null, 'unverified');
}

function withNewLookup(state: AccessState): AccessState {
  const capability: CapabilityState =
    state.capability.status === 'loading' ? state.capability : { ...state.capability, refreshing: true };
  return { ...state, capability, requestId: state.requestId + 1 };
}

function withIdentityCheck(state: AccessState): AccessState {
  return { ...state, identityRequest: state.identityRequest + 1, identityPending: true };
}

function wantsWorker(state: AccessState): boolean {
  return state.pendingMode === 'worker' || state.intent === 'worker';
}

// A Worker request (button or pre-login intent) is answered only once the lookup and
// the identity check have both settled, and is granted only when both allow it.
function settleWorkerRequest(state: AccessState): AccessState {
  if (!wantsWorker(state) || state.identityPending) return state;
  const { capability } = state;
  if (capability.status === 'loading' || capability.refreshing) return state;
  const granted = state.identity === 'verified' && capability.status === 'resolved' && capability.worker === 'active';
  return {
    ...state,
    selectedMode: granted ? 'worker' : state.selectedMode,
    pendingMode: null,
    intent: null,
    notice: granted ? null : capability.status === 'resolved' && capability.worker !== 'active' ? 'worker_unavailable' : 'worker_unverified',
  };
}

export function accessReducer(state: AccessState, action: AccessAction): AccessState {
  switch (action.type) {
    case 'restore_settled':
      if (action.userId === null) return state.userId === null ? { ...state, bootstrapped: true } : state;
      // An auth event that already named a session wins over the slower restore.
      if (state.userId !== null) return state;
      return withIdentityCheck({ ...state, userId: action.userId, identity: 'unverified', requestId: state.requestId + 1 });

    case 'session_event':
      if (state.userId === action.userId) return action.event === 'signed_in' ? state : withNewLookup(state);
      return withIdentityCheck({ ...reset(state, action.userId, 'unverified', { intent: state.intent }), bootstrapped: state.bootstrapped });

    case 'otp_verified':
      return state.userId === action.userId
        ? { ...state, bootstrapped: true, identity: 'verified', identityRequest: state.identityRequest + 1, identityPending: false, otpPhone: null }
        : reset(state, action.userId, 'verified', { intent: state.intent });

    case 'session_ended':
      return signedOut(state);

    case 'identity_checked': {
      if (!state.identityPending || action.request !== state.identityRequest || state.userId === null) return state;
      const { check } = action;
      if (check.status === 'invalid') return { ...signedOut(state), purgeSession: state.userId };
      const verified = check.status === 'valid' && check.identity.userId === state.userId;
      return settleWorkerRequest({ ...state, bootstrapped: true, identity: verified ? 'verified' : 'unverified', identityPending: false });
    }

    case 'purge_done':
      return { ...state, purgeSession: null };

    case 'recheck_requested': {
      if (state.userId === null || !state.bootstrapped) return state;
      const next = withNewLookup(state);
      return state.identity === 'unverified' && !state.identityPending ? withIdentityCheck(next) : next;
    }

    case 'capability_received': {
      if (action.requestId !== state.requestId || action.userId !== state.userId) return state;
      const { result } = action;
      if (result.kind === 'unauthenticated') {
        // The token was refused: nothing is trusted until getUser answers again.
        const next: AccessState = {
          ...state,
          identity: 'unverified',
          capability: { status: 'error', refreshing: false },
          notice: wantsWorker(state) || state.selectedMode === 'worker' ? 'worker_unverified' : state.notice,
        };
        return settleWorkerRequest(state.identityPending ? next : withIdentityCheck(next));
      }
      if (result.kind === 'error') {
        const next: AccessState = {
          ...state,
          capability: { status: 'error', refreshing: false },
          notice: wantsWorker(state) || state.selectedMode === 'worker' ? 'worker_unverified' : state.notice,
        };
        return settleWorkerRequest(next);
      }
      const active = result.worker === 'active';
      const next: AccessState = {
        ...state,
        capability: { status: 'resolved', worker: result.worker, refreshing: false },
        selectedMode: active ? state.selectedMode : 'client',
        notice: active ? null : state.notice,
      };
      return settleWorkerRequest(next);
    }

    case 'preference_loaded':
      if (action.userId !== state.userId || state.preferenceLoaded) return state;
      // A stored preference cannot override a backend answer that already denied Worker.
      return {
        ...state,
        preferenceLoaded: true,
        selectedMode: state.capability.status === 'resolved' && state.capability.worker !== 'active' ? 'client' : (action.mode ?? state.selectedMode),
      };

    case 'mode_requested': {
      if (state.userId === null) return state;
      if (action.mode === 'client') return { ...state, selectedMode: 'client', pendingMode: null, notice: null };
      const next = { ...withNewLookup(state), pendingMode: 'worker' as const, notice: null };
      return state.identity === 'unverified' && !state.identityPending ? withIdentityCheck(next) : next;
    }

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

// Worker needs ALL of: a verified identity, a resolved active backend grant for that
// account, and a Worker selection. Every other state, including a failed lookup or an
// unverified identity, resolves to Client. The selected mode is a preference only.
export function deriveAccess(state: AccessState): AccessView {
  const { capability } = state;
  const verified = state.identity === 'verified';
  const canUseWorker = verified && capability.status === 'resolved' && capability.worker === 'active';
  let workerStatus: WorkerStatus;
  if (capability.status === 'loading') workerStatus = 'checking';
  else if (capability.status === 'error') workerStatus = 'unknown';
  else if (capability.worker === 'active') workerStatus = verified ? 'authorized' : 'unknown';
  else workerStatus = capability.worker;
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
