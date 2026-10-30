import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

import { LoadingView } from '@/features/shared';

import { destinationFor } from '../routing/route-policy';
import { useAccess } from '../state/access-provider';

export function EntryRedirect({ pending }: { pending?: (label: string) => ReactNode }) {
  const access = useAccess();
  const destination = destinationFor(access);
  if (destination === null) {
    const label = access.phase === 'bootstrapping' ? 'Starting NestScout' : 'Checking your account';
    return pending ? <>{pending(label)}</> : <LoadingView label={label} />;
  }
  return <Redirect href={destination} />;
}
