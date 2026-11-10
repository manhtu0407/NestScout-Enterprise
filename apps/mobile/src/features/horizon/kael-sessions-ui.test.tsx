import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { KaelEvent, KaelSession, KaelTurnRequest } from '@/features/shared';
import { deleteKaelSession, KaelSessionError, listKaelSessions, loadKaelConversation, openKaelConversation, renameKaelSession, setKaelSessionArchived, setKaelSessionPinned, streamKaelTurn } from '@/features/shared';

import { HorizonEntry } from './horizon-entry';
import { handOffToKael } from './kael-handoff';

const mockAccess = {
  phase: 'client', identity: 'verified', userId: 'customer-a', horizonDraft: null, notice: null, pendingMode: null,
  updateHorizonDraft: jest.fn(), clearHorizonDraft: jest.fn(), dismissNotice: jest.fn(), prepareHorizonDraftTransfer: jest.fn(),
  setIntent: jest.fn(), switchMode: jest.fn(), cancelModeRequest: jest.fn(),
};
const mockPush = jest.fn();

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess, EntryRedirect: () => null }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useFocusEffect: jest.requireActual<typeof import('react')>('react').useEffect }));
jest.mock('./use-ai-consent', () => ({ useAiConsent: () => ({ status: 'ready', granted: true, set: jest.fn() }) }));
jest.mock('./use-customer-data', () => ({
  useCustomerData: jest.fn(() => ({
    data: { requests: [{ id: 'request-1', description: 'Yêu cầu dịch vụ không phải phiên', location: '', created_at: '2026-11-09T08:00:00.000Z' }], quotes: [], pinnedIds: new Set(), notifications: [], profile: null, avatar: null, activity: { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] } },
    status: 'ready', loaded: true, refresh: jest.fn(), togglePin: jest.fn(),
  })),
}));
jest.mock('./use-worker-data', () => ({
  useWorkerData: jest.fn(() => ({
    data: { snapshot: { offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] }, cards: [], profile: null, earnings: [], notifications: [] },
    status: 'idle', loaded: false, refresh: jest.fn(), performProfile: jest.fn(),
  })),
}));
jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared'),
  streamKaelTurn: jest.fn(), loadKaelConversation: jest.fn(), openKaelConversation: jest.fn(), listKaelSessions: jest.fn(),
  renameKaelSession: jest.fn(), setKaelSessionPinned: jest.fn(), setKaelSessionArchived: jest.fn(), deleteKaelSession: jest.fn(),
}));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` };
});

jest.setTimeout(20000);

const sessionA = '22222222-2222-4222-8222-222222222222';
const sessionB = '33333333-3333-4333-8333-333333333333';
const runId = '11111111-1111-4111-8111-111111111111';
const snapshot = (id: string | null, texts: string[]) => ({
  conversationId: id, busy: false, tasks: [], approvals: [],
  messages: texts.map((text, index) => ({ id: `4444444${index}-4444-4444-8444-444444444444`, role: index % 2 === 0 ? 'user' as const : 'assistant' as const, text, incomplete: false })),
});
const row = (id: string, title: string, extra: Partial<KaelSession> = {}): KaelSession => ({ id, title, preview: 'Đã ghi nhận', updatedAt: new Date().toISOString(), pinned: false, archived: false, ...extra });

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderEntry = () => render(<SafeAreaProvider initialMetrics={metrics}><HorizonEntry/></SafeAreaProvider>);
const mockList = jest.mocked(listKaelSessions);
const mockOpen = jest.mocked(openKaelConversation);
const mockLoad = jest.mocked(loadKaelConversation);
const mockStream = jest.mocked(streamKaelTurn);

function scripted(requests: KaelTurnRequest[], conversation: string) {
  mockStream.mockImplementation(async (_user, request, onEvent) => {
    requests.push(request);
    const events = [
      { type: 'run_started', conversation_id: conversation, request_id: 'r', replayed: false },
      { type: 'run_completed', text: 'Đã nhận.' },
    ];
    events.forEach((body, index) => onEvent({ ...body, v: 1, run_id: runId, seq: index + 1 } as KaelEvent));
    return { kind: 'terminal', event: { ...events[1], v: 1, run_id: runId, seq: 2 } } as never;
  });
}

async function openSidebar() {
  await act(async () => { fireEvent.press(screen.getByLabelText('Mở thanh bên')); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockResolvedValue(snapshot(sessionA, ['Sửa vòi nước', 'Đã ghi nhận vòi nước']));
  mockList.mockResolvedValue([row(sessionA, 'Sửa vòi nước'), row(sessionB, 'Vệ sinh sofa', { pinned: true })]);
  mockOpen.mockImplementation(async (_user, _mode, id) => (id === sessionB ? snapshot(sessionB, ['Vệ sinh sofa', 'Đã ghi nhận sofa']) : snapshot(sessionA, ['Sửa vòi nước', 'Đã ghi nhận vòi nước'])));
});

test('the sidebar history is the list of real conversations, never service requests', async () => {
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await openSidebar();
  await waitFor(() => expect(screen.getByLabelText(/^Vệ sinh sofa, /)).toBeTruthy());
  expect(screen.getByLabelText(/^Sửa vòi nước, /)).toBeTruthy();
  expect(screen.queryByText(/Yêu cầu dịch vụ không phải phiên/)).toBeNull();
  expect(mockList).toHaveBeenCalledWith('customer-a', 'client', { search: '', archived: false, limit: 50 }, expect.any(AbortSignal));
});

test('choosing a session loads that conversation by id and the next message continues it', async () => {
  const requests: KaelTurnRequest[] = [];
  scripted(requests, sessionB);
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Đã ghi nhận vòi nước')).toBeTruthy();
  await openSidebar();
  await waitFor(() => expect(screen.getByLabelText(/^Vệ sinh sofa, /)).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Vệ sinh sofa, /)); });
  await waitFor(() => expect(screen.getByText('Đã ghi nhận sofa')).toBeTruthy());
  expect(screen.queryByText('Đã ghi nhận vòi nước')).toBeNull();
  expect(mockOpen).toHaveBeenCalledWith('customer-a', 'client', sessionB, expect.any(AbortSignal));
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), 'Thêm ghế bọc da');
  await act(async () => { fireEvent.press(screen.getByLabelText('Gửi')); });
  expect(requests[0]?.conversationId).toBe(sessionB);
});

test('a new session starts blank, creates its conversation only when a message is sent, and never carries the other session draft', async () => {
  const requests: KaelTurnRequest[] = [];
  scripted(requests, '55555555-5555-4555-8555-555555555555');
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), 'Nháp của phiên A');
  await openSidebar();
  await act(async () => { fireEvent.press(screen.getByLabelText('Chat')); });
  expect(screen.queryByText('Đã ghi nhận vòi nước')).toBeNull();
  expect(mockStream).not.toHaveBeenCalled();
  expect(screen.queryByDisplayValue('Nháp của phiên A')).toBeNull();
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), 'Tin của phiên mới');
  await act(async () => { fireEvent.press(screen.getByLabelText('Gửi')); });
  expect(requests[0]?.conversationId).toBeNull();
  expect(requests[0]?.action).toEqual({ type: 'message', text: 'Tin của phiên mới' });
  expect(requests).toHaveLength(1);
});

test('an unsent draft stays with its own session when moving to a new chat, another session and back', async () => {
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), 'Nháp của phiên A');
  await openSidebar();
  await act(async () => { fireEvent.press(screen.getByLabelText('Chat')); });
  expect(screen.queryByDisplayValue('Nháp của phiên A')).toBeNull();
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), 'Nháp chat mới');
  await openSidebar();
  await waitFor(() => expect(screen.getByLabelText(/^Vệ sinh sofa, /)).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Vệ sinh sofa, /)); });
  await waitFor(() => expect(screen.getByText('Đã ghi nhận sofa')).toBeTruthy());
  expect(screen.queryByDisplayValue('Nháp của phiên A')).toBeNull();
  expect(screen.queryByDisplayValue('Nháp chat mới')).toBeNull();
  await openSidebar();
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Sửa vòi nước, /)); });
  await waitFor(() => expect(screen.getByText('Đã ghi nhận vòi nước')).toBeTruthy());
  expect(screen.getByDisplayValue('Nháp của phiên A')).toBeTruthy();
  await openSidebar();
  await act(async () => { fireEvent.press(screen.getByLabelText('Chat')); });
  expect(screen.getByDisplayValue('Nháp chat mới')).toBeTruthy();
});

test('a service handoff lands in a fresh session instead of the open conversation', async () => {
  handOffToKael('Tôi cần vệ sinh sofa', { fresh: true });
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByDisplayValue('Tôi cần vệ sinh sofa')).toBeTruthy();
  expect(screen.queryByText('Đã ghi nhận vòi nước')).toBeNull();
  expect(mockStream).not.toHaveBeenCalled();
});

test('a failed open is reported with a retry that does not silently start another conversation', async () => {
  mockOpen.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot(sessionB, ['Vệ sinh sofa', 'Đã ghi nhận sofa']));
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await openSidebar();
  await waitFor(() => expect(screen.getByLabelText(/^Vệ sinh sofa, /)).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Vệ sinh sofa, /)); });
  await waitFor(() => expect(screen.getByText(/Chưa mở được cuộc trò chuyện này/)).toBeTruthy());
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), 'Tin này không được tạo phiên mới');
  await act(async () => { fireEvent.press(screen.getByLabelText('Gửi')); });
  expect(mockStream).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByLabelText('Thử mở lại cuộc trò chuyện')); });
  await waitFor(() => expect(screen.getByText('Đã ghi nhận sofa')).toBeTruthy());
});

test('typing a name searches conversations on the server', async () => {
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await openSidebar();
  await waitFor(() => expect(mockList).toHaveBeenCalled());
  mockList.mockResolvedValue([row(sessionB, 'Vệ sinh sofa')]);
  await fireEvent.changeText(screen.getByLabelText('Tìm cuộc trò chuyện theo tên'), 'sofa');
  await waitFor(() => expect(mockList).toHaveBeenLastCalledWith('customer-a', 'client', { search: 'sofa', archived: false, limit: 50 }, expect.any(AbortSignal)));
  await waitFor(() => expect(screen.queryByLabelText(/^Sửa vòi nước, /)).toBeNull());
});

test('empty and failed lists are stated, and failure offers a retry', async () => {
  mockList.mockResolvedValueOnce([]);
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await openSidebar();
  await waitFor(() => expect(screen.getByText(/Chưa có cuộc trò chuyện nào/)).toBeTruthy());
  mockList.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([row(sessionA, 'Sửa vòi nước')]);
  await act(async () => { fireEvent.press(screen.getByLabelText('Xem cuộc trò chuyện đã lưu trữ')); });
  await waitFor(() => expect(screen.getByText(/Chưa tải được danh sách/)).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText('Thử tải lại danh sách cuộc trò chuyện')); });
  await waitFor(() => expect(screen.getByLabelText(/^Sửa vòi nước, /)).toBeTruthy());
  expect(mockList).toHaveBeenLastCalledWith('customer-a', 'client', { search: '', archived: true, limit: 50 }, expect.any(AbortSignal));
});

async function openMenuFor(titlePattern: RegExp) {
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await openSidebar();
  await waitFor(() => expect(screen.getByLabelText(titlePattern)).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Tùy chọn khác cho Sửa vòi nước/)); });
}

test('rename, pin and archive call the owner-scoped functions and refresh the list', async () => {
  jest.mocked(renameKaelSession).mockResolvedValue('Sửa vòi bếp');
  jest.mocked(setKaelSessionPinned).mockResolvedValue(undefined);
  jest.mocked(setKaelSessionArchived).mockResolvedValue(undefined);
  await openMenuFor(/^Sửa vòi nước, /);
  await act(async () => { fireEvent.press(screen.getByLabelText('Đổi tên')); });
  await fireEvent.changeText(screen.getByLabelText('Tên cuộc trò chuyện'), 'Sửa vòi bếp');
  await act(async () => { fireEvent.press(screen.getByLabelText('Lưu tên')); });
  await waitFor(() => expect(renameKaelSession).toHaveBeenCalledWith('customer-a', sessionA, 'Sửa vòi bếp', expect.any(AbortSignal)));
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Tùy chọn khác cho Sửa vòi nước/)); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Ghim')); });
  await waitFor(() => expect(setKaelSessionPinned).toHaveBeenCalledWith('customer-a', sessionA, true, expect.any(AbortSignal)));
  await act(async () => { fireEvent.press(screen.getByLabelText(/^Tùy chọn khác cho Sửa vòi nước/)); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Lưu trữ')); });
  await waitFor(() => expect(setKaelSessionArchived).toHaveBeenCalledWith('customer-a', sessionA, true, expect.any(AbortSignal)));
  await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(3));
});

test('delete asks for confirmation, states what is kept, and deleting the open session returns to a new one', async () => {
  jest.mocked(deleteKaelSession).mockResolvedValue(undefined);
  await openMenuFor(/^Sửa vòi nước, /);
  await act(async () => { fireEvent.press(screen.getByLabelText('Xóa')); });
  expect(screen.getByText(/Yêu cầu dịch vụ, báo giá và công việc đã tạo không bị ảnh hưởng/)).toBeTruthy();
  expect(deleteKaelSession).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByLabelText('Giữ lại cuộc trò chuyện')); });
  expect(deleteKaelSession).not.toHaveBeenCalled();
  await act(async () => { fireEvent.press(screen.getByLabelText('Xóa')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Xác nhận xóa cuộc trò chuyện')); });
  await waitFor(() => expect(deleteKaelSession).toHaveBeenCalledWith('customer-a', sessionA, expect.any(AbortSignal)));
  await waitFor(() => expect(screen.queryByText('Đã ghi nhận vòi nước')).toBeNull());
});

test('a refused delete explains why and keeps the conversation', async () => {
  jest.mocked(deleteKaelSession).mockRejectedValue(new KaelSessionError('effect_unresolved'));
  await openMenuFor(/^Sửa vòi nước, /);
  await act(async () => { fireEvent.press(screen.getByLabelText('Xóa')); });
  await act(async () => { fireEvent.press(screen.getByLabelText('Xác nhận xóa cuộc trò chuyện')); });
  await waitFor(() => expect(screen.getByText(/chưa xác minh được kết quả/)).toBeTruthy());
  expect(screen.getByText('Đã ghi nhận vòi nước')).toBeTruthy();
});

test('the service entries open their own routes, one per category', async () => {
  await renderEntry();
  await act(async () => { await Promise.resolve(); });
  await openSidebar();
  const titles = ['Sửa điện', 'Sửa nước', 'Máy lạnh', 'Vệ sinh nhà', 'Vệ sinh sofa', 'Lắp đặt & sửa chữa nhỏ', 'Dịch vụ khác'];
  for (const title of titles) expect(screen.getByLabelText(title)).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByLabelText('Máy lạnh')); });
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/service', params: { category: 'aircon' } });
});
