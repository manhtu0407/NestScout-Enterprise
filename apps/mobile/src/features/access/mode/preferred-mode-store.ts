import type { AsyncStringStorage } from '@/lib/chunked-storage';

import { isAppMode, type AppMode } from './app-mode';

const storageKey = 'nestscout.preferred-mode';

export type PreferredModeStore = {
  load(userId: string): Promise<AppMode | null>;
  save(userId: string, mode: AppMode): Promise<void>;
  clear(): Promise<void>;
};

export function createPreferredModeStore(storage: AsyncStringStorage): PreferredModeStore {
  return {
    async load(userId) {
      try {
        const raw = await storage.getItem(storageKey);
        if (raw === null) return null;
        const value = JSON.parse(raw) as { userId?: unknown; mode?: unknown };
        return value.userId === userId && isAppMode(value.mode) ? value.mode : null;
      } catch {
        return null;
      }
    },
    save: (userId, mode) => storage.setItem(storageKey, JSON.stringify({ userId, mode })),
    clear: () => storage.removeItem(storageKey),
  };
}
