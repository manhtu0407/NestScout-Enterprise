import { act, renderHook } from '@testing-library/react-native';

import { composerImageLimit, useComposerMedia } from './composer-media';

const mockLibrary = jest.fn();
const mockCamera = jest.fn();
const mockPermission = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockCamera(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
}));

const photo = (name: string) => ({ uri: `file:///${name}.jpg`, mimeType: 'image/jpeg', fileSize: 1024, type: 'image' });

beforeEach(() => {
  jest.resetAllMocks();
  mockPermission.mockResolvedValue({ granted: true });
});

test('a captured photo joins the attachments and reports the change', async () => {
  mockCamera.mockResolvedValue({ canceled: false, assets: [photo('shot')] });
  const onChange = jest.fn();
  const { result } = await renderHook(() => useComposerMedia([], onChange));
  await act(async () => { await result.current.capture(); });
  expect(result.current.images).toEqual([{ uri: 'file:///shot.jpg', mimeType: 'image/jpeg', fileSize: 1024 }]);
  expect(onChange).toHaveBeenCalledWith(result.current.images);
  expect(mockCamera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'] }));
  expect(mockLibrary).not.toHaveBeenCalled();
});

test('cancelling the camera leaves attachments and errors untouched', async () => {
  mockCamera.mockResolvedValue({ canceled: true, assets: null });
  const { result } = await renderHook(() => useComposerMedia());
  await act(async () => { await result.current.capture(); });
  expect(result.current.images).toEqual([]);
  expect(result.current.error).toBeNull();
});

test('a denied camera permission explains how to enable it and never opens the camera', async () => {
  mockPermission.mockResolvedValue({ granted: false });
  const { result } = await renderHook(() => useComposerMedia());
  await act(async () => { await result.current.capture(); });
  expect(mockCamera).not.toHaveBeenCalled();
  expect(result.current.error).toMatch(/Cài đặt/);
  expect(result.current.images).toEqual([]);
});

test('a camera failure is reported instead of swallowed', async () => {
  mockCamera.mockRejectedValue(new Error('no camera'));
  const { result } = await renderHook(() => useComposerMedia());
  await act(async () => { await result.current.capture(); });
  expect(result.current.error).toBe('Không thể mở camera. Vui lòng thử lại.');
});

test('capture is ignored once the attachment limit is reached', async () => {
  const full = Array.from({ length: composerImageLimit }, (_, index) => ({ uri: `file:///${index}.jpg` }));
  const { result } = await renderHook(() => useComposerMedia(full));
  await act(async () => { await result.current.capture(); });
  expect(mockPermission).not.toHaveBeenCalled();
  expect(mockCamera).not.toHaveBeenCalled();
});

test('a library pick still reports library errors', async () => {
  mockLibrary.mockRejectedValue(new Error('denied'));
  const { result } = await renderHook(() => useComposerMedia());
  await act(async () => { await result.current.pick(); });
  expect(result.current.error).toBe('Không thể mở thư viện ảnh. Vui lòng thử lại.');
});

test('a second capture while one is open does nothing', async () => {
  let release: (value: unknown) => void = () => undefined;
  mockCamera.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const { result } = await renderHook(() => useComposerMedia());
  let first: Promise<void> = Promise.resolve();
  await act(async () => { first = result.current.capture(); });
  await act(async () => { await result.current.capture(); });
  expect(mockCamera).toHaveBeenCalledTimes(1);
  release({ canceled: true, assets: null });
  await act(async () => { await first; });
});
