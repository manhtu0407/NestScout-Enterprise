import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { recordConsent, setPreferredVisit, submitSupportRequest } from '@/features/shared';

import type { CustomerData, CustomerDataController } from './use-customer-data';
import { CustomerSection } from './customer-sections';
import { useCustomerData } from './use-customer-data';

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => ({ identity: 'verified', userId: 'user-1', phase: 'client' }) }));
jest.mock('./use-customer-data', () => ({ useCustomerData: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: (effect: () => void | (() => void)) => jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]) }));
jest.mock('./use-ai-consent', () => ({ useAiConsent: () => ({ status: 'ready', granted: false, set: mockSetAiConsent }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000123' }));
const mockPick = jest.fn();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...args: unknown[]) => mockPick(...args) }));
jest.mock('@/features/shared', () => ({ ...jest.requireActual('@/features/shared'), submitSupportRequest: jest.fn(), setPreferredVisit: jest.fn(), recordConsent: jest.fn() }));

const mockSetAiConsent = jest.fn();

const empty: CustomerData = {
  requests: [], quotes: [], pinnedIds: new Set(), notifications: [], profile: null, avatar: null, photos: new Map(), savedWorkers: [], settings: null, phone: '', jobWorkers: [],
  activity: { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] },
};

function controller(overrides: Partial<CustomerDataController> = {}): CustomerDataController {
  return {
    data: empty, status: 'ready', loaded: true, refresh: jest.fn(), togglePin: jest.fn(), decideQuote: jest.fn(),
    markRead: jest.fn(), saveProfile: jest.fn(), removeSavedWorker: jest.fn(), saveSettings: jest.fn(), clearChatHistory: jest.fn(), changeAvatar: jest.fn(), clearAvatar: jest.fn(), setWorkerSaved: jest.fn(), reviewJob: jest.fn(), ...overrides,
  };
}

const request = { id: 'r1', description: 'Sửa vòi nước', location: '', created_at: new Date().toISOString() };

beforeEach(() => {
  jest.clearAllMocks();
  mockSetAiConsent.mockResolvedValue(undefined);
});

test('data that has not loaded shows a loading state', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller({ loaded: false, status: 'loading' }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('Đang tải')).toBeTruthy();
});

test('a failed first load offers a reload', async () => {
  const refresh = jest.fn();
  jest.mocked(useCustomerData).mockReturnValue(controller({ loaded: false, status: 'error', refresh }));
  await render(<CustomerSection id="quotes" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('Không tải được dữ liệu')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Tải lại' }));
  expect(refresh).toHaveBeenCalled();
});

test('requests come from the loaded records', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [request] } }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('Sửa vòi nước')).toBeTruthy();
});

test('an opened request shows its attached photos with their request headers', async () => {
  const headers = { apikey: 'key', Authorization: 'Bearer token' };
  const photos = new Map([['r1', [{ uri: 'https://x/request-photos/u/r1/a.jpg', headers }, { uri: 'https://x/request-photos/u/r1/b.jpg', headers }]]]);
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [request], photos } }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.queryByLabelText('Ảnh đính kèm 1')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /^Sửa vòi nước,/ }));
  expect(screen.getByText('2 ảnh')).toBeTruthy();
  expect(screen.getByLabelText('Ảnh đính kèm 1').props.source).toEqual({ uri: 'https://x/request-photos/u/r1/a.jpg', headers });
  expect(screen.getByLabelText('Ảnh đính kèm 2').props.source).toEqual({ uri: 'https://x/request-photos/u/r1/b.jpg', headers });
});

test('a request without photos shows none', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [request] } }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: /^Sửa vòi nước,/ }));
  expect(screen.getByText('Không có')).toBeTruthy();
  expect(screen.queryByLabelText('Ảnh đính kèm 1')).toBeNull();
});

test('an empty notification list shows its empty state', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller());
  await render(<CustomerSection id="notifications" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('Chưa có thông báo')).toBeTruthy();
});

test('an unread notification is marked read when opened and leads to its request', async () => {
  const markRead = jest.fn().mockResolvedValue(undefined);
  const onNavigate = jest.fn();
  const notification = { id: 'n1', kind: 'quote_received' as const, request_id: 'r1', title: 'Báo giá mới', body: 'Nội dung', created_at: new Date().toISOString(), read_at: null };
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [request], notifications: [notification] }, markRead }));
  await render(<CustomerSection id="notifications" onBack={() => undefined} onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByText('Báo giá mới'));
  expect(markRead).toHaveBeenCalledWith(['n1']);
  expect(onNavigate).toHaveBeenCalledWith('requests', 'r1');
});

const storedProfile = { display_name: 'Minh', email: '', address: '', avatar_path: '', updated_at: '2026-11-02T10:00:00Z' };

test('a profile is saved with the edited fields', async () => {
  const saveProfile = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, profile: storedProfile }, saveProfile }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Thông tin cá nhân, Minh' }));
  await fireEvent.changeText(screen.getByLabelText('Họ và tên'), 'Minh Anh');
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  expect(saveProfile).toHaveBeenCalledWith({ display_name: 'Minh Anh', email: '', address: '' });
});

test('help sends the support request with a retry-stable key', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller());
  jest.mocked(submitSupportRequest).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('s1');
  await render(<CustomerSection id="help" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.changeText(screen.getByLabelText('Chủ đề hỗ trợ'), 'Không nhận được mã');
  await fireEvent.changeText(screen.getByLabelText('Nội dung hỗ trợ'), 'Tôi chưa nhận được mã.');
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi yêu cầu hỗ trợ' }));
  await screen.findByText(/Chưa gửi được/);
  await fireEvent.press(screen.getByRole('button', { name: 'Gửi yêu cầu hỗ trợ' }));
  await screen.findByText(/Đã gửi yêu cầu hỗ trợ/);
  const keys = jest.mocked(submitSupportRequest).mock.calls.map(call => call[1]);
  expect(keys[0]).toBe(keys[1]);
  expect(submitSupportRequest).toHaveBeenCalledWith('user-1', keys[0], 'Không nhận được mã', 'Tôi chưa nhận được mã.', expect.anything());
});

const savedWorker = {
  profile_id: 'p1', display_name: 'Thợ Minh', trade: 'Thợ nước', area: 'Quận 7', experience_years: 8, skills: ['Sửa vòi'], service_areas: ['Quận 7'],
  saved_at: new Date().toISOString(), review_count: 0, rating_average: 0, completed_jobs: 0, strengths: [], reviews: [], basis: 'local_fixture',
};

test('saved workers come from the loaded records', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, savedWorkers: [savedWorker] } }));
  await render(<CustomerSection id="saved" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('Thợ Minh')).toBeTruthy();
});

test('unsaving a worker calls the owner removal with the profile id', async () => {
  const removeSavedWorker = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, savedWorkers: [savedWorker] }, removeSavedWorker }));
  await render(<CustomerSection id="saved" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByLabelText('Bỏ lưu Thợ Minh'));
  await waitFor(() => expect(removeSavedWorker).toHaveBeenCalledWith('p1'));
});

test('a failed removal brings the worker back with a message', async () => {
  const removeSavedWorker = jest.fn().mockRejectedValue(new Error('offline'));
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, savedWorkers: [savedWorker] }, removeSavedWorker }));
  await render(<CustomerSection id="saved" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByLabelText('Bỏ lưu Thợ Minh'));
  await screen.findByText(/Chưa bỏ lưu được/);
  expect(screen.getByText('Thợ Minh')).toBeTruthy();
});

test('stored settings are shown and a change is saved to the account', async () => {
  const saveSettings = jest.fn().mockResolvedValue(undefined);
  const settings = { push: true, quotes: true, messages: true, promotions: false, reduce_motion: false };
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, settings: { ...settings, quotes: false } }, saveSettings }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByRole('switch', { name: 'Ưu đãi và tin tức' }));
  await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ ...settings, quotes: false, promotions: true }));
});

test('a failed settings save restores the switch and says so', async () => {
  const saveSettings = jest.fn().mockRejectedValue(new Error('offline'));
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, settings: null }, saveSettings }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByRole('switch', { name: 'Ưu đãi và tin tức' }));
  expect(await screen.findByText('Chưa lưu được cài đặt. Kiểm tra kết nối rồi thử lại.')).toBeTruthy();
  expect(saveSettings).toHaveBeenCalledTimes(1);
});

test('the phone number of the account is shown in settings', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, phone: '84901234567' } }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('+84 901 234 567')).toBeTruthy();
});

async function openProfileEditor() {
  await fireEvent.press(screen.getByRole('button', { name: /^Thông tin cá nhân,/ }));
}

test('a picked photo is uploaded as the avatar after the profile text is saved', async () => {
  const saveProfile = jest.fn().mockResolvedValue(undefined);
  const changeAvatar = jest.fn().mockResolvedValue(undefined);
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///new.jpg', mimeType: 'image/jpeg' }] });
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, profile: storedProfile }, saveProfile, changeAvatar }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await openProfileEditor();
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm ảnh đại diện' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  await waitFor(() => expect(changeAvatar).toHaveBeenCalledWith({ uri: 'file:///new.jpg', mimeType: 'image/jpeg' }));
  expect(saveProfile).toHaveBeenCalled();
});

test('a photo of an unsupported type is not uploaded and the save reports failure', async () => {
  const changeAvatar = jest.fn();
  mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///new.gif', mimeType: 'image/gif' }] });
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, profile: storedProfile }, saveProfile: jest.fn().mockResolvedValue(undefined), changeAvatar }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await openProfileEditor();
  await fireEvent.press(screen.getByRole('button', { name: 'Thêm ảnh đại diện' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  expect(await screen.findByText(/Chưa lưu được/)).toBeTruthy();
  expect(changeAvatar).not.toHaveBeenCalled();
});

test('removing the stored avatar clears it on the account', async () => {
  const clearAvatar = jest.fn().mockResolvedValue(undefined);
  const avatar = { uri: 'https://example.test/avatars/user-1/avatar?v=1', headers: { Authorization: 'Bearer t' } };
  jest.mocked(useCustomerData).mockReturnValue(controller({
    data: { ...empty, profile: { ...storedProfile, avatar_path: 'user-1/avatar' }, avatar }, saveProfile: jest.fn().mockResolvedValue(undefined), clearAvatar,
  }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await openProfileEditor();
  await fireEvent.press(screen.getByRole('button', { name: 'Xoá ảnh đại diện' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  await waitFor(() => expect(clearAvatar).toHaveBeenCalled());
});

test('saving text only leaves the stored avatar alone', async () => {
  const changeAvatar = jest.fn();
  const clearAvatar = jest.fn();
  const avatar = { uri: 'https://example.test/avatars/user-1/avatar?v=1', headers: { Authorization: 'Bearer t' } };
  const saveProfile = jest.fn().mockResolvedValue(undefined);
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, profile: { ...storedProfile, avatar_path: 'user-1/avatar' }, avatar }, saveProfile, changeAvatar, clearAvatar }));
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await openProfileEditor();
  await fireEvent.changeText(screen.getByLabelText('Họ và tên'), 'Minh Anh');
  await fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalled());
  expect(changeAvatar).not.toHaveBeenCalled();
  expect(clearAvatar).not.toHaveBeenCalled();
});

test('Hỏi Kael hands the request context to Kael', async () => {
  const onAskKael = jest.fn();
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [request] } }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} onAskKael={onAskKael} />);
  await fireEvent.press(screen.getByLabelText('Hỏi Kael về Sửa vòi nước'));
  expect(onAskKael).toHaveBeenCalledWith(expect.stringContaining('"Sửa vòi nước"'));
});

test('without a Kael connection no Hỏi Kael button is offered', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [request] } }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.queryByLabelText('Hỏi Kael về Sửa vòi nước')).toBeNull();
});

test('a waiting request saves the preferred visit time through the owner command and reloads', async () => {
  const refresh = jest.fn();
  jest.mocked(setPreferredVisit).mockResolvedValue(null);
  jest.mocked(useCustomerData).mockReturnValue(controller({ data: { ...empty, requests: [{ ...request, preferred_visit_at: '2099-01-02T08:00:00.000Z' }] }, refresh }));
  await render(<CustomerSection id="requests" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByRole('button', { name: /^Sửa vòi nước,/ }));
  expect(screen.getByText(/^Đã lưu: /)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bỏ thời gian mong muốn'));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
  expect(jest.mocked(setPreferredVisit).mock.calls[0]?.slice(0, 3)).toEqual(['user-1', 'r1', null]);
});

test('Terms remain readable without recording legal acceptance or AI consent', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller());
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  await fireEvent.press(screen.getByText('Điều khoản dịch vụ'));
  expect(await screen.findByText(/Bản dự thảo, chưa phải điều khoản phát hành chính thức/)).toBeTruthy();
  expect(screen.queryByText('Tôi đồng ý với phiên bản này')).toBeNull();
  expect(recordConsent).not.toHaveBeenCalled();
});

test('AI data sharing is a separate explicit privacy choice', async () => {
  jest.mocked(useCustomerData).mockReturnValue(controller());
  await render(<CustomerSection id="settings" onBack={() => undefined} onNavigate={() => undefined} />);
  expect(screen.getByText('Kael gửi dữ liệu cho nhà cung cấp AI')).toBeTruthy();
  expect(screen.getByText(/Anthropic và DeepSeek/)).toBeTruthy();
  expect(screen.getByText(/Perplexity/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Chia sẻ dữ liệu với AI'));
  expect(mockSetAiConsent).toHaveBeenCalledWith(true);
});
