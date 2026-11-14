import type { AsyncStringStorage } from '@/lib/chunked-storage';

import { parseEntry, type OnboardingEntry } from './onboarding-record';

export const onboardingStorageKey = 'nestscout.onboarding';
export const onboardingAccountCapacity = 16;

export type OnboardingLocalStore = {
  read(userId: string): Promise<OnboardingEntry | null>;
  write(userId: string, entry: OnboardingEntry): Promise<void>;
};

type Accounts = Record<string, OnboardingEntry>;

function parseAccounts(raw: string | null): Accounts {
  if (raw === null) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return {};
    const accounts = (value as { accounts?: unknown }).accounts;
    if (typeof accounts !== 'object' || accounts === null) return {};
    const parsed: Accounts = {};
    for (const [userId, candidate] of Object.entries(accounts)) {
      const entry = parseEntry(candidate);
      if (entry !== null) parsed[userId] = entry;
    }
    return parsed;
  } catch {
    return {};
  }
}

export function createOnboardingLocalStore(storage: AsyncStringStorage, key = onboardingStorageKey): OnboardingLocalStore {
  async function load(): Promise<Accounts> {
    return parseAccounts(await storage.getItem(key));
  }

  let tail: Promise<unknown> = Promise.resolve();

  return {
    async read(userId) {
      await tail;
      try {
        return (await load())[userId] ?? null;
      } catch {
        return null;
      }
    },

    write(userId, entry) {
      const run = async () => {
        const accounts = await load();
        delete accounts[userId];
        accounts[userId] = entry;
        const ids = Object.keys(accounts);
        for (const evicted of ids.slice(0, Math.max(0, ids.length - onboardingAccountCapacity))) delete accounts[evicted];
        await storage.setItem(key, JSON.stringify({ v: 1, accounts }));
      };
      const result = tail.then(run, run);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
