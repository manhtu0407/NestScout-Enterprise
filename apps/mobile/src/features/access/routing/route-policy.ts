import type { AccessView } from '../state/access-reducer';

export type RouteArea = 'guest' | 'auth' | 'client' | 'worker';

// Navigation control only. Every future Worker operation must still be
// authorized by the backend; this policy never substitutes for that.
export function canEnterArea(view: AccessView, area: RouteArea): boolean {
  switch (area) {
    case 'guest':
    case 'auth':
      return view.phase === 'guest';
    case 'client':
      return view.phase === 'client';
    case 'worker':
      return view.phase === 'worker';
  }
}

export type Destination = '/explore' | '/client-home' | '/worker-home';

export function destinationFor(view: AccessView): Destination | null {
  switch (view.phase) {
    case 'guest':
      return '/explore';
    case 'client':
      return '/client-home';
    case 'worker':
      return '/worker-home';
    case 'bootstrapping':
    case 'resolving':
      return null;
  }
}
