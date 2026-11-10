import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { KaelEvent, KaelTurnOutcome, KaelTurnRequest } from '@/features/shared';
import { loadKaelConversation, streamKaelTurn } from '@/features/shared';

import { HorizonEntry } from './horizon-entry';
import { useCustomerData } from './use-customer-data';
import { useWorkerData } from './use-worker-data';

const mockAccess = {
  phase: 'client', identity: 'verified', userId: 'customer-a', horizonDraft: null, notice: null, pendingMode: null,
  updateHorizonDraft: jest.fn(), clearHorizonDraft: jest.fn(), dismissNotice: jest.fn(), prepareHorizonDraftTransfer: jest.fn(),
  setIntent: jest.fn(), switchMode: jest.fn(), cancelModeRequest: jest.fn(),
};

jest.mock('@/features/access', () => ({ ...jest.requireActual('@/features/access'), useAccess: () => mockAccess, EntryRedirect: () => null }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: {} }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useFocusEffect: jest.requireActual<typeof import('react')>('react').useEffect }));
jest.mock('./use-ai-consent', () => ({ useAiConsent: () => ({ status: 'ready', granted: true, set: jest.fn() }) }));
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

const runId = '11111111-1111-4111-8111-111111111111';
const conversation = '22222222-2222-4222-8222-222222222222';
const taskId = '55555555-5555-4555-8555-555555555555';
const approvalId = '66666666-6666-4666-8666-666666666666';
const farFuture = new Date(Date.now() + 600_000).toISOString();

type Body = Record<string, unknown> & { type: KaelEvent['type'] };
const started: Body = { type: 'run_started', conversation_id: conversation, request_id: 'r', replayed: false };
const task = (status: string): Body => ({ type: 'task_updated', task: { id: taskId, title: 'Sửa vòi nước', kind: 'service_request', status, version: 1, summary: '' } });
const approval: Body = { type: 'approval_required', approval: { id: approvalId, task_id: taskId, tool: 'service_request_submit', summary: 'Gửi yêu cầu dịch vụ', details: { 'Địa điểm': 'Quận 7' }, fingerprint: 'a'.repeat(64), kind: 'confirm', expires_at: farFuture } };
const submitted = (outcome: string): Body => ({ type: 'tool_completed', call_id: 'call-submit', tool: 'service_request_submit', outcome, label: 'Gửi' });
const completed = (text: string): Body => ({ type: 'run_completed', text });

jest.setTimeout(20000);

const mockStream = jest.mocked(streamKaelTurn);
const mockLoad = jest.mocked(loadKaelConversation);

function emit(onEvent: (event: KaelEvent) => void, bodies: Body[]): KaelTurnOutcome {
  bodies.forEach((body, index) => onEvent({ ...body, v: 1, run_id: runId, seq: index + 1 } as KaelEvent));
  const last = bodies.at(-1)!;
  return { kind: 'terminal', event: { ...last, v: 1, run_id: runId, seq: bodies.length } } as KaelTurnOutcome;
}

function script(...turns: Body[][]) {
  const requests: KaelTurnRequest[] = [];
  mockStream.mockImplementation(async (_user, request, onEvent) => {
    requests.push(request);
    return emit(onEvent, turns.shift() ?? [started, completed('')]);
  });
  return requests;
}

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const renderEntry = () => render(<SafeAreaProvider initialMetrics={metrics}><HorizonEntry/></SafeAreaProvider>);

async function say(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Nhắn Kael...'), text);
  await act(async () => { fireEvent.press(screen.getByLabelText('Gửi')); });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockResolvedValue({ conversationId: null, busy: false, messages: [], tasks: [], approvals: [] });
});

test('a pending confirmation shows the gray attention banner with the approval card and nothing is reported as sent', async () => {
  script([started, task('waiting_for_approval'), approval, completed('Bạn xác nhận nhé.')]);
  await renderEntry();
  await say('Nhờ Kael tạo yêu cầu sửa vòi nước');
  expect(screen.getByLabelText(/^Chờ bạn xác nhận\. Yêu cầu này chưa được gửi cho đến khi bạn trượt để xác nhận/)).toBeTruthy();
  expect(screen.getByLabelText('Cần xác nhận: Gửi yêu cầu dịch vụ')).toBeTruthy();
  expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull();
});

test('hosted Preview keeps real chat and suppresses business data and approval controls', async () => {
  const requests = script([started, task('waiting_for_approval'), approval, completed('Preview reply.')]);
  const openAccount = jest.fn();
  await render(<SafeAreaProvider initialMetrics={metrics}><HorizonEntry onPreviewMenu={openAccount}/></SafeAreaProvider>);
  await say('A synthetic preview prompt');
  expect(await screen.findByText('Preview reply.')).toBeTruthy();
  expect(requests).toHaveLength(1);
  expect(requests[0]?.action).toEqual({ type: 'message', text: 'A synthetic preview prompt' });
  expect(useCustomerData).toHaveBeenLastCalledWith(null);
  expect(useWorkerData).toHaveBeenLastCalledWith(null);
  expect(screen.queryByLabelText('Cần xác nhận: Gửi yêu cầu dịch vụ')).toBeNull();
  expect(screen.queryByLabelText(/^Chờ bạn xác nhận\./)).toBeNull();
});

test('a verified submission shows the receipt banner, which can be dismissed, and never claims a booking', async () => {
  script([started, task('waiting_for_approval'), approval, completed('Bạn xác nhận nhé.')], [started, submitted('succeeded'), task('completed'), completed('Đã gửi yêu cầu.')]);
  await renderEntry();
  await say('Nhờ Kael tạo yêu cầu sửa vòi nước');
  await act(async () => { fireEvent(screen.getByLabelText('Xác nhận Gửi yêu cầu dịch vụ'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); });
  expect(await screen.findByText('Đã gửi yêu cầu')).toBeTruthy();
  expect(screen.getByText(/chưa có thợ, báo giá hay lịch hẹn nào được xác nhận/)).toBeTruthy();
  expect(screen.queryByLabelText(/^Chờ bạn xác nhận\./)).toBeNull();
  await act(async () => { fireEvent.press(screen.getByLabelText('Đóng')); });
  await waitFor(() => expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull());
});

test('a verified receipt stays visible while another task still awaits confirmation', async () => {
  const otherTask: Body = { type: 'task_updated', task: { ...(task('waiting_for_approval').task as object), id: '55555555-5555-4555-8555-555555555556', title: 'Sửa ổ điện' } };
  const otherApproval: Body = { type: 'approval_required', approval: { ...(approval.approval as object), id: '66666666-6666-4666-8666-666666666667', task_id: '55555555-5555-4555-8555-555555555556', summary: 'Gửi yêu cầu điện' } };
  script([started, task('waiting_for_approval'), approval, otherTask, otherApproval, completed('Bạn xác nhận từng yêu cầu nhé.')], [started, submitted('succeeded'), task('completed'), completed('Đã gửi yêu cầu vòi nước.')]);
  await renderEntry();
  await say('Nhờ Kael chuẩn bị hai yêu cầu');
  await act(async () => { fireEvent(screen.getByLabelText('Xác nhận Gửi yêu cầu dịch vụ'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); });
  expect(await screen.findByText('Đã gửi yêu cầu')).toBeTruthy();
  expect(screen.getByLabelText('Cần xác nhận: Gửi yêu cầu điện')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByLabelText('Đóng')); });
  await waitFor(() => expect(screen.getByLabelText(/^Chờ bạn xác nhận\. Yêu cầu này chưa được gửi/)).toBeTruthy());
  expect(screen.getByLabelText('Cần xác nhận: Gửi yêu cầu điện')).toBeTruthy();
  expect(screen.queryByText(/Chưa có gì được gửi/)).toBeNull();
});

test('run_completed without a verified submit event never produces the success banner', async () => {
  script([started, task('waiting_for_approval'), approval, completed('Bạn xác nhận nhé.')], [started, completed('Đã xử lý.')]);
  await renderEntry();
  await say('Nhờ Kael tạo yêu cầu sửa vòi nước');
  await act(async () => { fireEvent(screen.getByLabelText('Xác nhận Gửi yêu cầu dịch vụ'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); });
  expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull();
});

test('an uncertain submission asks for a check of the same request instead of reporting success', async () => {
  const reconcile: Body = { type: 'approval_required', approval: { ...(approval.approval as object), kind: 'reconcile', expires_at: null } };
  const requests = script(
    [started, task('waiting_for_approval'), approval, completed('Bạn xác nhận nhé.')],
    [started, submitted('uncertain'), task('waiting_for_approval'), reconcile, completed('Chưa rõ kết quả.')],
  );
  await renderEntry();
  await say('Nhờ Kael tạo yêu cầu sửa vòi nước');
  await act(async () => { fireEvent(screen.getByLabelText('Xác nhận Gửi yêu cầu dịch vụ'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); });
  expect(await screen.findByText('Cần kiểm tra lại')).toBeTruthy();
  expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull();
  expect(requests).toHaveLength(2);
  await act(async () => { fireEvent.press(screen.getByLabelText('Kiểm tra lại Gửi yêu cầu dịch vụ')); });
  expect(requests[2]?.action).toEqual({ type: 'reconcile', approval_id: approvalId, fingerprint: 'a'.repeat(64) });
});

test('a failed run after a verified one does not keep the earlier success banner', async () => {
  script(
    [started, submitted('succeeded'), completed('Đã gửi.')],
    [started, { type: 'run_failed', code: 'provider_error', message: 'Kael chưa trả lời được.', retryable: true }],
  );
  await renderEntry();
  await say('Gửi yêu cầu');
  expect(await screen.findByText('Đã gửi yêu cầu')).toBeTruthy();
  await say('Gửi thêm một yêu cầu nữa');
  await waitFor(() => expect(mockStream).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Đã gửi yêu cầu')).toBeNull());
  expect((await screen.findAllByText('Kael chưa trả lời được.')).length).toBeGreaterThan(0);
});

test('while the approved submission is in flight the task row shows the activity instead of a stored status', async () => {
  let finish: () => void = () => undefined;
  const requests: KaelTurnRequest[] = [];
  mockStream.mockImplementationOnce(async (_user, request, onEvent) => {
    requests.push(request);
    return emit(onEvent, [started, task('waiting_for_approval'), approval, completed('Bạn xác nhận nhé.')]);
  });
  mockStream.mockImplementationOnce((_user, request, onEvent) => {
    requests.push(request);
    onEvent({ ...started, v: 1, run_id: runId, seq: 1 } as KaelEvent);
    onEvent({ type: 'tool_started', call_id: 'call-submit', tool: 'service_request_submit', label: 'Đang gửi yêu cầu dịch vụ', v: 1, run_id: runId, seq: 2 });
    return new Promise<KaelTurnOutcome>(resolve => {
      finish = () => {
        const last = { type: 'run_completed' as const, text: 'Đã xử lý.', v: 1 as const, run_id: runId, seq: 3 };
        onEvent(last);
        resolve({ kind: 'terminal', event: last });
      };
    });
  });
  await renderEntry();
  await say('Nhờ Kael tạo yêu cầu sửa vòi nước');
  expect(screen.getByLabelText('Sửa vòi nước: Chờ bạn xác nhận')).toBeTruthy();
  await act(async () => { fireEvent(screen.getByLabelText('Xác nhận Gửi yêu cầu dịch vụ'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } }); });
  expect(await screen.findByLabelText('Sửa vòi nước: Đang gửi yêu cầu dịch vụ')).toBeTruthy();
  expect(requests[1]?.action.type).toBe('approve');
  await waitFor(() => expect(screen.queryByLabelText(/^Chờ bạn xác nhận\./)).toBeNull());
  await act(async () => { finish(); });
  await waitFor(() => expect(screen.queryByLabelText('Sửa vòi nước: Đang gửi yêu cầu dịch vụ')).toBeNull());
});
