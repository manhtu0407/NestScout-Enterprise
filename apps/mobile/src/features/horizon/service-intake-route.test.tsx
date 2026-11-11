import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { takeKaelHandoff } from './kael-handoff';
import { writeIntakeDraft, clearIntakeDraft } from './service-intake-drafts';
import { ServiceIntakeRoute } from './service-intake-route';

const mockAccess: Record<string, unknown> = { phase: 'guest', identity: 'none', userId: null, setIntent: jest.fn() };
const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
let mockParams: { category?: string } = { category: 'electric' };

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
const mockStore = new Map<string, string>();
jest.mock('@/lib/device-storage', () => ({
  deviceStorage: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => { mockStore.set(key, value); },
    removeItem: async (key: string) => { mockStore.delete(key); },
  },
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderRoute = async () => {
  await render(<SafeAreaProvider initialMetrics={metrics}><ServiceIntakeRoute/></SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAccess, { phase: 'guest', identity: 'none', userId: null });
  mockParams = { category: 'electric' };
  mockStore.clear();
  clearIntakeDraft('customer-a', 'electric');
  takeKaelHandoff();
});

test('a guest following the old link lands in Kael with the service prefilled instead of a form or a sign-in wall', async () => {
  await renderRoute();
  expect(screen.queryByLabelText('Xem lại yêu cầu')).toBeNull();
  expect(screen.queryByText('Đăng nhập để gửi yêu cầu')).toBeNull();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
  expect(takeKaelHandoff()).toEqual({ service: 'electric' });
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('a worker is asked to switch to the customer role', async () => {
  Object.assign(mockAccess, { phase: 'worker', identity: 'verified', userId: 'worker-a' });
  await renderRoute();
  expect(screen.getByText('Bạn đang ở vai trò Thợ')).toBeTruthy();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  expect(takeKaelHandoff()).toBeNull();
});

test('an unknown category does not open a form', async () => {
  mockParams = { category: 'nope' };
  await renderRoute();
  expect(screen.getByText('Không tìm thấy nhóm dịch vụ')).toBeTruthy();
  expect(takeKaelHandoff()).toBeNull();
});

test('a verified customer with nothing left from the old form goes straight to Kael', async () => {
  Object.assign(mockAccess, { phase: 'client', identity: 'verified', userId: 'customer-a' });
  await renderRoute();
  expect(screen.queryByLabelText('Mô tả sự cố')).toBeNull();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/');
  expect(takeKaelHandoff()).toEqual({ service: 'electric' });
});

test('an unconfirmed submission from the old form keeps the form open for reconciliation', async () => {
  Object.assign(mockAccess, { phase: 'client', identity: 'verified', userId: 'customer-a' });
  mockStore.set('nestscout.pending-request.customer-a', JSON.stringify({ key: '11111111-1111-4111-8111-111111111111', description: 'Sửa điện — Ổ cắm', location: 'Quận 5' }));
  await renderRoute();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Yêu cầu chưa xác nhận được kết quả gửi')).toBeTruthy();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  expect(takeKaelHandoff()).toBeNull();
});

test('an unsent draft from the old form is restored rather than discarded', async () => {
  Object.assign(mockAccess, { phase: 'client', identity: 'verified', userId: 'customer-a' });
  writeIntakeDraft('customer-a', 'electric', { description: 'Ổ cắm phòng khách mất điện' });
  await renderRoute();
  expect(screen.getByLabelText('Mô tả sự cố').props.value).toBe('Ổ cắm phòng khách mất điện');
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});
