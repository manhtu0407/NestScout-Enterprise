import { createClient } from '@supabase/supabase-js';

import { createChunkedStorage, type AsyncStringStorage } from './chunked-storage';

const sessionKey = 'sb-127.0.0.1-auth-token';
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function browser() {
  const data = new Map<string, string>();
  let writes = 0;
  let deletes = 0;
  const faults = { writeAt: 0, deleteAt: 0 };
  const localStorage = {
    getItem: jest.fn((key: string) => data.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      writes += 1;
      if (writes === faults.writeAt) throw new Error('browser storage quota exceeded');
      data.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      deletes += 1;
      if (deletes === faults.deleteAt) throw new Error('browser storage deletion refused');
      data.delete(key);
    }),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
  return { data, localStorage, faults, resetCounts: () => { writes = 0; deletes = 0; } };
}

function loadStorage(platform: 'web' | 'ios' | 'android', native?: Record<string, unknown>) {
  let storage: AsyncStringStorage | undefined;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    jest.doMock('expo-secure-store/build/ExpoSecureStore', () => native
      ? { __esModule: true, default: native }
      : jest.requireActual('expo-secure-store/build/ExpoSecureStore.web'));
    jest.doMock('expo-secure-store', () => jest.requireActual('expo-secure-store/build/SecureStore'));
    storage = jest.requireActual<typeof import('./device-storage')>('./device-storage').deviceStorage;
  });
  if (!storage) throw new Error('Storage module did not load');
  return storage;
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  jest.restoreAllMocks();
});

test('the actual installed SecureStore web module is unavailable while the browser adapter round-trips and removes a session', async () => {
  const memory = browser();
  const storage = loadStorage('web');
  const web = jest.requireActual('expo-secure-store/build/ExpoSecureStore.web').default;
  expect(Object.keys(web)).toEqual([]);
  let availability: Promise<boolean> | undefined;
  jest.isolateModules(() => {
    const api = jest.requireActual<typeof import('expo-secure-store')>('expo-secure-store/build/SecureStore');
    availability = api.isAvailableAsync();
  });
  await expect(availability).resolves.toBe(false);
  expect(await storage.getItem(sessionKey)).toBeNull();
  const value = JSON.stringify({ session: 'synthetic-session'.repeat(180) });
  await storage.setItem(sessionKey, value);
  expect(await storage.getItem(sessionKey)).toBe(value);
  expect(memory.data.size).toBeGreaterThan(3);
  await storage.removeItem(sessionKey);
  expect(await loadStorage('web').getItem(sessionKey)).toBeNull();
  expect(memory.data.size).toBe(0);
});

test('recreated storage and real Supabase Auth clients restore a session without a provider request', async () => {
  browser();
  const fetcher = jest.fn(async () => { throw new Error('Unexpected Auth network request'); });
  const value = {
    access_token: 'synthetic-local-access', refresh_token: 'synthetic-local-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-4000-8000-0000000000a1', aud: 'authenticated' },
  };
  await loadStorage('web').setItem(sessionKey, JSON.stringify(value));
  const clients = [loadStorage('web'), loadStorage('web')].map(storage => createClient('http://127.0.0.1:21202', 'synthetic-public-test-key', {
    global: { fetch: fetcher },
    auth: { storage, storageKey: sessionKey, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
  }));
  try {
    for (const client of clients) {
      const restored = await client.auth.getSession();
      expect(restored.error).toBeNull();
      expect(restored.data.session?.access_token).toBe(value.access_token);
    }
    expect(fetcher).not.toHaveBeenCalled();
    await loadStorage('web').removeItem(sessionKey);
    expect(await loadStorage('web').getItem(sessionKey)).toBeNull();
  } finally {
    for (const client of clients) client.auth.stopAutoRefresh();
  }
});

test.each(['read', 'write', 'remove'] as const)('restricted browser storage rejects %s visibly and the operation queue can recover', async operation => {
  const memory = browser();
  const blocked = new Error('browser storage denied');
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw blocked; } });
  const storage = loadStorage('web');
  const operations = {
    read: () => storage.getItem(sessionKey),
    write: () => storage.setItem(sessionKey, 'synthetic-session'),
    remove: () => storage.removeItem(sessionKey),
  };
  await expect(operations[operation]()).rejects.toBe(blocked);
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memory.localStorage });
  await storage.setItem(sessionKey, 'recovered-session');
  expect(await storage.getItem(sessionKey)).toBe('recovered-session');
});

test('an absent browser storage implementation rejects instead of returning an invented empty session', async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  const storage = loadStorage('web');
  await expect(storage.getItem(sessionKey)).rejects.toBeInstanceOf(TypeError);
  await expect(storage.setItem(sessionKey, 'synthetic-session')).rejects.toBeInstanceOf(TypeError);
  await expect(storage.removeItem(sessionKey)).rejects.toBeInstanceOf(TypeError);
});

test('browser keys and manifest bytes remain identical to the existing chunked storage contract', async () => {
  const memory = browser();
  const reference = new Map<string, string>();
  const storage = loadStorage('web');
  const expected = createChunkedStorage({
    getItemAsync: async key => reference.get(key) ?? null,
    setItemAsync: async (key, value) => { reference.set(key, value); },
    deleteItemAsync: async key => { reference.delete(key); },
  });
  const value = JSON.stringify({ session: 'synthetic-chunks'.repeat(200) });
  await storage.setItem(sessionKey, value);
  await expected.setItem(sessionKey, value);
  expect([...memory.data]).toEqual([...reference]);
});

test('missing or altered browser chunks cannot restore a partial session', async () => {
  const memory = browser();
  const storage = loadStorage('web');
  await storage.setItem(sessionKey, 'synthetic-session'.repeat(200));
  const chunk = [...memory.data.keys()].find(key => key.endsWith('.a1'));
  if (!chunk) throw new Error('Missing test chunk');
  const original = memory.data.get(chunk)!;
  memory.data.delete(chunk);
  await expect(loadStorage('web').getItem(sessionKey)).rejects.toMatchObject({ name: 'StorageIntegrityError' });
  memory.data.set(chunk, 'X'.repeat(original.length));
  await expect(loadStorage('web').getItem(sessionKey)).rejects.toMatchObject({ name: 'StorageIntegrityError' });
});

test('a quota failure preserves the previous committed session and removal clears abandoned partial chunks', async () => {
  const memory = browser();
  const storage = loadStorage('web');
  await storage.setItem(sessionKey, 'previous-session');
  memory.resetCounts();
  memory.faults.writeAt = 2;
  await expect(storage.setItem(sessionKey, 'replacement-session'.repeat(200))).rejects.toThrow('browser storage quota exceeded');
  memory.faults.writeAt = 0;
  expect(await loadStorage('web').getItem(sessionKey)).toBe('previous-session');
  await storage.removeItem(sessionKey);
  expect(memory.data.size).toBe(0);
});

test('a deletion failure after removing the manifest cannot resurrect a stale session', async () => {
  const memory = browser();
  const storage = loadStorage('web');
  await storage.setItem(sessionKey, 'synthetic-session'.repeat(150));
  memory.resetCounts();
  memory.faults.deleteAt = 2;
  await expect(storage.removeItem(sessionKey)).rejects.toThrow('browser storage deletion refused');
  expect(await loadStorage('web').getItem(sessionKey)).toBeNull();
  memory.faults.deleteAt = 0;
  await storage.removeItem(sessionKey);
  expect(memory.data.size).toBe(0);
});

test.each(['ios', 'android'] as const)('%s retains SecureStore selection, options and deletion semantics without touching browser storage', async platform => {
  const data = new Map<string, string>();
  const native = {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 7,
    getValueWithKeyAsync: jest.fn(async (key: string, _options: unknown) => data.get(key) ?? null),
    setValueWithKeyAsync: jest.fn(async (value: string, key: string, _options: unknown) => { data.set(key, value); }),
    deleteValueWithKeyAsync: jest.fn(async (key: string, _options: unknown) => { data.delete(key); }),
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, get: () => { throw new Error('Native must not touch browser storage'); } });
  const storage = loadStorage(platform, native);
  await storage.setItem(sessionKey, 'synthetic-native-session');
  expect(await storage.getItem(sessionKey)).toBe('synthetic-native-session');
  await storage.removeItem(sessionKey);
  expect(await storage.getItem(sessionKey)).toBeNull();
  expect(data.size).toBe(0);
  const options = { keychainAccessible: 7 };
  for (const [, actual] of native.getValueWithKeyAsync.mock.calls) expect(actual).toEqual(options);
  for (const [, , actual] of native.setValueWithKeyAsync.mock.calls) expect(actual).toEqual(options);
  for (const [, actual] of native.deleteValueWithKeyAsync.mock.calls) expect(actual).toEqual(options);
  expect(native.deleteValueWithKeyAsync).toHaveBeenCalled();
});

test('browser operations do not log session contents', async () => {
  browser();
  const spies = [jest.spyOn(console, 'log'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'error')];
  const value = 'synthetic-private-session-value';
  const storage = loadStorage('web');
  await storage.setItem(sessionKey, value);
  await storage.getItem(sessionKey);
  await storage.removeItem(sessionKey);
  for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(value);
});
