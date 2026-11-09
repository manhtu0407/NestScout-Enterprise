import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { WorkflowError } from '@/features/shared';
import { PreferencesProvider } from '@/lib/preferences-provider';
import type { PreferencesStore } from '@/lib/preferences';

import { SettingsScreen } from './settings-screen';

function store(): PreferencesStore & { save: jest.Mock } {
  return { load: jest.fn().mockResolvedValue({ appearance: 'system', language: 'vi', reduceMotion: false }), save: jest.fn().mockResolvedValue(undefined) };
}

async function open(extra: Partial<React.ComponentProps<typeof SettingsScreen>> = {}, preferences = store()) {
  await render(<PreferencesProvider store={preferences}><SettingsScreen onBack={() => undefined} {...extra} /></PreferencesProvider>);
  return preferences;
}

test('language rows open pickers and switching language translates the screen and persists', async () => {
  const preferences = await open();
  await fireEvent.press(screen.getByLabelText('Ngôn ngữ, Tiếng Việt'));
  await fireEvent.press(screen.getByLabelText('English'));
  expect(preferences.save).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en' }));
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(screen.getByText('Notifications')).toBeTruthy();
  expect(screen.getByLabelText('Language, English')).toBeTruthy();
});

test('appearance picker stores the chosen mode', async () => {
  const preferences = await open();
  await fireEvent.press(screen.getByLabelText('Giao diện, Theo hệ thống'));
  await fireEvent.press(screen.getByLabelText('Tối'));
  expect(preferences.save).toHaveBeenLastCalledWith(expect.objectContaining({ appearance: 'dark' }));
});

test('terms and privacy rows open the legal documents', async () => {
  await open();
  await fireEvent.press(screen.getByLabelText('Điều khoản dịch vụ'));
  expect(screen.getByText('1. Đơn vị vận hành, phạm vi áp dụng và thuật ngữ')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Quay về'));
  await fireEvent.press(screen.getByLabelText('Chính sách quyền riêng tư'));
  expect(screen.getByText('11. Quyền của người có dữ liệu và cách gửi yêu cầu')).toBeTruthy();
});

test('clearing chat history needs confirmation and reports success', async () => {
  const onClearHistory = jest.fn().mockResolvedValue(undefined);
  await open({ onClearHistory });
  await fireEvent.press(screen.getByLabelText('Xoá lịch sử trò chuyện'));
  expect(onClearHistory).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Xoá lịch sử'));
  await waitFor(() => expect(screen.getByText('Đã xoá lịch sử trò chuyện.')).toBeTruthy());
  expect(onClearHistory).toHaveBeenCalledTimes(1);
});

test('clearing history shows distinct messages for an active run and for other failures', async () => {
  const onClearHistory = jest.fn().mockRejectedValueOnce(new WorkflowError('unavailable')).mockRejectedValueOnce(new Error('offline'));
  await open({ onClearHistory });
  await fireEvent.press(screen.getByLabelText('Xoá lịch sử trò chuyện'));
  await fireEvent.press(screen.getByLabelText('Xoá lịch sử'));
  await waitFor(() => expect(screen.getByText('Kael đang trả lời. Hãy thử lại sau khi hoàn tất.')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Xoá lịch sử'));
  await waitFor(() => expect(screen.getByText('Chưa xoá được lịch sử. Kiểm tra kết nối rồi thử lại.')).toBeTruthy());
});

test('without an account the clear action explains why it cannot run', async () => {
  await open();
  await fireEvent.press(screen.getByLabelText('Xoá lịch sử trò chuyện'));
  expect(screen.getByText('Đăng nhập để xoá lịch sử trò chuyện.')).toBeTruthy();
});

test('reduce motion is applied locally at once and rolled back when saving fails', async () => {
  const preferences = store();
  const onChangeSettings = jest.fn().mockRejectedValue(new Error('offline'));
  await open({ onChangeSettings, settings: { push: true, quotes: true, messages: true, promotions: false, reduce_motion: false } }, preferences);
  await act(async () => { await fireEvent(screen.getByLabelText('Giảm chuyển động'), 'valueChange', true); });
  await waitFor(() => expect(screen.getByText('Chưa lưu được cài đặt. Kiểm tra kết nối rồi thử lại.')).toBeTruthy());
  expect(preferences.save).toHaveBeenCalledWith(expect.objectContaining({ reduceMotion: true }));
  expect(preferences.save).toHaveBeenLastCalledWith(expect.objectContaining({ reduceMotion: false }));
});

test('account deletion needs confirmation, can be cancelled and reports failures', async () => {
  const api = { read: jest.fn().mockResolvedValue(null), request: jest.fn().mockResolvedValue('2026-11-10T08:00:00Z'), cancel: jest.fn().mockResolvedValue(undefined) };
  await open({ accountDeletion: api });
  await fireEvent.press(screen.getByLabelText('Xoá tài khoản'));
  await waitFor(() => expect(screen.getByLabelText('Gửi yêu cầu xoá')).toBeTruthy());
  expect(api.request).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Gửi yêu cầu xoá'));
  await waitFor(() => expect(screen.getByText(/Đã gửi yêu cầu xoá tài khoản ngày/)).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Huỷ yêu cầu xoá'));
  await waitFor(() => expect(screen.getByLabelText('Gửi yêu cầu xoá')).toBeTruthy());
  expect(api.cancel).toHaveBeenCalledTimes(1);
  api.request.mockRejectedValueOnce(new Error('offline'));
  await fireEvent.press(screen.getByLabelText('Gửi yêu cầu xoá'));
  await waitFor(() => expect(screen.getByText('Chưa gửi được yêu cầu. Kiểm tra kết nối rồi thử lại.')).toBeTruthy());
});

test('account deletion shows an existing request', async () => {
  await open({ accountDeletion: { read: jest.fn().mockResolvedValue('2026-11-10T08:00:00Z'), request: jest.fn(), cancel: jest.fn() } });
  await fireEvent.press(screen.getByLabelText('Xoá tài khoản'));
  await waitFor(() => expect(screen.getByLabelText('Huỷ yêu cầu xoá')).toBeTruthy());
});

test('account deletion without an account explains why it cannot run', async () => {
  await open();
  await fireEvent.press(screen.getByLabelText('Xoá tài khoản'));
  expect(screen.getByText('Đăng nhập để gửi yêu cầu xoá tài khoản.')).toBeTruthy();
});

test('terms acceptance stays closed while the document is a draft', async () => {
  const api = { read: jest.fn().mockResolvedValue(null), accept: jest.fn() };
  await open({ termsAcceptance: api });
  await fireEvent.press(screen.getByLabelText('Điều khoản dịch vụ'));
  await waitFor(() => expect(screen.getByText('Chưa mở chấp nhận: văn bản đang là bản dự thảo.')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Tôi đồng ý với phiên bản này'));
  expect(api.accept).not.toHaveBeenCalled();
  expect(api.read).toHaveBeenCalledWith('2026-11-09-v1.0');
});

test('a recorded agreement is shown with its date', async () => {
  await open({ termsAcceptance: { read: jest.fn().mockResolvedValue('2026-11-09T10:00:00Z'), accept: jest.fn() } });
  await fireEvent.press(screen.getByLabelText('Điều khoản dịch vụ'));
  await waitFor(() => expect(screen.getByText(/Bạn đã đồng ý phiên bản này ngày/)).toBeTruthy());
});
