import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadKaelConversation } from '@/features/shared';
import { requestOnboardingReplay, takeOnboardingReplay } from '@/features/onboarding';

import { HorizonEntry } from './horizon-entry';

const mockAccess = {
  phase: 'client', identity: 'verified', userId: 'customer-a', horizonDraft: null, notice: null, pendingMode: null,
  updateHorizonDraft: jest.fn(), clearHorizonDraft: jest.fn(), dismissNotice: jest.fn(), prepareHorizonDraftTransfer: jest.fn(),
  setIntent: jest.fn(), switchMode: jest.fn(), cancelModeRequest: jest.fn(),
};

const mockService = {
  evaluate: jest.fn(),
  progress: jest.fn(),
  conclude: jest.fn(),
};

const mockPush = jest.fn();

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess, EntryRedirect: () => null }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
jest.mock('@/features/onboarding/default-onboarding-service', () => ({ getDefaultOnboardingService: () => mockService }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: jest.requireActual<typeof import('react')>('react').useEffect }));
const mockConsent = { status: 'ready', granted: true };
jest.mock('./use-ai-consent', () => ({ useAiConsent: () => ({ ...mockConsent, set: jest.fn(), markRequired: jest.fn() }) }));
jest.mock('./use-customer-data', () => ({
  useCustomerData: jest.fn(() => ({
    data: { requests: [], quotes: [], pinnedIds: new Set(), notifications: [], profile: null, avatar: null, activity: { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] } },
    status: 'ready', loaded: true, refresh: jest.fn(), togglePin: jest.fn(),
  })),
}));
jest.mock('./use-worker-data', () => ({
  useWorkerData: jest.fn(() => ({
    data: { snapshot: { offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] }, cards: [], profile: null, earnings: [], notifications: [] },
    status: 'idle', loaded: false, refresh: jest.fn(), performProfile: jest.fn(),
  })),
}));
jest.mock('@/features/shared', () => ({ ...jest.requireActual('@/features/shared'), streamKaelTurn: jest.fn(), loadKaelConversation: jest.fn() }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` };
});

jest.setTimeout(20000);

const measure = jest.fn();
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderEntry = () => render(<SafeAreaProvider initialMetrics={metrics}><HorizonEntry/></SafeAreaProvider>);

async function elapse(milliseconds: number) {
  await act(async () => { jest.advanceTimersByTime(milliseconds); });
}

async function openTour() {
  await renderEntry();
  await elapse(2100);
  await elapse(1200);
  const overlay = screen.queryByTestId('onboarding-overlay');
  if (overlay === null) return;
  await fireEvent(overlay, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
  await elapse(100);
}

beforeAll(() => {
  Object.assign(View.prototype, { measureInWindow: measure });
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  takeOnboardingReplay();
  measure.mockImplementation((callback: (x: number, y: number, width: number, height: number) => void) => callback(20, 700, 300, 60));
  mockConsent.status = 'ready';
  mockConsent.granted = true;
  mockAccess.phase = 'client';
  mockAccess.userId = 'customer-a';
  mockService.evaluate.mockResolvedValue({ show: true, step: 0 });
  mockService.progress.mockResolvedValue(undefined);
  mockService.conclude.mockResolvedValue(undefined);
  jest.mocked(loadKaelConversation).mockResolvedValue({ conversationId: null, busy: false, messages: [], tasks: [], approvals: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

test('a genuinely new account is guided across the real composer, mode picker and sidebar button, then finishes once', async () => {
  await openTour();
  expect(mockService.evaluate).toHaveBeenCalledWith('customer-a', expect.any(AbortSignal));
  expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bắt đầu'));
  await elapse(400);
  expect(screen.getByText('Kể cho Kael việc cần làm')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Tiếp'));
  await elapse(400);
  expect(screen.getByText('Chọn cách Kael làm việc')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Tiếp'));
  await elapse(400);
  expect(screen.getByText('Mọi thứ nằm trong thanh bên')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bắt đầu với Kael'));
  await elapse(400);
  expect(mockService.conclude).toHaveBeenCalledTimes(1);
  expect(mockService.conclude).toHaveBeenCalledWith('customer-a', 'completed');
  expect(screen.queryByText('Mọi thứ nằm trong thanh bên')).toBeNull();
});

test('skipping from the first step is remembered as skipped', async () => {
  await openTour();
  await fireEvent.press(screen.getByLabelText('Bỏ qua'));
  await elapse(400);
  expect(mockService.conclude).toHaveBeenCalledWith('customer-a', 'skipped');
});

test('a returning account is never interrupted', async () => {
  mockService.evaluate.mockResolvedValue({ show: false });
  await openTour();
  expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
  expect(screen.queryByText('Chào mừng đến NestScout')).toBeNull();
  expect(mockService.progress).not.toHaveBeenCalled();
  expect(mockService.conclude).not.toHaveBeenCalled();
});

test('a failure to read the account state keeps the tour away', async () => {
  mockService.evaluate.mockRejectedValue(new Error('offline'));
  await openTour();
  expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
});

test('when AI sharing is not yet on, the composer step explains it and does not grant it', async () => {
  mockConsent.granted = false;
  mockService.evaluate.mockResolvedValue({ show: true, step: 1 });
  await openTour();
  expect(screen.getByText(/Chia sẻ dữ liệu với AI/)).toBeTruthy();
});

test('the sidebar step can open the real sidebar', async () => {
  mockService.evaluate.mockResolvedValue({ show: true, step: 3 });
  await openTour();
  expect(screen.queryByText('Hoạt động')).toBeNull();
  await fireEvent.press(within(screen.getByLabelText('Hướng dẫn làm quen NestScout')).getByLabelText('Mở thanh bên'));
  await elapse(400);
  expect(screen.getByText('Hoạt động')).toBeTruthy();
  expect(mockService.conclude).toHaveBeenCalledWith('customer-a', 'completed');
  expect(screen.queryByText('Mọi thứ nằm trong thanh bên')).toBeNull();
});

test('a replay requested from Help opens the tour for an account that already saw it, without recording anything', async () => {
  mockService.evaluate.mockResolvedValue({ show: false });
  requestOnboardingReplay();
  await openTour();
  expect(screen.getByText('Chào mừng đến NestScout')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bỏ qua'));
  await elapse(400);
  expect(mockService.progress).not.toHaveBeenCalled();
  expect(mockService.conclude).not.toHaveBeenCalled();
  expect(takeOnboardingReplay()).toBe(false);
});
