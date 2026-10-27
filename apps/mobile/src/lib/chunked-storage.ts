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

const maxChunks = 200;

// Keychain-backed stores limit key characters and value size, while a Supabase
// session JSON exceeds that size, so one value is split across numbered entries.
export function createChunkedStorage(store: KeyValueStore, chunkSize = 1000): AsyncStringStorage {
  const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
  const countKey = (key: string) => `${safe(key)}.count`;
  const chunkKey = (key: string, index: number) => `${safe(key)}.${index}`;

  async function storedCount(key: string): Promise<number> {
    const raw = await store.getItemAsync(countKey(key));
    const count = raw === null ? 0 : Number(raw);
    return Number.isInteger(count) && count >= 0 && count <= maxChunks ? count : 0;
  }

  async function removeFrom(key: string, first: number, count: number) {
    for (let index = first; index < count; index++) await store.deleteItemAsync(chunkKey(key, index));
  }

  return {
    async getItem(key) {
      const count = await storedCount(key);
      if (count === 0) return null;
      const parts: string[] = [];
      for (let index = 0; index < count; index++) {
        const part = await store.getItemAsync(chunkKey(key, index));
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const previous = await storedCount(key);
      const chunks: string[] = [];
      for (let offset = 0; offset < value.length; offset += chunkSize) chunks.push(value.slice(offset, offset + chunkSize));
      if (chunks.length > maxChunks) throw new Error('Value is too large for chunked storage.');
      for (let index = 0; index < chunks.length; index++) await store.setItemAsync(chunkKey(key, index), chunks[index] ?? '');
      await store.setItemAsync(countKey(key), String(chunks.length));
      await removeFrom(key, chunks.length, previous);
    },
    async removeItem(key) {
      const count = await storedCount(key);
      await store.deleteItemAsync(countKey(key));
      await removeFrom(key, 0, count);
    },
  };
}
