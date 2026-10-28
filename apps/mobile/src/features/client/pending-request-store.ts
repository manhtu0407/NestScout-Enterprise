import { deviceStorage } from '@/lib/device-storage';

export type PendingRequest = { key: string; description: string };

function storageKey(userId: string): string {
  return `nestscout.pending-request.${userId}`;
}

export async function loadPendingRequest(userId: string): Promise<PendingRequest | null> {
  const raw = await deviceStorage.getItem(storageKey(userId));
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) throw new Error('Invalid pending request');
  const item = value as Record<string, unknown>;
  if (typeof item.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.key)
    || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 4000) {
    throw new Error('Invalid pending request');
  }
  return { key: item.key, description: item.description };
}

export function savePendingRequest(userId: string, item: PendingRequest): Promise<void> {
  return deviceStorage.setItem(storageKey(userId), JSON.stringify(item));
}

export function clearPendingRequest(userId: string): Promise<void> {
  return deviceStorage.removeItem(storageKey(userId));
}
