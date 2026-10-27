import { Redirect } from 'expo-router';

import { LoadingView } from '@/features/shared';

import { destinationFor } from '../routing/route-policy';
import { useAccess } from '../state/access-provider';

// Single place that turns access state into a destination; renders nothing
// protected while the session or capabilities are still being resolved.
export function EntryRedirect() {
  const access = useAccess();
  const destination = destinationFor(access);
  if (destination === null) {
    return <LoadingView label={access.phase === 'bootstrapping' ? 'Starting NestScout' : 'Checking your account'} />;
  }
  return <Redirect href={destination} />;
}
