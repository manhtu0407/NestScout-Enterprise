import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ServiceIntakeRoute } from './service-intake-route';

const mockAccess: Record<string, unknown> = { phase: 'guest', identity: 'none', userId: null, setIntent: jest.fn() };
const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
let mockParams: { category?: string } = { category: 'electric' };

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
jest.mock('@/lib/device-storage', () => ({ deviceStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderRoute = async () => {
  await render(<SafeAreaProvider initialMetrics={metrics}><ServiceIntakeRoute/></SafeAreaProvider>);
  await act(async () => { await Promise.resolve(); });
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockAccess, { phase: 'guest', identity: 'none', userId: null });
  mockParams = { category: 'electric' };
});

test('a guest is told the request is not sent and can sign in', async () => {
  await renderRoute();
  expect(screen.getByText('Đăng nhập để gửi yêu cầu')).toBeTruthy();
  expect(screen.queryByLabelText('Xem lại yêu cầu')).toBeNull();
  await act(async () => { fireEvent.press(screen.getByLabelText('Đăng nhập')); });
  expect(mockAccess.setIntent).toHaveBeenCalledWith('client');
  expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/phone', params: { role: 'client' } });
});

test('a worker is asked to switch to the customer role', async () => {
  Object.assign(mockAccess, { phase: 'worker', identity: 'verified', userId: 'worker-a' });
  await renderRoute();
  expect(screen.getByText('Bạn đang ở vai trò Thợ')).toBeTruthy();
});

test('an unknown category does not open a form', async () => {
  mockParams = { category: 'nope' };
  await renderRoute();
  expect(screen.getByText('Không tìm thấy nhóm dịch vụ')).toBeTruthy();
});

test('a verified customer gets the real form for the chosen category', async () => {
  Object.assign(mockAccess, { phase: 'client', identity: 'verified', userId: 'customer-a' });
  await renderRoute();
  expect(screen.getByLabelText('Mô tả sự cố')).toBeTruthy();
  expect(screen.getByLabelText('Dấu hiệu nguy hiểm')).toBeTruthy();
});
