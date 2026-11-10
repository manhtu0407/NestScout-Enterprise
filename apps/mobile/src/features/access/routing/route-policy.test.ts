import { deriveAccess, initialAccessState, type AccessPhase, type AccessState } from '../state/access-reducer';
import { canEnterArea, destinationFor, type RouteArea } from './route-policy';

function view(phase: AccessPhase) {
  const base: AccessState = { ...initialAccessState, bootstrapped: phase !== 'bootstrapping' };
  const signedIn: AccessState = { ...base, userId: 'user-a', identity: 'verified', preferenceLoaded: true, capability: { status: 'resolved', worker: 'active', refreshing: false } };
  switch (phase) {
    case 'guest':
      return deriveAccess(base);
    case 'resolving':
      return deriveAccess({ ...signedIn, preferenceLoaded: false });
    case 'client':
      return deriveAccess(signedIn);
    case 'worker':
      return deriveAccess({ ...signedIn, selectedMode: 'worker' });
    case 'bootstrapping':
      return deriveAccess(base);
  }
}

const matrix: Record<AccessPhase, RouteArea[]> = {
  bootstrapping: [],
  resolving: [],
  guest: ['guest', 'auth'],
  client: ['client'],
  worker: ['worker'],
};

describe('route policy', () => {
  test.each(Object.entries(matrix) as [AccessPhase, RouteArea[]][])('%s may enter only %j', (phase, allowed) => {
    for (const area of ['guest', 'auth', 'client', 'worker'] as const) {
      expect(canEnterArea(view(phase), area)).toBe(allowed.includes(area));
    }
  });

  test('an unverified identity with an active grant and a Worker selection is routed to Client only', () => {
    const unverified = deriveAccess({
      ...initialAccessState,
      bootstrapped: true,
      userId: 'user-a',
      identity: 'unverified',
      preferenceLoaded: true,
      selectedMode: 'worker',
      capability: { status: 'resolved', worker: 'active', refreshing: false },
    });
    expect(canEnterArea(unverified, 'worker')).toBe(false);
    expect(canEnterArea(unverified, 'client')).toBe(true);
    expect(destinationFor(unverified)).toBe('/client-home');
  });

  test('destinations never point at a protected area while unresolved', () => {
    expect(destinationFor(view('bootstrapping'))).toBeNull();
    expect(destinationFor(view('resolving'))).toBeNull();
    expect(destinationFor(view('guest'))).toBe('/explore');
    expect(destinationFor(view('client'))).toBe('/client-home');
    expect(destinationFor(view('worker'))).toBe('/worker-home');
  });
});
