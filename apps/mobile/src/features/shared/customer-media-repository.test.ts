import { authenticatedRequest, authenticatedStorageRequest, storageSource } from '@/lib/authenticated-rest';

import { readAvatarSource, readRequestPhotos, removeAvatar, toPendingPhoto, uploadAvatar, uploadRequestPhoto } from './customer-media-repository';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn(), authenticatedStorageRequest: jest.fn(), storageSource: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000999' }));

const signal = new AbortController().signal;
const blob = { size: 3 } as Blob;
const file = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' };

const respondRpc = (body: unknown, ok = true, status = 200) => jest.mocked(authenticatedRequest).mockResolvedValue({ ok, status, json: async () => body } as Response);
const respondStorage = (ok = true, status = 200, body: unknown = {}) => jest.mocked(authenticatedStorageRequest).mockResolvedValue({ ok, status, json: async () => body } as Response);

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => blob } as Response);
});

test('an avatar is uploaded to the fixed owner path and then attached to the profile', async () => {
  respondStorage();
  respondRpc('u1');
  await uploadAvatar('u1', file, signal);
  expect(global.fetch).toHaveBeenCalledWith('file:///photo.jpg', { signal });
  expect(authenticatedStorageRequest).toHaveBeenCalledWith('u1', 'avatars/u1/avatar', { method: 'POST', signal, body: blob, contentType: 'image/jpeg', upsert: true });
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/set_customer_avatar', { method: 'POST', signal, body: JSON.stringify({ p_has_avatar: true }) });
});

test('a failed avatar upload never attaches it to the profile', async () => {
  respondStorage(false, 413);
  await expect(uploadAvatar('u1', file, signal)).rejects.toThrow('Could not upload the avatar');
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('an unsupported image type is refused before any request', async () => {
  await expect(uploadAvatar('u1', { uri: 'file:///a.gif', mimeType: 'image/gif' }, signal)).rejects.toThrow('Unsupported image type');
  expect(global.fetch).not.toHaveBeenCalled();
  expect(authenticatedStorageRequest).not.toHaveBeenCalled();
});

test('an unreadable local image is reported', async () => {
  jest.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);
  await expect(uploadAvatar('u1', file, signal)).rejects.toThrow('Could not read the selected image');
});

test('removing an avatar deletes the file and clears the profile, and a missing file is fine', async () => {
  respondStorage(false, 404);
  respondRpc('u1');
  await removeAvatar('u1', signal);
  expect(authenticatedStorageRequest).toHaveBeenCalledWith('u1', 'avatars/u1/avatar', { method: 'DELETE', signal });
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/set_customer_avatar', { method: 'POST', signal, body: JSON.stringify({ p_has_avatar: false }) });
});

test('a failed avatar deletion keeps the profile unchanged', async () => {
  respondStorage(false, 500);
  await expect(removeAvatar('u1', signal)).rejects.toThrow('Could not remove the avatar');
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('the avatar source is requested for the stored path and version', async () => {
  jest.mocked(storageSource).mockResolvedValue({ uri: 'https://x/avatars/u1/avatar?v=1', headers: { Authorization: 'Bearer t' } });
  await expect(readAvatarSource('u1', 'u1/avatar', '2026-11-02T10:00:00Z', signal)).resolves.toEqual({ uri: 'https://x/avatars/u1/avatar?v=1', headers: { Authorization: 'Bearer t' } });
  expect(storageSource).toHaveBeenCalledWith('u1', 'avatars', 'u1/avatar', '2026-11-02T10:00:00Z', signal);
});

const photo = { ...file, name: '00000000-0000-4000-8000-000000000999.jpg' };
const photoPath = 'u1/r1/00000000-0000-4000-8000-000000000999.jpg';

test('a photo name is generated once and keeps the image extension', () => {
  expect(toPendingPhoto(file)).toEqual({ ...file, name: '00000000-0000-4000-8000-000000000999.jpg' });
  expect(toPendingPhoto({ uri: 'file:///a.webp', mimeType: 'image/webp' }).name).toMatch(/\.webp$/);
  expect(() => toPendingPhoto({ uri: 'file:///a.gif', mimeType: 'image/gif' })).toThrow('Unsupported image type');
});

test('a request photo goes under the owner and request folder and is then attached', async () => {
  respondStorage();
  respondRpc('photo-1');
  await uploadRequestPhoto('u1', 'r1', photo, signal);
  expect(authenticatedStorageRequest).toHaveBeenCalledWith('u1', `request-photos/${photoPath}`, { method: 'POST', signal, body: blob, contentType: 'image/jpeg' });
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/add_request_photo', { method: 'POST', signal, body: JSON.stringify({ p_request_id: 'r1', p_path: photoPath }) });
});

test('a failed photo upload is not attached', async () => {
  respondStorage(false, 500);
  await expect(uploadRequestPhoto('u1', 'r1', photo, signal)).rejects.toThrow('Could not upload the photo');
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('a retried upload that already reached storage is attached without failing', async () => {
  respondStorage(false, 400, { statusCode: '409', error: 'Duplicate', code: 'KeyAlreadyExists' });
  respondRpc('photo-1');
  await expect(uploadRequestPhoto('u1', 'r1', photo, signal)).resolves.toBeUndefined();
  expect(authenticatedRequest).toHaveBeenCalledTimes(1);
  respondStorage(false, 409);
  await expect(uploadRequestPhoto('u1', 'r1', photo, signal)).resolves.toBeUndefined();
});

test('other storage rejections are still failures', async () => {
  respondStorage(false, 400, { statusCode: '403', error: 'Unauthorized' });
  await expect(uploadRequestPhoto('u1', 'r1', photo, signal)).rejects.toThrow('Could not upload the photo');
  jest.mocked(authenticatedStorageRequest).mockResolvedValue({ ok: false, status: 400, json: async () => { throw new Error('not json'); } } as unknown as Response);
  await expect(uploadRequestPhoto('u1', 'r1', photo, signal)).rejects.toThrow('Could not upload the photo');
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('request photos are grouped per request with a source for each file and malformed rows are rejected', async () => {
  jest.mocked(storageSource).mockImplementation(async (_user, _bucket, objectPath) => ({ uri: `https://x/${objectPath}`, headers: { Authorization: 'Bearer t' } }));
  respondRpc([{ request_id: 'r1', path: 'u1/r1/a.jpg' }, { request_id: 'r1', path: 'u1/r1/b.jpg' }, { request_id: 'r2', path: 'u1/r2/c.jpg' }]);
  const grouped = await readRequestPhotos('u1', signal);
  expect(grouped.get('r1')?.map(source => source.uri)).toEqual(['https://x/u1/r1/a.jpg', 'https://x/u1/r1/b.jpg']);
  expect(grouped.get('r2')).toHaveLength(1);
  expect(storageSource).toHaveBeenCalledWith('u1', 'request-photos', 'u1/r1/a.jpg', 'u1/r1/a.jpg', signal);
  respondRpc([{ request_id: 4, path: 'x' }]);
  await expect(readRequestPhotos('u1', signal)).rejects.toThrow('Invalid photo response');
  respondRpc([{ request_id: 'r1' }]);
  await expect(readRequestPhotos('u1', signal)).rejects.toThrow('Invalid photo response');
});
