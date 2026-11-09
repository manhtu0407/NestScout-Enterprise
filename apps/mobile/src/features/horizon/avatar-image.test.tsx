import { render, screen, waitFor } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';

import { AvatarImage } from './avatar-image';

const headers = { apikey: 'publishable', Authorization: 'Bearer session-token' };
const oldUri = 'https://project.supabase.co/storage/v1/object/authenticated/avatars/u/avatar?v=1';
const newUri = 'https://project.supabase.co/storage/v1/object/authenticated/avatars/u/avatar?v=2';
const fallback = <Text>Chữ cái đầu</Text>;

const mockFetch = jest.fn();
let objectUrls = 0;

beforeEach(() => {
  mockFetch.mockReset();
  objectUrls = 0;
  global.fetch = mockFetch as unknown as typeof fetch;
  jest.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:avatar-${++objectUrls}`);
  jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function answer(status: number) {
  mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, blob: async () => new Blob(['image']) });
}

test('web loads a private avatar with its auth headers and shows the fetched image', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  answer(200);
  await render(<AvatarImage uri={oldUri} headers={headers} fallback={fallback} />);
  expect(await screen.findByLabelText('Ảnh đại diện')).toHaveProp('source', { uri: 'blob:avatar-1' });
  expect(mockFetch).toHaveBeenCalledWith(oldUri, expect.objectContaining({ headers }));
  expect(screen.queryByText('Chữ cái đầu')).toBeNull();
});

test('web shows the fallback while loading and when the storage request is denied', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  answer(400);
  await render(<AvatarImage uri={oldUri} headers={headers} fallback={fallback} />);
  expect(screen.getByText('Chữ cái đầu')).toBeTruthy();
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByLabelText('Ảnh đại diện')).toBeNull();
  expect(screen.getByText('Chữ cái đầu')).toBeTruthy();
});

test('web replaces the image when the avatar version changes and releases the previous object URL', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  answer(200);
  const view = await render(<AvatarImage uri={oldUri} headers={headers} fallback={fallback} />);
  expect(await screen.findByLabelText('Ảnh đại diện')).toHaveProp('source', { uri: 'blob:avatar-1' });
  await view.rerender(<AvatarImage uri={newUri} headers={headers} fallback={fallback} />);
  await waitFor(() => expect(screen.getByLabelText('Ảnh đại diện')).toHaveProp('source', { uri: 'blob:avatar-2' }));
  expect(mockFetch).toHaveBeenLastCalledWith(newUri, expect.objectContaining({ headers }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-1');
});

test('native passes the auth headers to the image without fetching', async () => {
  answer(200);
  await render(<AvatarImage uri={oldUri} headers={headers} fallback={fallback} />);
  expect(screen.getByLabelText('Ảnh đại diện')).toHaveProp('source', { uri: oldUri, headers });
  expect(mockFetch).not.toHaveBeenCalled();
});

test('a local picked image without headers is shown directly on web', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await render(<AvatarImage uri="blob:picked-image" fallback={fallback} />);
  expect(screen.getByLabelText('Ảnh đại diện')).toHaveProp('source', { uri: 'blob:picked-image', headers: undefined });
  expect(mockFetch).not.toHaveBeenCalled();
});
