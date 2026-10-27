import { accessReducer, deriveAccess, identityAction, initialAccessState, type AccessAction, type AccessState } from './access-reducer';

const user = 'user-a';

function run(actions: AccessAction[], from: AccessState = initialAccessState): AccessState {
  return actions.reduce(accessReducer, from);
}

function signedIn(extra: AccessAction[] = []): AccessState {
  return run([{ type: 'bootstrapped', userId: user, identity: 'verified' }, ...extra]);
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
    const state = run([{ type: 'bootstrapped', userId: null, identity: 'unverified' }]);
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

  test('an invalid identity check becomes a guest; a network failure keeps an unverified session', () => {
    expect(identityAction({ status: 'invalid' }, user)).toEqual({ type: 'bootstrapped', userId: null, identity: 'unverified' });
    expect(identityAction({ status: 'unreachable' }, user)).toEqual({ type: 'bootstrapped', userId: user, identity: 'unverified' });
    expect(identityAction({ status: 'valid', identity: { userId: 'server-id' } }, user)).toEqual({
      type: 'bootstrapped',
      userId: 'server-id',
      identity: 'verified',
    });
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
    const base = run([{ type: 'bootstrapped', userId: user, identity: 'verified' }, { type: 'preference_loaded', userId: user, mode: 'worker' }]);
    const state = run([{ type: 'capability_received', requestId: base.requestId, userId: user, result: { kind: 'error' } }], base);
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
    state = run([{ type: 'capability_received', requestId: state.requestId, userId: user, result: { kind: 'error' } }], state);
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
    const state = run([{ type: 'bootstrapped', userId: null, identity: 'unverified' }, { type: 'mode_requested', mode: 'worker' }]);
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

  test('an invalid session reported by the backend returns to guest', () => {
    const state = signedIn();
    const next = run([{ type: 'capability_received', requestId: state.requestId, userId: user, result: { kind: 'session_invalid' } }], state);
    expect(deriveAccess(next).phase).toBe('guest');
  });

  test('a different account never inherits the previous capability or mode', () => {
    let state = signedIn([{ type: 'preference_loaded', userId: user, mode: 'worker' }]);
    state = run([received(state, 'active')], state);
    expect(deriveAccess(state).phase).toBe('worker');
    state = run([{ type: 'session_established', userId: 'user-b' }], state);
    expect(state).toMatchObject({ userId: 'user-b', selectedMode: 'client', preferenceLoaded: false });
    expect(deriveAccess(state).phase).toBe('resolving');
  });

  test('a token refresh for the same account re-checks without leaving the current mode', () => {
    let state = signedIn([{ type: 'preference_loaded', userId: user, mode: 'worker' }]);
    state = run([received(state, 'active')], state);
    const refreshed = run([{ type: 'session_refreshed', userId: user }], state);
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
    const intended = run([{ type: 'bootstrapped', userId: null, identity: 'unverified' }, { type: 'intent_set', intent: 'worker' }]);
    let state = run([{ type: 'session_established', userId: user }], intended);
    expect(state.intent).toBe('worker');
    state = run([{ type: 'preference_loaded', userId: user, mode: null }, received(state, 'active')], state);
    expect(deriveAccess(state).phase).toBe('worker');
    expect(state.intent).toBeNull();
  });

  test('a Worker intent without a grant lands in Client with a notice', () => {
    const intended = run([{ type: 'bootstrapped', userId: null, identity: 'unverified' }, { type: 'intent_set', intent: 'worker' }]);
    let state = run([{ type: 'session_established', userId: user }], intended);
    state = run([{ type: 'preference_loaded', userId: user, mode: null }, received(state, 'none')], state);
    const view = deriveAccess(state);
    expect(view.phase).toBe('client');
    expect(view.notice).toBe('worker_unavailable');
  });
});
