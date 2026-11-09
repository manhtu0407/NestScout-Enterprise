import { createPreferencesStore, defaultPreferences, parsePreferences } from './preferences';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => { value = next; },
    removeItem: async () => { value = null; },
    read: () => value,
  };
}

test('parsePreferences falls back to defaults for missing, corrupt or invalid values', () => {
  expect(parsePreferences(null)).toEqual(defaultPreferences);
  expect(parsePreferences('{bad')).toEqual(defaultPreferences);
  expect(parsePreferences('42')).toEqual(defaultPreferences);
  expect(parsePreferences(JSON.stringify({ appearance: 'neon', language: 'fr', reduceMotion: 'yes' }))).toEqual(defaultPreferences);
});

test('parsePreferences keeps valid values', () => {
  expect(parsePreferences(JSON.stringify({ appearance: 'dark', language: 'en', reduceMotion: true }))).toEqual({ appearance: 'dark', language: 'en', reduceMotion: true });
});

test('the store round-trips preferences and recovers from a failing read', async () => {
  const storage = memoryStorage();
  const store = createPreferencesStore(storage);
  await store.save({ appearance: 'light', language: 'en', reduceMotion: true });
  expect(await store.load()).toEqual({ appearance: 'light', language: 'en', reduceMotion: true });
  const broken = createPreferencesStore({ ...storage, getItem: async () => { throw new Error('unreadable'); } });
  expect(await broken.load()).toEqual(defaultPreferences);
});
