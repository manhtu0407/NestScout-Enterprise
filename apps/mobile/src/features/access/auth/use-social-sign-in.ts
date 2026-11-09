import { useCallback, useEffect, useRef, useState } from 'react';

import { useAccess } from '../state/access-provider';
import type { AuthFailure, SocialProvider } from './auth-gateway';

export type SocialSignInState = {
  busy: boolean;
  failure: AuthFailure | null;
  signIn(provider: SocialProvider): Promise<void>;
};

export function useSocialSignIn(): SocialSignInState {
  const access = useAccess();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const signIn = useCallback(
    async (provider: SocialProvider) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setFailure(null);
      try {
        const outcome = await access.signInWithProvider(provider);
        if (!outcome.ok && mounted.current) setFailure(outcome.failure);
      } finally {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [access],
  );

  return { busy, failure: failure ?? access.redirectFailure, signIn };
}
