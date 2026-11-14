import type { OnboardingLocalStore } from './onboarding-local-store';
import type { OnboardingMark, OnboardingOutcome } from './onboarding-record';
import type { OnboardingRemote } from './onboarding-remote';

export type OnboardingDecision = Readonly<{ show: false } | { show: true; step: number }>;

export type OnboardingService = {
  evaluate(userId: string, signal: AbortSignal): Promise<OnboardingDecision>;
  progress(userId: string, step: number): Promise<void>;
  conclude(userId: string, outcome: OnboardingOutcome): Promise<void>;
};

export class OnboardingPersistError extends Error {
  constructor() {
    super('Onboarding completion could not be stored.');
    this.name = 'OnboardingPersistError';
  }
}

const hidden: OnboardingDecision = { show: false };

export function createOnboardingService(local: OnboardingLocalStore, remote: OnboardingRemote, now: () => Date = () => new Date()): OnboardingService {
  const concluded = new Set<string>();

  async function syncRemote(userId: string, mark: OnboardingMark): Promise<void> {
    try {
      if ((await remote.cachedMark(userId)) === null) await remote.writeMark(userId, mark);
    } catch {
      return;
    }
  }

  return {
    async evaluate(userId, signal) {
      if (concluded.has(userId)) return hidden;
      const entry = await local.read(userId);
      if (entry?.state === 'done') {
        void syncRemote(userId, { outcome: entry.outcome, at: entry.at });
        return hidden;
      }
      if (entry?.state === 'existing') return hidden;

      const mark = await remote.freshMark(userId);
      if (signal.aborted) return hidden;
      if (mark !== null) {
        await local.write(userId, { state: 'done', outcome: mark.outcome, at: mark.at }).catch(() => undefined);
        return hidden;
      }
      if (entry?.state === 'progress') return { show: true, step: entry.step };

      if (await remote.hasHistory(userId, signal)) {
        await local.write(userId, { state: 'existing' }).catch(() => undefined);
        return hidden;
      }
      return signal.aborted || concluded.has(userId) ? hidden : { show: true, step: 0 };
    },

    progress(userId, step) {
      return local.write(userId, { state: 'progress', step });
    },

    async conclude(userId, outcome) {
      concluded.add(userId);
      const mark: OnboardingMark = { outcome, at: now().toISOString() };
      const stored = await Promise.allSettled([
        local.write(userId, { state: 'done', outcome: mark.outcome, at: mark.at }),
        remote.writeMark(userId, mark),
      ]);
      if (stored.every(result => result.status === 'rejected')) throw new OnboardingPersistError();
    },
  };
}
