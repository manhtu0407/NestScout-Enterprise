import { accessReducer, deriveAccess, initialAccessState, type AccessAction, type AccessState } from './access-reducer';

const user = 'user-a';

function run(actions: AccessAction[], from: AccessState = initialAccessState): AccessState {
  return actions.reduce(accessReducer, from);
}

function signedIn(extra: AccessAction[] = []): AccessState {
  return run([{ type: 'otp_verified', userId: user }, ...extra]);
}

const received = (state: AccessState, worker: 'none' | 'active' | 'revoked'): AccessAction => ({
  type: 'capability_received',
  requestId: state.requestId,
  userId: user,
  result: { kind: 'resolved', worker },
});

describe('cold start', () => {
  test('is bootstrapping until the session is known', () => {
    expect(deriveAccess(initialAccessState).phase).toBe('bootstrapping');
  });

  test('without a session the guest phase is reached with no role choice', () => {
    const state = run([{ type: 'restore_settled', userId: null }]);
    expect(deriveAccess(state).phase).toBe('guest');
  });

  test('a restored session stays unresolved, never protected, until capabilities and preference arrive', () => {
    let state = signedIn();
    expect(deriveAccess(state).phase).toBe('resolving');
    state = run([received(state, 'none')], state);
    expect(deriveAccess(state).phase).toBe('resolving');
    state = run([{ type: 'preference_loaded', userId: user, mode: null }], state);
    expect(deriveAccess(state).phase).toBe('client');
  });
});

describe('worker entitlement', () => {
  const resolve = (worker: 'none' | 'active' | 'revoked', mode: 'client' | 'worker' | null) => {
    const base = signedIn();
    return run([received(base, worker), { type: 'preference_loaded', userId: user, mode }], base);
  };

  test.each([['none'], ['revoked']] as const)('a forged Worker preference never enters Worker with a %s grant', (worker) => {
    const view = deriveAccess(resolve(worker, 'worker'));
    expect(view.phase).toBe('client');
    expect(view.canUseWorker).toBe(false);
  });

  test('a stored Worker preference is honoured only with an active grant', () => {
    const view = deriveAccess(resolve('active', 'worker'));
    expect(view.phase).toBe('worker');
    expect(view.workerStatus).toBe('authorized');
  });

  test('an active grant without a Worker preference opens Client', () => {
    expect(deriveAccess(resolve('active', null)).phase).toBe('client');
  });

  test('a preference arriving after a denial cannot override it', () => {
    const base = signedIn();
    const denied = run([received(base, 'revoked')], base);
    const state = run([{ type: 'preference_loaded', userId: user, mode: 'worker' }], denied);
    expect(state.selectedMode).toBe('client');
    expect(deriveAccess(state).phase).toBe('client');
  });

  test('a failed lookup fails closed to Client and reports unknown', () => {
    const base = run([{ type: 'otp_verified', userId: user }, { type: 'preference_loaded', userId: user, mode: 'worker' }]);
    const state = run([{ type: 'capability_received', requestId: base.requestId, userId: user, result: { kind: 'error', reason: 'unavailable' } }], base);
    const view = deriveAccess(state);
    expect(view.phase).toBe('client');
    expect(view.canUseWorker).toBe(false);
    expect(view.workerStatus).toBe('unknown');
    expect(view.notice).toBe('worker_unverified');
  });

  test('revocation discovered by a recheck removes Worker mode', () => {
    let state = resolve('active', 'worker');
    state = run([{ type: 'recheck_requested' }], state);
    expect(deriveAccess(state).phase).toBe('worker');
    state = run([received(state, 'revoked')], state);
    const view = deriveAccess(state);
    expect(view.phase).toBe('client');
    expect(view.workerStatus).toBe('revoked');
  });

  test('an error during a recheck drops an active Worker session to Client', () => {
    let state = resolve('active', 'worker');
    state = run([{ type: 'recheck_requested' }], state);
    state = run([{ type: 'capability_received', requestId: state.requestId, userId: user, result: { kind: 'error', reason: 'unavailable' } }], state);
    expect(deriveAccess(state).phase).toBe('client');
  });
});

describe('mode switching', () => {
  const dual = () => {
    const base = signedIn();
    return run([received(base, 'active'), { type: 'preference_loaded', userId: user, mode: null }], base);
  };

  test('an authorized account switches to Worker only after the backend re-confirms', () => {
    let state = run([{ type: 'mode_requested', mode: 'worker' }], dual());
    expect(deriveAccess(state).phase).toBe('client');
    state = run([received(state, 'active')], state);
    expect(deriveAccess(state).phase).toBe('worker');
    state = run([{ type: 'mode_requested', mode: 'client' }], state);
    expect(deriveAccess(state).phase).toBe('client');
  });

  test('an account whose grant was revoked is forced back to Client with a notice', () => {
    let state = run([{ type: 'mode_requested', mode: 'worker' }], dual());
    state = run([received(state, 'revoked')], state);
    const view = deriveAccess(state);
    expect(view.phase).toBe('client');
    expect(view.notice).toBe('worker_unavailable');
  });

  test('a Worker request without a session is ignored', () => {
    const state = run([{ type: 'restore_settled', userId: null }, { type: 'mode_requested', mode: 'worker' }]);
    expect(deriveAccess(state).phase).toBe('guest');
  });

  test('rapid Worker then Client requests end in Client even if the earlier answer arrives', () => {
    let state = run([{ type: 'mode_requested', mode: 'worker' }], dual());
    const workerAnswer = received(state, 'active');
    state = run([{ type: 'mode_requested', mode: 'client' }], state);
    state = run([workerAnswer], state);
    expect(deriveAccess(state).phase).toBe('client');
  });

  test('repeated requests apply only the newest answer', () => {
    let state = run([{ type: 'mode_requested', mode: 'worker' }], dual());
    const first = received(state, 'active');
    state = run([{ type: 'mode_requested', mode: 'worker' }], state);
    const staleApplied = run([first], state);
    expect(deriveAccess(staleApplied).phase).toBe('client');
    expect(deriveAccess(run([received(state, 'active')], state)).phase).toBe('worker');
  });
});

describe('races and session changes', () => {
  test('an answer for a superseded request or another user is ignored', () => {
    const state = signedIn();
    const wrongUser = run([{ type: 'capability_received', requestId: state.requestId, userId: 'user-b', result: { kind: 'resolved', worker: 'active' } }], state);
    const stale = run([{ type: 'capability_received', requestId: state.requestId - 1, userId: user, result: { kind: 'resolved', worker: 'active' } }], state);
    expect(wrongUser).toBe(state);
    expect(stale).toBe(state);
  });

  test('sign-out clears every in-memory access field and ignores late answers', () => {
    let state = signedIn([{ type: 'preference_loaded', userId: user, mode: 'worker' }, { type: 'otp_requested', phone: '+84912345678', resendAt: 1 }]);
    const late = received(state, 'active');
    state = run([{ type: 'session_ended' }], state);
    expect(state).toMatchObject({ userId: null, otpPhone: null, resendAvailableAt: null, selectedMode: 'client', pendingMode: null, intent: null, bootstrapped: true });
    expect(deriveAccess(run([late], state)).phase).toBe('guest');
  });

  test('a different account never inherits the previous capability or mode', () => {
    let state = signedIn([{ type: 'preference_loaded', userId: user, mode: 'worker' }]);
    state = run([received(state, 'active')], state);
    expect(deriveAccess(state).phase).toBe('worker');
    state = run([{ type: 'otp_verified', userId: 'user-b' }], state);
    expect(state).toMatchObject({ userId: 'user-b', selectedMode: 'client', preferenceLoaded: false });
    expect(deriveAccess(state).phase).toBe('resolving');
  });

  test('a token refresh for the same account re-checks without leaving the current mode', () => {
    let state = signedIn([{ type: 'preference_loaded', userId: user, mode: 'worker' }]);
    state = run([received(state, 'active')], state);
    const refreshed = run([{ type: 'session_event', event: 'refreshed', userId: user }], state);
    expect(refreshed.requestId).toBe(state.requestId + 1);
    expect(deriveAccess(refreshed).phase).toBe('worker');
  });

  test('a preference for another account is ignored', () => {
    const state = run([{ type: 'preference_loaded', userId: 'user-b', mode: 'worker' }], signedIn());
    expect(state.preferenceLoaded).toBe(false);
  });
});

describe('entry intent', () => {
  test('a Worker intent opens Worker only for an active grant, and is consumed once', () => {
    const intended = run([{ type: 'restore_settled', userId: null }, { type: 'intent_set', intent: 'worker' }]);
    let state = run([{ type: 'otp_verified', userId: user }], intended);
    expect(state.intent).toBe('worker');
    state = run([{ type: 'preference_loaded', userId: user, mode: null }, received(state, 'active')], state);
    expect(deriveAccess(state).phase).toBe('worker');
    expect(state.intent).toBeNull();
  });

  test('a Worker intent without a grant lands in Client with a notice', () => {
    const intended = run([{ type: 'restore_settled', userId: null }, { type: 'intent_set', intent: 'worker' }]);
    let state = run([{ type: 'otp_verified', userId: user }], intended);
    state = run([{ type: 'preference_loaded', userId: user, mode: null }, received(state, 'none')], state);
    const view = deriveAccess(state);
    expect(view.phase).toBe('client');
    expect(view.notice).toBe('worker_unavailable');
  });
});

describe('identity transitions', () => {
  const restored = (): AccessState => run([{ type: 'restore_settled', userId: user }]);
  const checked = (state: AccessState, check: Parameters<typeof accessReducer>[1] extends infer A ? A extends { type: 'identity_checked'; check: infer C } ? C : never : never) =>
    run([{ type: 'identity_checked', request: state.identityRequest, check }], state);
  const workerReady = (state: AccessState): AccessState =>
    run([received(state, 'active'), { type: 'preference_loaded', userId: user, mode: 'worker' }], state);

  test('a restored session is an unverified claim that waits for getUser', () => {
    const state = restored();
    expect(state).toMatchObject({ userId: user, identity: 'unverified', identityPending: true, bootstrapped: false });
    expect(deriveAccess(state).phase).toBe('bootstrapping');
  });

  test('a restored session with no stored user keeps the guest shell and starts no check', () => {
    const state = run([{ type: 'restore_settled', userId: null }]);
    expect(state).toMatchObject({ userId: null, identityPending: false, bootstrapped: true });
  });

  test.each([['active'], ['revoked'], ['none']] as const)('an unverified identity never reaches Worker, whatever the %s grant says', (worker) => {
    const state = checked(restored(), { status: 'unreachable' });
    const next = workerReady({ ...state, requestId: state.requestId });
    const view = deriveAccess(run([received(next, worker)], next));
    expect(view.canUseWorker).toBe(false);
    expect(view.phase).toBe('client');
  });

  test('an active grant with an unverified identity reports unknown, not authorized', () => {
    let state = checked(restored(), { status: 'unreachable' });
    state = run([received(state, 'active'), { type: 'preference_loaded', userId: user, mode: 'worker' }], state);
    expect(deriveAccess(state)).toMatchObject({ phase: 'client', workerStatus: 'unknown', canUseWorker: false, identity: 'unverified' });
  });

  test('a successful getUser for the same account verifies it and the saved preference then applies', () => {
    let state = workerReady(checked(restored(), { status: 'unreachable' }));
    expect(deriveAccess(state).phase).toBe('client');
    state = run([{ type: 'recheck_requested' }], state);
    expect(state.identityPending).toBe(true);
    state = run([{ type: 'identity_checked', request: state.identityRequest, check: { status: 'valid', identity: { userId: user } } }, received(state, 'active')], state);
    expect(deriveAccess(state)).toMatchObject({ phase: 'worker', identity: 'verified', workerStatus: 'authorized' });
  });

  test('a getUser answer for another account does not verify this one', () => {
    const state = checked(restored(), { status: 'valid', identity: { userId: 'user-b' } });
    expect(state).toMatchObject({ identity: 'unverified', userId: user, bootstrapped: true });
  });

  test('an invalid getUser answer signs out and requests removal of the stored session', () => {
    const state = checked(restored(), { status: 'invalid' });
    expect(state).toMatchObject({ userId: null, identity: 'unverified', purgeSession: true, bootstrapped: true });
    expect(accessReducer(state, { type: 'purge_done' }).purgeSession).toBe(false);
  });

  test('a stale or unrequested identity answer is ignored', () => {
    const state = restored();
    const stale = run([{ type: 'identity_checked', request: state.identityRequest - 1, check: { status: 'invalid' } }], state);
    expect(stale).toBe(state);
    const settled = checked(state, { status: 'unreachable' });
    expect(run([{ type: 'identity_checked', request: settled.identityRequest, check: { status: 'invalid' } }], settled)).toBe(settled);
  });

  test('a session event never upgrades an unverified identity', () => {
    const state = checked(restored(), { status: 'unreachable' });
    for (const event of ['signed_in', 'refreshed', 'updated'] as const) {
      expect(run([{ type: 'session_event', event, userId: user }], state).identity).toBe('unverified');
    }
  });

  test('a session event for a new account starts unverified with a fresh check and keeps no old access', () => {
    let state = workerReady(run([{ type: 'otp_verified', userId: user }]));
    state = run([{ type: 'session_event', event: 'signed_in', userId: 'user-b' }], state);
    expect(state).toMatchObject({ userId: 'user-b', identity: 'unverified', identityPending: true, preferenceLoaded: false, selectedMode: 'client' });
    expect(state.capability.status).toBe('loading');
  });

  test('an OTP confirmation is verified at once and supersedes a pending check', () => {
    const pending = restored();
    const state = run([{ type: 'otp_verified', userId: user }], pending);
    expect(state).toMatchObject({ identity: 'verified', identityPending: false });
    expect(run([{ type: 'identity_checked', request: pending.identityRequest, check: { status: 'invalid' } }], state)).toBe(state);
  });

  test('a rejected access token on the lookup withdraws verification until getUser answers', () => {
    let state = workerReady(run([{ type: 'otp_verified', userId: user }]));
    expect(deriveAccess(state).phase).toBe('worker');
    state = run([{ type: 'capability_received', requestId: state.requestId, userId: user, result: { kind: 'unauthenticated' } }], state);
    expect(state).toMatchObject({ identity: 'unverified', identityPending: true });
    expect(deriveAccess(state)).toMatchObject({ phase: 'client', canUseWorker: false, workerStatus: 'unknown' });
  });

  test('a Worker request waits for the identity check before it is answered', () => {
    let state = checked(restored(), { status: 'unreachable' });
    state = run([received(state, 'active'), { type: 'preference_loaded', userId: user, mode: null }], state);
    state = run([{ type: 'mode_requested', mode: 'worker' }], state);
    expect(state.identityPending).toBe(true);
    state = run([received(state, 'active')], state);
    expect(state.pendingMode).toBe('worker');
    expect(deriveAccess(state).phase).toBe('client');
    state = run([{ type: 'identity_checked', request: state.identityRequest, check: { status: 'valid', identity: { userId: user } } }], state);
    expect(state.selectedMode).toBe('worker');
    expect(deriveAccess(state).phase).toBe('worker');
  });

  test('a Worker request that stays unverified ends in Client with a notice', () => {
    let state = checked(restored(), { status: 'unreachable' });
    state = run([received(state, 'active'), { type: 'preference_loaded', userId: user, mode: null }, { type: 'mode_requested', mode: 'worker' }], state);
    state = run([received(state, 'active')], state);
    state = run([{ type: 'identity_checked', request: state.identityRequest, check: { status: 'unreachable' } }], state);
    expect(deriveAccess(state)).toMatchObject({ phase: 'client', notice: 'worker_unverified' });
  });
});
