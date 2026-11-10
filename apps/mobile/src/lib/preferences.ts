import type { AsyncStringStorage } from './chunked-storage';

export const appearances = ['system', 'light', 'dark'] as const;
export const languages = ['vi', 'en'] as const;

export type Appearance = (typeof appearances)[number];
export type Language = (typeof languages)[number];
export type Preferences = Readonly<{ appearance: Appearance; language: Language; reduceMotion: boolean }>;

export const defaultPreferences: Preferences = { appearance: 'system', language: 'vi', reduceMotion: false };

const storageKey = 'nestscout.preferences';

export function isAppearance(value: unknown): value is Appearance {
  return appearances.some(item => item === value);
}

export function isLanguage(value: unknown): value is Language {
  return languages.some(item => item === value);
}

export function parsePreferences(raw: string | null): Preferences {
  if (raw === null) return defaultPreferences;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return defaultPreferences;
    const record = value as Record<string, unknown>;
    return {
      appearance: isAppearance(record.appearance) ? record.appearance : defaultPreferences.appearance,
      language: isLanguage(record.language) ? record.language : defaultPreferences.language,
      reduceMotion: record.reduceMotion === true,
    };
  } catch {
    return defaultPreferences;
  }
}

export type PreferencesStore = {
  load(): Promise<Preferences>;
  save(preferences: Preferences): Promise<void>;
};

export function createPreferencesStore(storage: AsyncStringStorage, key = storageKey): PreferencesStore {
  return {
    async load() {
      try {
        return parsePreferences(await storage.getItem(key));
      } catch {
        return defaultPreferences;
      }
    },
    save: preferences => storage.setItem(key, JSON.stringify(preferences)),
  };
}
