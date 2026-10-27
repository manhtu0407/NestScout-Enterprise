import { createChunkedStorage, type KeyValueStore } from './chunked-storage';

function memoryStore() {
  const data = new Map<string, string>();
  const store: KeyValueStore = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
    deleteItemAsync: async (key) => {
      data.delete(key);
    },
  };
  return { data, store };
}

describe('createChunkedStorage', () => {
  test('round-trips a value larger than one chunk using only keychain-safe keys', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 10);
    const value = JSON.stringify({ session: 'x'.repeat(95) });
    await storage.setItem('sb-127.0.0.1-auth-token', value);
    expect(await storage.getItem('sb-127.0.0.1-auth-token')).toBe(value);
    expect(data.size).toBeGreaterThan(2);
    for (const key of data.keys()) expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test('returns null for an absent key and for a value with a missing chunk', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 4);
    expect(await storage.getItem('k')).toBeNull();
    await storage.setItem('k', 'abcdefghij');
    data.delete('k.1');
    expect(await storage.getItem('k')).toBeNull();
  });

  test('shrinking a value removes stale chunks, and removal clears everything', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 4);
    await storage.setItem('k', 'abcdefghijkl');
    await storage.setItem('k', 'ab');
    expect([...data.keys()].sort()).toEqual(['k.0', 'k.count']);
    expect(await storage.getItem('k')).toBe('ab');
    await storage.removeItem('k');
    expect(data.size).toBe(0);
  });

  test('ignores a corrupt chunk count', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store);
    data.set('k.count', 'NaN');
    expect(await storage.getItem('k')).toBeNull();
  });
});
