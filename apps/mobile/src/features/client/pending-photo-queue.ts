import { acceptedImageTypes, uploadRequestPhoto, type PendingPhoto } from '@/features/shared';
import { deviceStorage } from '@/lib/device-storage';

export const maxPhotoAttempts = 5;

export type QueuedPhoto = PendingPhoto & { requestId: string; attempts: number };

export type FlushResult = { remaining: readonly QueuedPhoto[]; uploaded: number; dropped: number };

type Upload = (userId: string, requestId: string, photo: PendingPhoto, signal: AbortSignal) => Promise<void>;

function storageKey(userId: string): string {
  return `nestscout.pending-photos.${userId}`;
}

function parseQueuedPhoto(value: unknown): QueuedPhoto {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid pending photo');
  const item = value as Record<string, unknown>;
  if (typeof item.requestId !== 'string' || !item.requestId
    || typeof item.name !== 'string' || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/i.test(item.name)
    || typeof item.uri !== 'string' || !item.uri
    || typeof item.mimeType !== 'string' || !acceptedImageTypes.includes(item.mimeType)
    || typeof item.attempts !== 'number' || !Number.isInteger(item.attempts) || item.attempts < 0 || item.attempts >= maxPhotoAttempts) {
    throw new Error('Invalid pending photo');
  }
  return { requestId: item.requestId, name: item.name, uri: item.uri, mimeType: item.mimeType, attempts: item.attempts };
}

export async function loadQueuedPhotos(userId: string): Promise<readonly QueuedPhoto[]> {
  const raw = await deviceStorage.getItem(storageKey(userId));
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid pending photo');
  return value.map(parseQueuedPhoto);
}

export function saveQueuedPhotos(userId: string, items: readonly QueuedPhoto[]): Promise<void> {
  return items.length === 0 ? deviceStorage.removeItem(storageKey(userId)) : deviceStorage.setItem(storageKey(userId), JSON.stringify(items));
}

export async function flushQueuedPhotos(userId: string, items: readonly QueuedPhoto[], signal: AbortSignal, upload: Upload = uploadRequestPhoto): Promise<FlushResult> {
  let remaining = [...items];
  let uploaded = 0;
  let dropped = 0;
  for (const item of items) {
    if (signal.aborted) break;
    const { requestId, attempts, ...photo } = item;
    let replacement: QueuedPhoto | null = null;
    try {
      await upload(userId, requestId, photo, signal);
      uploaded += 1;
    } catch {
      if (signal.aborted) break;
      if (attempts + 1 >= maxPhotoAttempts) dropped += 1;
      else replacement = { ...item, attempts: attempts + 1 };
    }
    remaining = remaining.flatMap(entry => (entry !== item ? [entry] : replacement ? [replacement] : []));
    await saveQueuedPhotos(userId, remaining);
  }
  return { remaining, uploaded, dropped };
}
