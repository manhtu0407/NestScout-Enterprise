import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { submitRequest, streamKaelTurn, WorkflowError } from '@/features/shared';

import { serviceCategories } from './service-catalog';
import { clearIntakeDraft } from './service-intake-drafts';
import { ServiceIntakeScreen } from './service-intake-screen';

const mockStore = new Map<string, string>();
jest.mock('@/lib/device-storage', () => ({
  deviceStorage: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockStore.set(key, value); },
    removeItem: async (key: string) => { mockStore.delete(key); },
  },
}));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` };
});
jest.mock('@/features/shared', () => ({ ...jest.requireActual('@/features/shared'), submitRequest: jest.fn(), streamKaelTurn: jest.fn() }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const requestId = 'abcdef12-3456-4789-8abc-def123456789';
const mockSubmit = jest.mocked(submitRequest);

const onBack = jest.fn();
const onOpenRequests = jest.fn();
const onAskKael = jest.fn();

async function show(id: string) {
  const category = serviceCategories.find(item => item.id === id)!;
  await render(<SafeAreaProvider initialMetrics={metrics}><ServiceIntakeScreen category={category} userId="customer-a" onBack={onBack} onOpenRequests={onOpenRequests} onAskKael={onAskKael}/></SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
}

const type = async (label: string, value: string) => { await fireEvent.changeText(screen.getByLabelText(label), value); };
const press = async (label: string) => { await act(async () => { fireEvent.press(screen.getByLabelText(label)); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  serviceCategories.forEach(item => clearIntakeDraft('customer-a', item.id));
  mockSubmit.mockResolvedValue(requestId);
});

test.each(serviceCategories.map(item => [item.title, item.id] as const))('%s opens its own working form with the shared essentials', async (title, id) => {
  await show(id);
  const category = serviceCategories.find(item => item.id === id)!;
  expect(screen.getAllByText(title).length).toBeGreaterThan(0);
  expect(screen.getByLabelText(category.descriptionLabel)).toBeTruthy();
  expect(screen.getByLabelText('Địa điểm thực hiện')).toBeTruthy();
  for (const field of category.fields) expect(screen.getByLabelText(field.label)).toBeTruthy();
  expect(screen.getByLabelText('Xem lại yêu cầu')).toBeTruthy();
  expect(screen.getByLabelText('Trao đổi với Kael')).toBeTruthy();
});

test('manual intake: fill, review the summary, edit, confirm, and see a server-confirmed record', async () => {
  await show('aircon');
  await type('Mô tả sự cố hoặc nhu cầu', 'Máy lạnh phòng ngủ không mát');
  await type('Địa điểm thực hiện', 'Căn 12B, Quận 7');
  await press('Treo tường');
  await press('Không lạnh');
  await type('Số máy (nếu biết)', '2');
  await press('Ngày mai');
  await press('Xem lại yêu cầu');
  expect(screen.getByText('Xem lại yêu cầu')).toBeTruthy();
  expect(screen.getByText('Máy lạnh phòng ngủ không mát')).toBeTruthy();
  expect(screen.getByText('Căn 12B, Quận 7')).toBeTruthy();
  expect(screen.getByText('Treo tường')).toBeTruthy();
  expect(mockSubmit).not.toHaveBeenCalled();
  await press('Chỉnh sửa');
  expect(screen.getByDisplayValue('Máy lạnh phòng ngủ không mát')).toBeTruthy();
  await press('Xem lại yêu cầu');
  await press('Xác nhận gửi yêu cầu');
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(mockSubmit).toHaveBeenCalledWith('customer-a', expect.stringMatching(/^[0-9a-f-]{36}$/), 'Máy lạnh — Máy lạnh phòng ngủ không mát\nLoại máy: Treo tường\nHiện tượng: Không lạnh\nSố máy (nếu biết): 2\nThời gian mong muốn (chưa phải lịch hẹn đã xác nhận): Ngày mai', expect.any(AbortSignal), 'Căn 12B, Quận 7', 'aircon');
  expect(screen.getByText('Yêu cầu Máy lạnh đã được gửi')).toBeTruthy();
  expect(screen.getByText('Mã yêu cầu: ABCDEF12')).toBeTruthy();
  expect(screen.getByText(/Hiện chưa có thợ, giá, lịch hẹn hay thanh toán nào được xác nhận/)).toBeTruthy();
  await press('Xem trong Yêu cầu của tôi');
  expect(onOpenRequests).toHaveBeenCalledWith(requestId);
  expect(streamKaelTurn).not.toHaveBeenCalled();
});

test('missing essentials are shown beside the field and nothing is sent', async () => {
  await show('electric');
  await press('Xem lại yêu cầu');
  expect(screen.getByText(/ít nhất 5 ký tự/)).toBeTruthy();
  expect(screen.getByText(/Hãy nhập địa điểm thực hiện/)).toBeTruthy();
  expect(screen.getByText('Còn thông tin cần bổ sung trước khi xem lại yêu cầu.')).toBeTruthy();
  expect(mockSubmit).not.toHaveBeenCalled();
});

test('electrical danger signs show safety guidance without blocking the request', async () => {
  await show('electric');
  expect(screen.queryByText(/gọi 114/)).toBeNull();
  await press('Mùi khét hoặc tia lửa');
  expect(screen.getByText(/gọi 114/)).toBeTruthy();
  expect(screen.getByLabelText('Xem lại yêu cầu')).toBeTruthy();
});

test('an uncertain network result keeps one stable key and reconciles on retry without a duplicate request', async () => {
  mockSubmit.mockRejectedValueOnce(new Error('offline'));
  await show('plumbing');
  await type('Mô tả sự cố', 'Vòi bồn rửa bị rò');
  await type('Địa điểm thực hiện', 'Quận 3');
  await press('Xem lại yêu cầu');
  await press('Xác nhận gửi yêu cầu');
  expect(screen.getByText('Yêu cầu chưa xác nhận được kết quả gửi')).toBeTruthy();
  expect(screen.queryByText(/đã được gửi$/)).toBeNull();
  await press('Gửi lại để kiểm tra');
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(mockSubmit.mock.calls[1]?.slice(1, 3)).toEqual(mockSubmit.mock.calls[0]?.slice(1, 3));
  expect(screen.getByText('Mã yêu cầu: ABCDEF12')).toBeTruthy();
});

test('a definitive refusal says the request was not created and returns to the review', async () => {
  mockSubmit.mockRejectedValueOnce(new WorkflowError('invalid'));
  await show('other');
  await type('Bạn cần giúp việc gì?', 'Lắp rèm cửa phòng khách');
  await type('Địa điểm thực hiện', 'Quận 2');
  await press('Xem lại yêu cầu');
  await press('Xác nhận gửi yêu cầu');
  await waitFor(() => expect(screen.getByText(/Yêu cầu chưa được tạo/)).toBeTruthy());
  expect(screen.getByLabelText('Xác nhận gửi yêu cầu')).toBeTruthy();
});

test('Ask Kael hands over the category and what was already typed, and sends nothing itself', async () => {
  await show('sofa-cleaning');
  await type('Mô tả nhu cầu', 'Sofa bị ố cà phê');
  await press('Trao đổi với Kael');
  expect(onAskKael).toHaveBeenCalledTimes(1);
  expect(onAskKael.mock.calls[0]?.[0]).toContain('vệ sinh sofa');
  expect(onAskKael.mock.calls[0]?.[0]).toContain('Mô tả nhu cầu: Sofa bị ố cà phê');
  expect(mockSubmit).not.toHaveBeenCalled();
});

test('what was typed survives a trip to Kael and is cleared once the request is submitted', async () => {
  await show('sofa-cleaning');
  await type('Mô tả nhu cầu', 'Sofa bị ố cà phê');
  await type('Địa điểm thực hiện', 'Quận 2');
  await press('Trao đổi với Kael');
  await screen.unmount();
  await show('sofa-cleaning');
  expect(screen.getByDisplayValue('Sofa bị ố cà phê')).toBeTruthy();
  expect(screen.getByDisplayValue('Quận 2')).toBeTruthy();
  await press('Xem lại yêu cầu');
  await press('Xác nhận gửi yêu cầu');
  await waitFor(() => expect(screen.getByText('Mã yêu cầu: ABCDEF12')).toBeTruthy());
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  await screen.unmount();
  await show('sofa-cleaning');
  expect(screen.queryByDisplayValue('Sofa bị ố cà phê')).toBeNull();
});

test('the Kael button promises advice only, not form filling', async () => {
  await show('sofa-cleaning');
  expect(screen.getByText(/không tự điền hay gửi biểu mẫu/)).toBeTruthy();
  expect(screen.queryByLabelText(/hỗ trợ điền/)).toBeNull();
});

test('the open category does not promise unsupported services and photos are not pretended', async () => {
  await show('other');
  expect(screen.getByText(/chưa đảm bảo có thợ phù hợp/)).toBeTruthy();
  expect(screen.getByText(/Chưa đính kèm ảnh ở bước này/)).toBeTruthy();
});

test('an unconfirmed request from an earlier visit is reconciled before a new one can be made', async () => {
  mockStore.set('nestscout.pending-request.customer-a', JSON.stringify({ key: '11111111-1111-4111-8111-111111111111', description: 'Sửa nước — Cũ', location: 'Quận 5' }));
  await show('plumbing');
  expect(screen.getByText('Yêu cầu chưa xác nhận được kết quả gửi')).toBeTruthy();
  expect(screen.queryByLabelText('Xem lại yêu cầu')).toBeNull();
  await press('Gửi lại để kiểm tra');
  expect(mockSubmit).toHaveBeenCalledWith('customer-a', '11111111-1111-4111-8111-111111111111', 'Sửa nước — Cũ', expect.any(AbortSignal), 'Quận 5', undefined);
  expect(mockStore.size).toBe(0);
});
