import type { AsyncStringStorage } from '@/lib/chunked-storage';

import { createOnboardingLocalStore, onboardingAccountCapacity, onboardingStorageKey } from './onboarding-local-store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: AsyncStringStorage = {
    getItem: async key => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async key => {
      data.delete(key);
    },
  };
  return { data, storage };
}

const done = { state: 'done', outcome: 'completed', at: '2026-11-14T08:00:00.000Z' } as const;

describe('onboarding local store', () => {
  test('keeps each account entry apart', async () => {
    const store = createOnboardingLocalStore(memoryStorage().storage);
    await store.write('user-a', done);
    await store.write('user-b', { state: 'progress', step: 2 });
    expect(await store.read('user-a')).toEqual(done);
    expect(await store.read('user-b')).toEqual({ state: 'progress', step: 2 });
    expect(await store.read('user-c')).toBeNull();
  });

  test('overwrites an entry for the same account', async () => {
    const store = createOnboardingLocalStore(memoryStorage().storage);
    await store.write('user-a', { state: 'progress', step: 1 });
    await store.write('user-a', done);
    expect(await store.read('user-a')).toEqual(done);
  });

  test('persists across store instances over the same storage', async () => {
    const { storage } = memoryStorage();
    await createOnboardingLocalStore(storage).write('user-a', done);
    expect(await createOnboardingLocalStore(storage).read('user-a')).toEqual(done);
  });

  test('keeps every write when several are issued at once', async () => {
    const store = createOnboardingLocalStore(memoryStorage().storage);
    await Promise.all([store.write('user-a', done), store.write('user-b', { state: 'existing' }), store.write('user-c', { state: 'progress', step: 1 })]);
    expect(await store.read('user-a')).toEqual(done);
    expect(await store.read('user-b')).toEqual({ state: 'existing' });
    expect(await store.read('user-c')).toEqual({ state: 'progress', step: 1 });
  });

  test('evicts the oldest account once capacity is exceeded', async () => {
    const store = createOnboardingLocalStore(memoryStorage().storage);
    for (let index = 0; index <= onboardingAccountCapacity; index += 1) await store.write(`user-${index}`, { state: 'existing' });
    expect(await store.read('user-0')).toBeNull();
    expect(await store.read('user-1')).toEqual({ state: 'existing' });
    expect(await store.read(`user-${onboardingAccountCapacity}`)).toEqual({ state: 'existing' });
  });

  test('a rewritten account becomes the newest and survives eviction', async () => {
    const store = createOnboardingLocalStore(memoryStorage().storage);
    for (let index = 0; index < onboardingAccountCapacity; index += 1) await store.write(`user-${index}`, { state: 'existing' });
    await store.write('user-0', done);
    await store.write('user-new', { state: 'existing' });
    expect(await store.read('user-0')).toEqual(done);
    expect(await store.read('user-1')).toBeNull();
  });

  test.each([
    ['unparseable text', 'not json'],
    ['a non-object', JSON.stringify('x')],
    ['a missing accounts map', JSON.stringify({ v: 1 })],
    ['a non-object accounts map', JSON.stringify({ v: 1, accounts: 3 })],
  ])('reads nothing from %s', async (_name, raw) => {
    const store = createOnboardingLocalStore(memoryStorage({ [onboardingStorageKey]: raw }).storage);
    expect(await store.read('user-a')).toBeNull();
  });

  test('drops malformed entries and keeps the valid ones', async () => {
    const raw = JSON.stringify({ v: 1, accounts: { 'user-a': { state: 'existing' }, 'user-b': { state: 'progress', step: -3 } } });
    const store = createOnboardingLocalStore(memoryStorage({ [onboardingStorageKey]: raw }).storage);
    expect(await store.read('user-a')).toEqual({ state: 'existing' });
    expect(await store.read('user-b')).toBeNull();
  });

  test('treats a failing read as an empty store', async () => {
    const storage: AsyncStringStorage = {
      getItem: async () => { throw new Error('storage offline'); },
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    expect(await createOnboardingLocalStore(storage).read('user-a')).toBeNull();
  });

  test('surfaces a failing write and stays usable afterwards', async () => {
    const { data } = memoryStorage();
    let failing = true;
    const storage: AsyncStringStorage = {
      getItem: async key => data.get(key) ?? null,
      setItem: async (key, value) => {
        if (failing) throw new Error('disk full');
        data.set(key, value);
      },
      removeItem: async () => undefined,
    };
    const store = createOnboardingLocalStore(storage);
    await expect(store.write('user-a', done)).rejects.toThrow('disk full');
    failing = false;
    await store.write('user-a', done);
    expect(await store.read('user-a')).toEqual(done);
  });

  test('a write never replaces records it could not read', async () => {
    const { data } = memoryStorage({ [onboardingStorageKey]: JSON.stringify({ v: 1, accounts: { 'user-a': done } }) });
    let reading = false;
    const storage: AsyncStringStorage = {
      getItem: async key => {
        if (reading) throw new Error('storage offline');
        return data.get(key) ?? null;
      },
      setItem: async (key, value) => { data.set(key, value); },
      removeItem: async () => undefined,
    };
    const store = createOnboardingLocalStore(storage);
    reading = true;
    await expect(store.write('user-b', done)).rejects.toThrow('storage offline');
    reading = false;
    expect(await store.read('user-a')).toEqual(done);
    expect(await store.read('user-b')).toBeNull();
  });

  test('honours a custom storage key', async () => {
    const { data, storage } = memoryStorage();
    await createOnboardingLocalStore(storage, 'custom.key').write('user-a', done);
    expect([...data.keys()]).toEqual(['custom.key']);
  });
});
