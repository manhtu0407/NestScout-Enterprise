import { createChunkedStorage, StorageCapacityError, StorageIntegrityError, type KeyValueStore } from './chunked-storage';

type Fault = { at: number; mode: 'reject' | 'apply-then-reject'; only?: 'delete' };

function memoryStore() {
  const data = new Map<string, string>();
  let operations = 0;
  let fault: Fault | null = null;
  let latency = false;

  async function run<T>(kind: 'get' | 'set' | 'delete', action: () => T): Promise<T> {
    if (latency) await Promise.resolve().then(() => Promise.resolve());
    operations += 1;
    const failing = fault && (fault.only ? kind === fault.only : operations === fault.at);
    if (failing && fault?.mode === 'reject') throw new Error('keychain failure');
    const result = action();
    if (failing && fault?.mode === 'apply-then-reject') throw new Error('keychain failure after write');
    return result;
  }

  const store: KeyValueStore = {
    getItemAsync: (key) => run('get', () => data.get(key) ?? null),
    setItemAsync: (key, value) =>
      run('set', () => {
        data.set(key, value);
      }),
    deleteItemAsync: (key) =>
      run('delete', () => {
        data.delete(key);
      }),
  };
  return {
    data,
    store,
    operations: () => operations,
    resetOperations: () => {
      operations = 0;
    },
    inject: (next: Fault | null) => {
      fault = next;
    },
    setLatency: (on: boolean) => {
      latency = on;
    },
  };
}

const oldValue = JSON.stringify({ session: 'old'.repeat(40) });
const newValue = JSON.stringify({ session: 'new'.repeat(55) });

describe('createChunkedStorage', () => {
  test('round-trips a multi-chunk value using only keychain-safe keys', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 10);
    const value = JSON.stringify({ session: 'x'.repeat(95) });
    await storage.setItem('sb-127.0.0.1-auth-token', value);
    expect(await storage.getItem('sb-127.0.0.1-auth-token')).toBe(value);
    expect(data.size).toBeGreaterThan(2);
    for (const key of data.keys()) expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  test('keys that differ only in unsafe characters never collide', async () => {
    const { store } = memoryStore();
    const storage = createChunkedStorage(store, 8);
    await storage.setItem('a/b', 'slash');
    await storage.setItem('a_b', 'underscore');
    await storage.setItem('a_2f_b', 'literal-escape');
    await storage.setItem('a.b', 'dot');
    expect(await storage.getItem('a/b')).toBe('slash');
    expect(await storage.getItem('a_b')).toBe('underscore');
    expect(await storage.getItem('a_2f_b')).toBe('literal-escape');
    expect(await storage.getItem('a.b')).toBe('dot');
    await storage.removeItem('a/b');
    expect(await storage.getItem('a_b')).toBe('underscore');
  });

  test('stores an empty string and returns null for an absent key', async () => {
    const { store } = memoryStore();
    const storage = createChunkedStorage(store);
    expect(await storage.getItem('k')).toBeNull();
    await storage.setItem('k', '');
    expect(await storage.getItem('k')).toBe('');
  });

  test('replacing with a shorter value keeps only the new generation', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 4);
    await storage.setItem('k', 'abcdefghijkl');
    await storage.setItem('k', 'ab');
    expect(await storage.getItem('k')).toBe('ab');
    expect(data.size).toBe(2);
  });

  test('removal clears every stored item, even after a lost manifest', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 4);
    await storage.setItem('k', 'abcdefghij');
    await storage.setItem('k', 'klmnopqrstuvwx');
    await storage.removeItem('k');
    expect(data.size).toBe(0);

    await storage.setItem('k', 'abcdefghij');
    data.delete([...data.keys()].find((key) => key.endsWith('.m')) as string);
    await storage.removeItem('k');
    expect(data.size).toBe(0);
  });

  test('refuses oversized values before touching the committed value', async () => {
    const { data, store } = memoryStore();
    const storage = createChunkedStorage(store, 2);
    await storage.setItem('k', 'ab');
    const before = new Map(data);
    await expect(storage.setItem('k', 'x'.repeat(401))).rejects.toBeInstanceOf(StorageCapacityError);
    expect(data).toEqual(before);
    expect(await storage.getItem('k')).toBe('ab');
  });
});

describe('interrupted replacement', () => {
  async function operationsForReplacement() {
    const probe = memoryStore();
    const storage = createChunkedStorage(probe.store, 16);
    await storage.setItem('k', oldValue);
    probe.resetOperations();
    await storage.setItem('k', newValue);
    return probe.operations();
  }

  test.each(['reject', 'apply-then-reject'] as const)('a keychain failure (%s) at any step leaves a complete old or new value', async (mode) => {
    const total = await operationsForReplacement();
    expect(total).toBeGreaterThan(8);
    for (let at = 1; at <= total; at++) {
      const { data, store, inject, resetOperations } = memoryStore();
      const storage = createChunkedStorage(store, 16);
      await storage.setItem('k', oldValue);
      resetOperations();
      inject({ at, mode });
      await storage.setItem('k', newValue).catch(() => undefined);
      inject(null);

      const restarted = createChunkedStorage(store, 16);
      const read = await restarted.getItem('k');
      expect([oldValue, newValue]).toContain(read);

      await restarted.setItem('k', newValue);
      expect(await restarted.getItem('k')).toBe(newValue);
      expect(data.size).toBeGreaterThan(0);
    }
  });

  test('a failure before the manifest commit always keeps the previous value', async () => {
    const { store, inject, resetOperations } = memoryStore();
    const storage = createChunkedStorage(store, 16);
    await storage.setItem('k', oldValue);
    resetOperations();
    inject({ at: 3, mode: 'reject' });
    await expect(storage.setItem('k', newValue)).rejects.toThrow('keychain failure');
    inject(null);
    expect(await storage.getItem('k')).toBe(oldValue);
  });

  test('cleanup failures after the commit do not change the stored value or the result', async () => {
    const { store, inject } = memoryStore();
    const storage = createChunkedStorage(store, 16);
    await storage.setItem('k', oldValue);
    inject({ at: 0, mode: 'reject', only: 'delete' });
    await expect(storage.setItem('k', newValue)).resolves.toBeUndefined();
    inject(null);
    expect(await storage.getItem('k')).toBe(newValue);
    await storage.setItem('k', oldValue);
    expect(await storage.getItem('k')).toBe(oldValue);
  });

  test('an unreadable keychain at write time fails instead of replacing a value that may be intact', async () => {
    const { store, inject, resetOperations } = memoryStore();
    const storage = createChunkedStorage(store, 16);
    await storage.setItem('k', oldValue);
    resetOperations();
    inject({ at: 1, mode: 'reject' });
    await expect(storage.setItem('k', newValue)).rejects.toThrow('keychain failure');
    inject(null);
    expect(await storage.getItem('k')).toBe(oldValue);
  });
});

describe('damaged storage', () => {
  async function stored() {
    const memory = memoryStore();
    const storage = createChunkedStorage(memory.store, 8);
    await storage.setItem('k', oldValue);
    return { ...memory, storage };
  }

  test('a missing chunk is reported as an integrity failure, not a partial value', async () => {
    const { data, storage } = await stored();
    data.delete([...data.keys()].find((key) => /\.[ab]1$/.test(key)) as string);
    await expect(storage.getItem('k')).rejects.toBeInstanceOf(StorageIntegrityError);
  });

  test('an altered chunk of the same length is detected', async () => {
    const { data, storage } = await stored();
    const key = [...data.keys()].find((name) => /\.[ab]0$/.test(name)) as string;
    data.set(key, 'X'.repeat((data.get(key) as string).length));
    await expect(storage.getItem('k')).rejects.toBeInstanceOf(StorageIntegrityError);
  });

  test('a corrupt manifest fails reads, is replaced by the next write and cleared by removal', async () => {
    const { data, storage } = await stored();
    const manifest = [...data.keys()].find((name) => name.endsWith('.m')) as string;
    data.set(manifest, '{"v":1,"slot":"z"}');
    await expect(storage.getItem('k')).rejects.toBeInstanceOf(StorageIntegrityError);
    await storage.setItem('k', newValue);
    expect(await storage.getItem('k')).toBe(newValue);

    data.set(manifest, 'not json');
    await storage.removeItem('k');
    expect(data.size).toBe(0);
  });
});

describe('concurrency', () => {
  test('overlapping writes and removals apply in call order and never expose a mixture', async () => {
    const memory = memoryStore();
    memory.setLatency(true);
    const storage = createChunkedStorage(memory.store, 7);
    const values = ['a'.repeat(50), 'b'.repeat(23), 'c'.repeat(61)];
    const reads: (string | null)[] = [];
    const pending: Promise<unknown>[] = [
      storage.setItem('k', values[0] as string),
      storage.getItem('k').then((value) => reads.push(value)),
      storage.setItem('k', values[1] as string),
      storage.getItem('k').then((value) => reads.push(value)),
      storage.removeItem('k'),
      storage.getItem('k').then((value) => reads.push(value)),
      storage.setItem('k', values[2] as string),
      storage.getItem('k').then((value) => reads.push(value)),
    ];
    await Promise.all(pending);
    expect(reads).toEqual([values[0], values[1], null, values[2]]);
    expect(await storage.getItem('k')).toBe(values[2]);
  });

  test('a failed operation does not block the queue', async () => {
    const memory = memoryStore();
    const storage = createChunkedStorage(memory.store, 4);
    memory.inject({ at: 1, mode: 'reject' });
    const failed = storage.setItem('k', 'abcdef');
    const next = storage.setItem('k', 'ghijkl');
    await expect(failed).rejects.toThrow();
    memory.inject(null);
    await next;
    expect(await storage.getItem('k')).toBe('ghijkl');
  });
});
