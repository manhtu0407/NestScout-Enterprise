import { randomUUID } from 'expo-crypto';

import { authenticatedStorageRequest, storageSource, type StorageSource } from '@/lib/authenticated-rest';

import { callRpc, readRows } from './customer-data-repository';

export type MediaFile = { uri: string; mimeType: string };

export const maxRequestPhotos = 6;
export const acceptedImageTypes: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

const extensions: Readonly<Record<string, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function readFile(file: MediaFile, signal: AbortSignal): Promise<Blob> {
  if (!acceptedImageTypes.includes(file.mimeType)) throw new Error('Unsupported image type');
  const response = await fetch(file.uri, { signal });
  if (!response.ok) throw new Error('Could not read the selected image');
  return response.blob();
}

export async function uploadAvatar(userId: string, file: MediaFile, signal: AbortSignal): Promise<void> {
  const body = await readFile(file, signal);
  const response = await authenticatedStorageRequest(userId, `avatars/${userId}/avatar`, { method: 'POST', signal, body, contentType: file.mimeType, upsert: true });
  if (!response.ok) throw new Error('Could not upload the avatar');
  const result = await callRpc(userId, 'set_customer_avatar', { p_has_avatar: true }, signal);
  if (result !== userId) throw new Error('Invalid avatar response');
}

export async function removeAvatar(userId: string, signal: AbortSignal): Promise<void> {
  const response = await authenticatedStorageRequest(userId, `avatars/${userId}/avatar`, { method: 'DELETE', signal });
  if (!response.ok && response.status !== 404) throw new Error('Could not remove the avatar');
  const result = await callRpc(userId, 'set_customer_avatar', { p_has_avatar: false }, signal);
  if (result !== userId) throw new Error('Invalid avatar response');
}

export function readAvatarSource(userId: string, avatarPath: string, version: string, signal: AbortSignal): Promise<StorageSource> {
  return storageSource(userId, 'avatars', avatarPath, version, signal);
}

export type PendingPhoto = MediaFile & { name: string };

export function toPendingPhoto(file: MediaFile): PendingPhoto {
  if (!acceptedImageTypes.includes(file.mimeType)) throw new Error('Unsupported image type');
  return { ...file, name: `${randomUUID()}.${extensions[file.mimeType]}` };
}

async function alreadyStored(response: Response): Promise<boolean> {
  if (response.status === 409) return true;
  if (response.status !== 400) return false;
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && (body as Record<string, unknown>).code === 'KeyAlreadyExists';
  } catch {
    return false;
  }
}

export async function uploadRequestPhoto(userId: string, requestId: string, photo: PendingPhoto, signal: AbortSignal): Promise<void> {
  const body = await readFile(photo, signal);
  const path = `${userId}/${requestId}/${photo.name}`;
  const response = await authenticatedStorageRequest(userId, `request-photos/${path}`, { method: 'POST', signal, body, contentType: photo.mimeType });
  if (!response.ok && !(await alreadyStored(response))) throw new Error('Could not upload the photo');
  const result = await callRpc(userId, 'add_request_photo', { p_request_id: requestId, p_path: path }, signal);
  if (typeof result !== 'string') throw new Error('Invalid photo response');
}

export async function readRequestPhotos(userId: string, signal: AbortSignal): Promise<Map<string, StorageSource[]>> {
  const rows = await readRows(userId, 'request_photos?select=request_id,path&order=created_at.asc', signal, 'Could not read photos');
  const photos = new Map<string, StorageSource[]>();
  for (const row of rows) {
    const record = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
    if (typeof record.request_id !== 'string' || typeof record.path !== 'string') throw new Error('Invalid photo response');
    const source = await storageSource(userId, 'request-photos', record.path, record.path, signal);
    photos.set(record.request_id, [...(photos.get(record.request_id) ?? []), source]);
  }
  return photos;
}
