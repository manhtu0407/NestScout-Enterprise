import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform } from 'react-native';
import { ChatComposer } from './chat-composer';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const submit = jest.fn();

function Harness() {
  const [value, setValue] = useState('');
  return <ChatComposer value={value} onChange={setValue} onSubmit={submit} />;
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('typing and editing a draft controls sending and keeps the 5000 character limit', async () => {
  await render(<Harness />);
  const input = screen.getByLabelText('Nhắn Kael');
  expect(input.props.multiline).toBe(true);
  expect(input.props.maxLength).toBe(5000);
  expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
  await fireEvent.changeText(input, '   ');
  expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
  await fireEvent.changeText(input, 'Nước chảy ở tầng 2 🏠');
  expect(input.props.value).toBe('Nước chảy ở tầng 2 🏠');
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi' }));
  expect(submit).toHaveBeenCalledWith([]);
  await fireEvent.changeText(input, '');
  expect(screen.getByRole('button', { name: 'Gửi' })).toBeDisabled();
});

test('selects at most five images, supports image-only send and removal', async () => {
  const assets = Array.from({ length: 6 }, (_, i) => ({ uri: `file:///photo-${i}.png`, width: 4, height: 4, type: 'image' as const }));
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets });
  await render(<Harness />);
  await fireEvent.press(screen.getByRole('button', { name: 'Đính kèm' }));
  await waitFor(() => expect(screen.getAllByLabelText('Ảnh đã chọn')).toHaveLength(5));
  expect(screen.getByRole('button', { name: 'Đính kèm' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi' }));
  expect(submit).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ uri: 'file:///photo-0.png' })]));
  expect(submit.mock.calls[0]?.[0]).toHaveLength(5);
  await fireEvent.press(screen.getByRole('button', { name: 'Xóa ảnh 1' }));
  expect(screen.getAllByLabelText('Ảnh đã chọn')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Đính kèm' })).toBeEnabled();
});

test('cancelling or failing image selection keeps the draft intact and exposes errors', async () => {
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({ canceled: true, assets: null }).mockRejectedValueOnce(new Error('unavailable'));
  await render(<Harness />);
  await fireEvent.changeText(screen.getByLabelText('Nhắn Kael'), 'Bản nháp');
  await fireEvent.press(screen.getByRole('button', { name: 'Đính kèm' }));
  await act(async () => {});
  expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Bản nháp');
  expect(screen.queryByLabelText('Ảnh đã chọn')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Đính kèm' }));
  expect(await screen.findByText('Không thể mở thư viện ảnh. Vui lòng thử lại.')).toBeTruthy();
  expect(screen.getByLabelText('Nhắn Kael').props.value).toBe('Bản nháp');
});

test('a browser image returned after the composer unmounts is released', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  if (descriptor?.get) jest.spyOn(Platform, 'OS', 'get').mockReturnValue('web');
  else jest.replaceProperty(Platform, 'OS', 'web');
  const revoke = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  let finish: ((result: ImagePicker.ImagePickerResult) => void) | undefined;
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = await render(<Harness />);
  await fireEvent.press(screen.getByRole('button', { name: 'Đính kèm' }));
  await view.unmount();
  await act(async () => finish?.({ canceled: false, assets: [{ uri: 'blob:https://example.test/late', width: 1, height: 1, type: 'image' }] }));
  expect(revoke).toHaveBeenCalledWith('blob:https://example.test/late');
});
