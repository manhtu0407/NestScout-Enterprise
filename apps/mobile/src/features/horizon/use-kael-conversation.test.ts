import { act, renderHook } from '@testing-library/react-native';

import type { KaelConversationSnapshot, KaelEvent, KaelMode, KaelTurnOutcome, KaelTurnRequest } from '@/features/shared';

import { useKaelConversation } from './use-kael-conversation';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('expo-crypto', () => {
  let counter = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` };
});

const runId = '11111111-1111-4111-8111-111111111111';
const conversation = '22222222-2222-4222-8222-222222222222';
const taskId = '55555555-5555-4555-8555-555555555555';
const approvalId = '66666666-6666-4666-8666-666666666666';

type Body = Record<string, unknown> & { type: KaelEvent['type'] };
function scriptedStreamer(scripts: { events: Body[]; outcome?: KaelTurnOutcome }[]) {
  const requests: KaelTurnRequest[] = [];
  const streamer = jest.fn(async (_userId: string, request: KaelTurnRequest, onEvent: (event: KaelEvent) => void) => {
    requests.push(request);
    const script = scripts.shift() ?? { events: [] };
    script.events.forEach((body, index) => onEvent({ ...body, v: 1, run_id: runId, seq: index + 1 } as KaelEvent));
    const last = script.events.at(-1);
    return script.outcome ?? (last && (last.type === 'run_completed' || last.type === 'run_failed')
      ? { kind: 'terminal', event: { ...last, v: 1, run_id: runId, seq: script.events.length } } as KaelTurnOutcome
      : { kind: 'interrupted' } as KaelTurnOutcome);
  });
  return { streamer, requests };
}

const started = { type: 'run_started' as const, conversation_id: conversation, request_id: 'r', replayed: false };
const task = (status: string) => ({ type: 'task_updated' as const, task: { id: taskId, title: 'Sửa máy lạnh', kind: 'service_request', status, version: 1, summary: '' } });
const later = new Date(Date.now() + 600_000).toISOString();
const approval = { id: approvalId, task_id: taskId, tool: 'service_request_submit', summary: 'Gửi yêu cầu dịch vụ', details: { 'Địa điểm': 'Quận 3' }, fingerprint: 'a'.repeat(64), kind: 'confirm' as const, expires_at: later };
const empty: KaelConversationSnapshot = { conversationId: null, busy: false, messages: [], tasks: [], approvals: [] };
const emptyLoader = jest.fn(async () => empty);

test('streams a reply, tracks tasks and approvals, and continues in the same conversation', async () => {
  const { streamer, requests } = scriptedStreamer([
    { events: [started, { type: 'tool_started', call_id: 'c', tool: 'task_create', label: 'Đang ghi nhận việc cần làm' }, task('waiting_for_approval'), { type: 'approval_required', approval }, { type: 'message_delta', text: 'Bạn xác nhận nhé.' }, { type: 'run_completed', text: 'Bạn xác nhận nhé.' }] },
    { events: [started, task('completed'), { type: 'message_delta', text: 'Đã gửi.' }, { type: 'run_completed', text: 'Đã gửi.' }] },
  ]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Gửi yêu cầu sửa máy lạnh'); });
  expect(result.current.messages.map(message => [message.role, message.text])).toEqual([['user', 'Gửi yêu cầu sửa máy lạnh'], ['assistant', 'Bạn xác nhận nhé.']]);
  expect(result.current.tasks[0]?.status).toBe('waiting_for_approval');
  expect(result.current.approvals).toHaveLength(1);
  expect(result.current.running).toBe(false);
  expect(requests[0]?.conversationId).toBeNull();

  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  expect(requests[1]).toEqual(expect.objectContaining({ conversationId: conversation, action: { type: 'approve', approval_id: approvalId, fingerprint: 'a'.repeat(64) } }));
  expect(result.current.approvals).toHaveLength(0);
  expect(result.current.tasks[0]?.status).toBe('completed');
});

test('failures and interruptions are shown honestly and mark partial replies incomplete', async () => {
  const { streamer } = scriptedStreamer([
    { events: [started, { type: 'message_delta', text: 'Nguyên nhân là' }, { type: 'run_failed', code: 'incomplete_output', message: 'Phản hồi bị gián đoạn.', retryable: false }] },
    { events: [started, { type: 'message_delta', text: 'Đang' }] },
    { events: [], outcome: { kind: 'refused', code: 'provider_unavailable', message: 'Mô hình AI chưa được cấu hình.', retryable: false } },
  ]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Vì sao?'); });
  expect(result.current.notice).toBe('Phản hồi bị gián đoạn.');
  expect(result.current.messages.at(-1)).toEqual(expect.objectContaining({ text: 'Nguyên nhân là', incomplete: true }));
  await act(async () => { result.current.send('Tiếp'); });
  expect(result.current.notice).toMatch(/gián đoạn/);
  expect(result.current.messages.at(-1)?.incomplete).toBe(true);
  await act(async () => { result.current.send('Nữa'); });
  expect(result.current.notice).toBe('Mô hình AI chưa được cấu hình.');
  expect(result.current.messages.filter(message => message.role === 'assistant')).toHaveLength(2);
});

test('guests cannot send, and switching mode starts a fresh conversation', async () => {
  const { streamer, requests } = scriptedStreamer([
    { events: [started, { type: 'run_completed', text: 'Chào' }] },
    { events: [{ ...started, conversation_id: '77777777-7777-4777-8777-777777777777' }, { type: 'run_completed', text: 'Chào thợ' }] },
  ]);
  const guest = await renderHook(() => useKaelConversation(null, 'client', streamer, emptyLoader));
  await act(async () => { guest.result.current.send('Xin chào'); });
  expect(streamer).not.toHaveBeenCalled();
  expect(guest.result.current.available).toBe(false);

  const { result, rerender } = await renderHook(({ mode }: { mode: 'client' | 'worker' }) => useKaelConversation('worker-a', mode, streamer, emptyLoader), { initialProps: { mode: 'client' } });
  await act(async () => { result.current.send('Xin chào'); });
  expect(result.current.messages).toHaveLength(2);
  await rerender({ mode: 'worker' });
  expect(result.current.messages).toHaveLength(0);
  await act(async () => { result.current.send('Lịch hôm nay'); });
  expect(requests[1]).toEqual(expect.objectContaining({ mode: 'worker', conversationId: null }));
});

const storedSnapshot: KaelConversationSnapshot = {
  conversationId: conversation,
  busy: false,
  messages: [
    { id: '88888888-8888-4888-8888-888888888881', role: 'user', text: 'Gửi yêu cầu sửa máy lạnh', incomplete: false },
    { id: '88888888-8888-4888-8888-888888888882', role: 'assistant', text: 'Bạn xác nhận trong ứng dụng nhé.', incomplete: false },
  ],
  tasks: [{ id: taskId, title: 'Sửa máy lạnh', kind: 'service_request', status: 'waiting_for_approval', version: 3, summary: '' }],
  approvals: [approval],
};

const submitted: KaelConversationSnapshot = { ...storedSnapshot, tasks: [{ ...storedSnapshot.tasks[0]!, status: 'completed', version: 4 }], approvals: [] };

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('reopening Kael restores the signed-in account\'s conversation, tasks and still-pending confirmation', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(storedSnapshot).mockResolvedValue(submitted);
  const { streamer, requests } = scriptedStreamer([{ events: [started, task('completed'), { type: 'run_completed', text: 'Đã gửi.' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  expect(loader).toHaveBeenCalledWith('customer-a', 'client', expect.any(AbortSignal));
  expect(result.current.conversationId).toBe(conversation);
  expect(result.current.messages.map(message => message.text)).toEqual(['Gửi yêu cầu sửa máy lạnh', 'Bạn xác nhận trong ứng dụng nhé.']);
  expect(result.current.tasks[0]?.status).toBe('waiting_for_approval');
  expect(result.current.approvals).toEqual([approval]);
  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  expect(requests[0]).toEqual(expect.objectContaining({ conversationId: conversation, action: { type: 'approve', approval_id: approvalId, fingerprint: 'a'.repeat(64) } }));
  expect(result.current.approvals).toHaveLength(0);
});

test('a late recovery from the previous account or mode is never shown under the next one', async () => {
  const pending = deferred<KaelConversationSnapshot>();
  const loader = jest.fn((userId: string, _mode: KaelMode) => (userId === 'customer-a' ? pending.promise : Promise.resolve(empty)));
  const { result, rerender } = await renderHook(({ userId }: { userId: string }) => useKaelConversation(userId, 'client', scriptedStreamer([]).streamer, loader), { initialProps: { userId: 'customer-a' } });
  await rerender({ userId: 'customer-b' });
  await act(async () => { pending.resolve(storedSnapshot); await pending.promise; });
  expect(result.current.messages).toHaveLength(0);
  expect(result.current.approvals).toHaveLength(0);
  expect(result.current.conversationId).toBeNull();
  expect(loader.mock.calls.map(call => call[0])).toEqual(['customer-a', 'customer-b']);
});

test('an interrupted turn is reconciled from stored state instead of being treated as complete', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>()
    .mockResolvedValueOnce(empty)
    .mockResolvedValueOnce({ ...storedSnapshot, messages: [...storedSnapshot.messages], busy: false });
  const { streamer } = scriptedStreamer([{ events: [started, { type: 'message_delta', text: 'Bạn xác' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { result.current.send('Gửi yêu cầu sửa máy lạnh'); });
  await act(async () => { await Promise.resolve(); });
  expect(loader).toHaveBeenCalledTimes(2);
  expect(result.current.notice).toMatch(/gián đoạn/);
  expect(result.current.approvals).toEqual([approval]);
  expect(result.current.messages.at(-1)).toEqual(expect.objectContaining({ text: 'Bạn xác nhận trong ứng dụng nhé.', incomplete: false }));
});

test('a failed recovery is reported, and starting a new conversation does not bring the old one back', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockRejectedValueOnce(new Error('offline'));
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', scriptedStreamer([]).streamer, loader));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.notice).toMatch(/Chưa tải lại được/);
  expect(result.current.messages).toHaveLength(0);
  await act(async () => { result.current.reset(); });
  expect(result.current.notice).toBeNull();
  expect(loader).toHaveBeenCalledTimes(1);
});

test('a confirmation is withdrawn from the screen once it expires', async () => {
  jest.useFakeTimers();
  try {
    const soon = { ...approval, expires_at: new Date(Date.now() + 1_000).toISOString() };
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', scriptedStreamer([]).streamer, jest.fn(async () => ({ ...storedSnapshot, approvals: [soon] }))));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.approvals).toHaveLength(1);
    await act(async () => { jest.advanceTimersByTime(1_100); });
    expect(result.current.approvals).toHaveLength(0);
  } finally {
    jest.useRealTimers();
  }
});

const reconciliation = { ...approval, kind: 'reconcile' as const, expires_at: null };
const uncertainSnapshot: KaelConversationSnapshot = {
  ...storedSnapshot,
  tasks: [{ ...storedSnapshot.tasks[0]!, status: 'paused', version: 5 }],
  approvals: [reconciliation],
};

test('after a restart an uncertain confirmed submission returns as a check of the original approval, not a new confirmation', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(uncertainSnapshot).mockResolvedValue(submitted);
  const { streamer, requests } = scriptedStreamer([{ events: [started, task('completed'), { type: 'run_completed', text: 'Đã gửi yêu cầu dịch vụ.' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toEqual([reconciliation]);
  await act(async () => { result.current.decide(reconciliation, false); });
  expect(streamer).not.toHaveBeenCalled();
  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  expect(requests).toEqual([expect.objectContaining({ conversationId: conversation, action: { type: 'reconcile', approval_id: approvalId, fingerprint: 'a'.repeat(64) } })]);
  expect(result.current.messages.some(message => message.role === 'user' && message.text === 'Kiểm tra lại: Gửi yêu cầu dịch vụ')).toBe(true);
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toHaveLength(0);
  expect(result.current.tasks[0]?.status).toBe('completed');
});

test('an uncertain result during the session replaces the confirmation with a check card that does not expire', async () => {
  jest.useFakeTimers();
  try {
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(storedSnapshot).mockResolvedValue(uncertainSnapshot);
    const { streamer } = scriptedStreamer([{ events: [started, task('paused'), { type: 'approval_required', approval: reconciliation }, { type: 'run_completed', text: 'Chưa xác định được.' }] }]);
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.approvals).toEqual([reconciliation]);
    await act(async () => { jest.advanceTimersByTime(3_600_000); });
    expect(result.current.approvals).toEqual([reconciliation]);
  } finally {
    jest.useRealTimers();
  }
});

test('a decision the server refuses without consuming the confirmation brings the card back', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValue(storedSnapshot);
  const { streamer } = scriptedStreamer([
    { events: [], outcome: { kind: 'refused', code: 'busy', message: 'Kael vẫn đang xử lý.', retryable: true } },
    { events: [started, { type: 'message_delta', text: 'Không khớp.' }, { type: 'run_failed', code: 'approval_invalid', message: 'Xác nhận không hợp lệ.', retryable: false }] },
  ]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.notice).toBe('Kael vẫn đang xử lý.');
  expect(result.current.approvals).toEqual([approval]);
  await act(async () => { result.current.decide(result.current.approvals[0]!, false); });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toEqual([approval]);
  expect(loader).toHaveBeenCalledTimes(3);
});

test('when the server cannot be reached after a refused decision, the same card is restored locally', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(storedSnapshot).mockRejectedValue(new Error('offline'));
  const { streamer } = scriptedStreamer([{ events: [], outcome: { kind: 'refused', code: 'internal', message: 'Không kết nối được với Kael.', retryable: true } }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toEqual([approval]);
});

const freshConversation = '99999999-9999-4999-8999-999999999999';

test('a check survives cancelling its Kael task and starting a new conversation, and runs from the fresh screen', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>()
    .mockResolvedValueOnce(uncertainSnapshot)
    .mockResolvedValue({ ...empty, conversationId: freshConversation });
  const { streamer, requests } = scriptedStreamer([
    { events: [started, task('cancelled'), { type: 'run_completed', text: 'Đã dừng theo dõi việc này.' }] },
    { events: [{ ...started, conversation_id: freshConversation }, { type: 'run_completed', text: 'Yêu cầu đã được hệ thống ghi nhận.' }] },
  ]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { result.current.send('Thôi, hủy việc này'); });
  expect(result.current.tasks[0]?.status).toBe('cancelled');
  expect(result.current.approvals).toEqual([reconciliation]);

  await act(async () => { result.current.reset(); });
  expect(result.current.messages).toHaveLength(0);
  expect(result.current.tasks).toHaveLength(0);
  expect(result.current.conversationId).toBeNull();
  expect(result.current.approvals).toEqual([reconciliation]);

  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  expect(requests[1]).toEqual(expect.objectContaining({ conversationId: null, action: { type: 'reconcile', approval_id: approvalId, fingerprint: 'a'.repeat(64) } }));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.conversationId).toBe(freshConversation);
  expect(result.current.approvals).toHaveLength(0);
});

test('a new conversation keeps only checks; pending confirmations stay with their own conversation', async () => {
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>()
    .mockResolvedValue({ ...storedSnapshot, approvals: [reconciliation, { ...approval, id: '77777777-7777-4777-8777-777777777771', task_id: '77777777-7777-4777-8777-777777777772' }] });
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', scriptedStreamer([]).streamer, loader));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toHaveLength(2);
  await act(async () => { result.current.reset(); });
  expect(result.current.approvals).toEqual([reconciliation]);
});

test('after a restart a check from an earlier conversation is offered in the newest one without its task', async () => {
  const newest = { ...empty, conversationId: freshConversation, messages: [{ id: '88888888-8888-4888-8888-888888888883', role: 'user' as const, text: 'Chào Kael', incomplete: false }], approvals: [reconciliation] };
  const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(newest).mockResolvedValue({ ...newest, approvals: [] });
  const { streamer, requests } = scriptedStreamer([{ events: [{ ...started, conversation_id: freshConversation }, { type: 'run_completed', text: 'Đã gửi yêu cầu dịch vụ.' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.conversationId).toBe(freshConversation);
  expect(result.current.tasks).toHaveLength(0);
  expect(result.current.approvals).toEqual([reconciliation]);
  await act(async () => { result.current.decide(reconciliation, true); });
  expect(requests[0]).toEqual(expect.objectContaining({ conversationId: freshConversation, action: { type: 'reconcile', approval_id: approvalId, fingerprint: 'a'.repeat(64) } }));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toHaveLength(0);
});

test('switching account never carries a kept check over to the next account', async () => {
  const loader = jest.fn((userId: string) => Promise.resolve(userId === 'customer-a' ? uncertainSnapshot : empty));
  const { result, rerender } = await renderHook(({ userId }: { userId: string }) => useKaelConversation(userId, 'client', scriptedStreamer([]).streamer, loader), { initialProps: { userId: 'customer-a' } });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toEqual([reconciliation]);
  await act(async () => { result.current.reset(); });
  expect(result.current.approvals).toEqual([reconciliation]);
  await rerender({ userId: 'customer-b' });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toHaveLength(0);
  expect(result.current.conversationId).toBeNull();
  await act(async () => { result.current.reset(); });
  expect(result.current.approvals).toHaveLength(0);
  expect(loader.mock.calls.map(call => call[0])).toEqual(['customer-a', 'customer-b']);
});
