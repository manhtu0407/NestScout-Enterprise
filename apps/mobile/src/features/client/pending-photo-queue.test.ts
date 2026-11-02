import { deviceStorage } from '@/lib/device-storage';

import { flushQueuedPhotos, loadQueuedPhotos, maxPhotoAttempts, saveQueuedPhotos, type QueuedPhoto } from './pending-photo-queue';

jest.mock('@/lib/device-storage', () => ({ deviceStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('@/features/shared', () => ({ acceptedImageTypes: ['image/jpeg', 'image/png', 'image/webp'], uploadRequestPhoto: jest.fn() }));

const signal = new AbortController().signal;
const photo = (name: string, attempts = 0): QueuedPhoto => ({ requestId: 'r1', name: `00000000-0000-4000-8000-00000000000${name}.jpg`, uri: `file:///${name}.jpg`, mimeType: 'image/jpeg', attempts });

beforeEach(() => jest.clearAllMocks());

test('queued photos keep their names through save and load', async () => {
  await saveQueuedPhotos('u1', [photo('1'), photo('2', 2)]);
  const stored = jest.mocked(deviceStorage.setItem).mock.calls[0]?.[1] as string;
  jest.mocked(deviceStorage.getItem).mockResolvedValue(stored);
  await expect(loadQueuedPhotos('u1')).resolves.toEqual([photo('1'), photo('2', 2)]);
});

test('an empty queue clears the stored value and a missing one loads as empty', async () => {
  await saveQueuedPhotos('u1', []);
  expect(deviceStorage.removeItem).toHaveBeenCalledWith('nestscout.pending-photos.u1');
  jest.mocked(deviceStorage.getItem).mockResolvedValue(null);
  await expect(loadQueuedPhotos('u1')).resolves.toEqual([]);
});

test('malformed queue entries are rejected', async () => {
  const bad = [
    'nope',
    {},
    [{ ...photo('1'), name: '../escape.jpg' }],
    [{ ...photo('1'), mimeType: 'image/gif' }],
    [{ ...photo('1'), attempts: maxPhotoAttempts }],
    [{ ...photo('1'), attempts: -1 }],
    [{ ...photo('1'), uri: '' }],
    [null],
  ];
  for (const value of bad) {
    jest.mocked(deviceStorage.getItem).mockResolvedValue(JSON.stringify(value));
    await expect(loadQueuedPhotos('u1')).rejects.toThrow('Invalid pending photo');
  }
});

test('uploaded photos leave the queue and the stored queue follows each step', async () => {
  const upload = jest.fn().mockResolvedValue(undefined);
  const result = await flushQueuedPhotos('u1', [photo('1'), photo('2')], signal, upload);
  expect(result).toEqual({ remaining: [], uploaded: 2, dropped: 0 });
  expect(upload).toHaveBeenCalledWith('u1', 'r1', { name: photo('1').name, uri: 'file:///1.jpg', mimeType: 'image/jpeg' }, signal);
  expect(jest.mocked(deviceStorage.setItem).mock.calls.map(call => JSON.parse(call[1] as string).length)).toEqual([1]);
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
});

test('a failed photo stays queued with one more attempt while the others upload', async () => {
  const upload = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const result = await flushQueuedPhotos('u1', [photo('1', 1), photo('2')], signal, upload);
  expect(result).toEqual({ remaining: [photo('1', 2)], uploaded: 1, dropped: 0 });
  expect(JSON.parse(jest.mocked(deviceStorage.setItem).mock.calls.at(-1)?.[1] as string)).toEqual([photo('1', 2)]);
});

test('a photo that keeps failing is dropped after the last attempt', async () => {
  const upload = jest.fn().mockRejectedValue(new Error('unreadable'));
  const result = await flushQueuedPhotos('u1', [photo('1', maxPhotoAttempts - 1)], signal, upload);
  expect(result).toEqual({ remaining: [], uploaded: 0, dropped: 1 });
  expect(deviceStorage.removeItem).toHaveBeenCalledTimes(1);
});

test('an aborted flush leaves the queue untouched', async () => {
  const controller = new AbortController();
  const upload = jest.fn().mockImplementation(async () => {
    controller.abort();
    throw new Error('aborted');
  });
  const result = await flushQueuedPhotos('u1', [photo('1'), photo('2')], controller.signal, upload);
  expect(result).toEqual({ remaining: [photo('1'), photo('2')], uploaded: 0, dropped: 0 });
  expect(upload).toHaveBeenCalledTimes(1);
  expect(deviceStorage.setItem).not.toHaveBeenCalled();
});
