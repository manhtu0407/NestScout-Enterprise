import type { AsyncStringStorage } from '@/lib/chunked-storage';

import { createPreferredModeStore } from './preferred-mode-store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: AsyncStringStorage = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  return { data, storage };
}

describe('preferred mode store', () => {
  test('returns a saved mode only to the account that saved it', async () => {
    const { storage } = memoryStorage();
    const store = createPreferredModeStore(storage);
    await store.save('user-a', 'worker');
    expect(await store.load('user-a')).toBe('worker');
    expect(await store.load('user-b')).toBeNull();
  });

  test.each([
    ['unparseable text', 'not json'],
    ['an unknown mode', JSON.stringify({ userId: 'user-a', mode: 'admin' })],
    ['a missing account', JSON.stringify({ mode: 'worker' })],
    ['a non-object', JSON.stringify('worker')],
  ])('ignores %s', async (_name, raw) => {
    const { storage } = memoryStorage({ 'nestscout.preferred-mode': raw });
    expect(await createPreferredModeStore(storage).load('user-a')).toBeNull();
  });

  test('clear removes the preference', async () => {
    const { data, storage } = memoryStorage();
    const store = createPreferredModeStore(storage);
    await store.save('user-a', 'worker');
    await store.clear();
    expect(data.size).toBe(0);
  });
});
