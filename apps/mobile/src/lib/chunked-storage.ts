export type KeyValueStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type AsyncStringStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export class StorageIntegrityError extends Error {
  constructor() {
    super('Stored value is incomplete or corrupt.');
    this.name = 'StorageIntegrityError';
  }
}

export class StorageCapacityError extends Error {
  constructor() {
    super('Value is too large for chunked storage.');
    this.name = 'StorageCapacityError';
  }
}

type Slot = 'a' | 'b';
type Manifest = { v: 1; slot: Slot; count: number; length: number; sum: number };

const maxChunks = 200;

function checksum(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

function parseManifest(raw: string): Manifest | null {
  try {
    const value = JSON.parse(raw) as Partial<Manifest> | null;
    if (
      value?.v === 1 &&
      (value.slot === 'a' || value.slot === 'b') &&
      Number.isInteger(value.count) && value.count! >= 1 && value.count! <= maxChunks &&
      Number.isInteger(value.length) && value.length! >= 0 &&
      Number.isInteger(value.sum)
    ) {
      return value as Manifest;
    }
    return null;
  } catch {
    return null;
  }
}

export function createChunkedStorage(store: KeyValueStore, chunkSize = 1000): AsyncStringStorage {
  const encode = (key: string) => key.replace(/[^A-Za-z0-9]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`);
  const manifestKey = (key: string) => `${encode(key)}.m`;
  const chunkKey = (key: string, slot: Slot, index: number) => `${encode(key)}.${slot}${index}`;

  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  }

  async function readManifest(key: string): Promise<Manifest | null> {
    const raw = await store.getItemAsync(manifestKey(key));
    if (raw === null) return null;
    const manifest = parseManifest(raw);
    if (!manifest) throw new StorageIntegrityError();
    return manifest;
  }

  async function purgeSlot(key: string, slot: Slot, from: number) {
    let end = from;
    while ((await store.getItemAsync(chunkKey(key, slot, end))) !== null) end += 1;
    for (let index = end - 1; index >= from; index--) await store.deleteItemAsync(chunkKey(key, slot, index));
  }

  return {
    getItem: (key) =>
      serialize(async () => {
        const manifest = await readManifest(key);
        if (manifest === null) return null;
        const parts: string[] = [];
        for (let index = 0; index < manifest.count; index++) {
          const part = await store.getItemAsync(chunkKey(key, manifest.slot, index));
          if (part === null) throw new StorageIntegrityError();
          parts.push(part);
        }
        const value = parts.join('');
        if (value.length !== manifest.length || checksum(value) !== manifest.sum) throw new StorageIntegrityError();
        return value;
      }),

    setItem: (key, value) =>
      serialize(async () => {
        const chunks: string[] = [];
        for (let offset = 0; offset < value.length; offset += chunkSize) chunks.push(value.slice(offset, offset + chunkSize));
        if (chunks.length === 0) chunks.push('');
        if (chunks.length > maxChunks) throw new StorageCapacityError();

        let previous: Manifest | null = null;
        try {
          previous = await readManifest(key);
        } catch (error) {
          if (!(error instanceof StorageIntegrityError)) throw error;
        }
        const slot: Slot = previous?.slot === 'a' ? 'b' : 'a';

        for (let index = 0; index < chunks.length; index++) await store.setItemAsync(chunkKey(key, slot, index), chunks[index] ?? '');
        const manifest: Manifest = { v: 1, slot, count: chunks.length, length: value.length, sum: checksum(value) };
        await store.setItemAsync(manifestKey(key), JSON.stringify(manifest));

        try {
          await purgeSlot(key, slot, chunks.length);
          if (previous) await purgeSlot(key, previous.slot, 0);
        } catch {
          return;
        }
      }),

    removeItem: (key) =>
      serialize(async () => {
        await store.deleteItemAsync(manifestKey(key));
        await purgeSlot(key, 'a', 0);
        await purgeSlot(key, 'b', 0);
      }),
  };
}
