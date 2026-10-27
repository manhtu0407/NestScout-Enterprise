import { Redirect } from 'expo-router';

import { LoadingView } from '@/features/shared';

import { destinationFor } from '../routing/route-policy';
import { useAccess } from '../state/access-provider';

export function EntryRedirect() {
  const access = useAccess();
  const destination = destinationFor(access);
  if (destination === null) {
    return <LoadingView label={access.phase === 'bootstrapping' ? 'Starting NestScout' : 'Checking your account'} />;
  }
  return <Redirect href={destination} />;
}
