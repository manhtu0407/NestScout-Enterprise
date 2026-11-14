import { authenticatedRequest } from '@/lib/authenticated-rest';
import type { getSupabaseClient } from '@/lib/supabase-client';

import { markFromUser, metadataFor, type OnboardingMark } from './onboarding-record';

export type OnboardingRemote = {
  cachedMark(userId: string): Promise<OnboardingMark | null>;
  freshMark(userId: string): Promise<OnboardingMark | null>;
  writeMark(userId: string, mark: OnboardingMark): Promise<void>;
  hasHistory(userId: string, signal: AbortSignal): Promise<boolean>;
};

export class OnboardingUnavailableError extends Error {
  constructor(reason: string) {
    super(`Onboarding state unavailable: ${reason}`);
    this.name = 'OnboardingUnavailableError';
  }
}

type RestRequest = typeof authenticatedRequest;
type SupabaseClient = ReturnType<typeof getSupabaseClient>;

const historyQueries = ['kael_conversations?select=id&limit=1', 'service_requests?select=id&limit=1'] as const;

export function createSupabaseOnboardingRemote(client: SupabaseClient, request: RestRequest = authenticatedRequest): OnboardingRemote {
  return {
    async cachedMark(userId) {
      const { data, error } = await client.auth.getSession();
      if (error || data.session?.user.id !== userId) throw new OnboardingUnavailableError('session');
      return markFromUser(data.session.user);
    },

    async freshMark(userId) {
      const { data, error } = await client.auth.getUser();
      if (error || data.user?.id !== userId) throw new OnboardingUnavailableError('user');
      return markFromUser(data.user);
    },

    async writeMark(userId, mark) {
      const session = await client.auth.getSession();
      if (session.error || session.data.session?.user.id !== userId) throw new OnboardingUnavailableError('account');
      const { data, error } = await client.auth.updateUser({ data: metadataFor(mark) });
      if (error || data.user?.id !== userId) throw new OnboardingUnavailableError('write');
    },

    async hasHistory(userId, signal) {
      const found = await Promise.all(historyQueries.map(async query => {
        const response = await request(userId, query, { method: 'GET', signal });
        if (!response.ok) throw new OnboardingUnavailableError(`history ${response.status}`);
        const body: unknown = await response.json();
        if (!Array.isArray(body)) throw new OnboardingUnavailableError('history body');
        return body.length > 0;
      }));
      return found.some(Boolean);
    },
  };
}
