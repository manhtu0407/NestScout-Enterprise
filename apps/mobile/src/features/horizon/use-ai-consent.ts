import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { readConsent, recordConsent } from '@/features/shared';

import { legalDocument } from './legal-content';

export type AiConsentStatus = 'signed_out' | 'loading' | 'ready' | 'error';

export type AiConsent = {
  status: AiConsentStatus;
  granted: boolean;
  set: (granted: boolean) => Promise<void>;
  markRequired: () => void;
};

const policyVersion = legalDocument('vi', 'privacy').versionId;

export function useAiConsent(userId: string | null): AiConsent {
  const [state, setState] = useState<{ userId: string | null; status: AiConsentStatus; granted: boolean }>({ userId: null, status: 'loading', granted: false });

  useFocusEffect(useCallback(() => {
    if (userId === null) return undefined;
    const controller = new AbortController();
    readConsent(userId, 'ai_sharing', controller.signal).then(
      granted => setState({ userId, status: 'ready', granted }),
      () => { if (!controller.signal.aborted) setState({ userId, status: 'error', granted: false }); },
    );
    return () => controller.abort();
  }, [userId]));

  const set = useCallback(async (granted: boolean) => {
    if (userId === null) throw new Error('Sign-in required');
    await recordConsent(userId, 'ai_sharing', granted, policyVersion, new AbortController().signal);
    setState({ userId, status: 'ready', granted });
  }, [userId]);

  const markRequired = useCallback(() => {
    if (userId !== null) setState({ userId, status: 'ready', granted: false });
  }, [userId]);

  return useMemo(() => {
    if (userId === null) return { status: 'signed_out' as const, granted: false, set, markRequired };
    if (state.userId !== userId) return { status: 'loading' as const, granted: false, set, markRequired };
    return { status: state.status, granted: state.granted, set, markRequired };
  }, [userId, state, set, markRequired]);
}
