import { act, renderHook } from '@testing-library/react-native';

import type { KaelConversationSnapshot, KaelEvent, KaelMode, KaelTurnOutcome, KaelTurnRequest } from '@/features/shared';
import { streamKaelTurn } from '@/features/shared/kael-runtime-repository';

import { useKaelConversation } from './use-kael-conversation';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/lib/config', () => ({
  loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }),
  ConfigError: class ConfigError extends Error {},
}));
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: 'customer-a' }, access_token: 'token-a' } }, error: null }) },
  }),
}));
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

test('a thrown stream failure is visible and releases the conversation for another send', async () => {
  const streamer = jest.fn(async () => { throw new TypeError('Network request failed'); });
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Xin chào'); });
  expect(result.current.running).toBe(false);
  expect(result.current.notice).toMatch(/chưa xác nhận được Kael đã trả lời xong/);
  await act(async () => { result.current.send('Thử lại'); });
  expect(streamer).toHaveBeenCalledTimes(2);
  expect(result.current.running).toBe(false);
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
  expect(result.current.notice).toBeNull();
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

describe('interruption recovery keeps only warnings the server snapshot can justify', () => {
  const interrupted = [{ events: [started, { type: 'message_delta' as const, text: 'Bạn xác' }] }];
  const withLast = (last: KaelConversationSnapshot['messages'][number]): KaelConversationSnapshot => ({ ...storedSnapshot, messages: [storedSnapshot.messages[0]!, last] });
  const assistant = (incomplete: boolean) => ({ id: '88888888-8888-4888-8888-888888888899', role: 'assistant' as const, text: 'Bạn xác nhận trong ứng dụng nhé.', incomplete });

  async function interruptedWith(restore: () => Promise<KaelConversationSnapshot>) {
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(empty).mockImplementation(restore);
    const { streamer } = scriptedStreamer([...interrupted]);
    const hook = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { hook.result.current.send('Gửi yêu cầu sửa máy lạnh'); });
    await act(async () => { await Promise.resolve(); });
    return { ...hook, loader };
  }

  test('a complete restored reply clears the obsolete warning', async () => {
    const { result } = await interruptedWith(async () => withLast(assistant(false)));
    expect(result.current.notice).toBeNull();
    expect(result.current.messages.at(-1)).toEqual(expect.objectContaining({ incomplete: false }));
  });

  test('an incomplete restored reply keeps the warning and its incomplete mark', async () => {
    const { result } = await interruptedWith(async () => withLast(assistant(true)));
    expect(result.current.notice).toMatch(/chưa đầy đủ/);
    expect(result.current.messages.at(-1)?.incomplete).toBe(true);
  });

  test('a restored conversation with no stored reply keeps the warning instead of assuming success', async () => {
    const { result } = await interruptedWith(async () => ({ ...storedSnapshot, messages: [storedSnapshot.messages[0]!] }));
    expect(result.current.notice).toMatch(/chưa đầy đủ/);
  });

  test('when restoration is unavailable the uncertainty is preserved and says so', async () => {
    const { result } = await interruptedWith(async () => { throw new Error('offline'); });
    expect(result.current.notice).toMatch(/chưa tải lại được/);
    expect(result.current.notice).toMatch(/chưa đầy đủ/);
  });

  test('a run still active on the server is reported, and a later complete read clears it', async () => {
    let busy = true;
    const { result } = await interruptedWith(async () => ({ ...withLast(assistant(false)), busy }));
    expect(result.current.notice).toMatch(/vẫn đang xử lý/);
    busy = false;
    await act(async () => { result.current.refresh(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.notice).toBeNull();
  });
});

test('a refused approval is explained without marking its message as an incomplete reply', async () => {
  const { streamer } = scriptedStreamer([
    { events: [started, { type: 'message_delta', text: 'Xác nhận đã hết hạn.' }, { type: 'run_failed', code: 'approval_invalid', message: 'Xác nhận này không còn hợp lệ.', retryable: false }] },
  ]);
  const loader = jest.fn(async () => storedSnapshot);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
  expect(result.current.messages.at(-1)).toEqual(expect.objectContaining({ text: 'Xác nhận đã hết hạn.' }));
  expect(result.current.messages.at(-1)?.incomplete).not.toBe(true);
  expect(result.current.notice).toBe('Xác nhận này không còn hợp lệ.');
});

test('while an approval executes only the transient task marker is set, and task state is never rewritten by the client', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const streamer = jest.fn(async (_userId: string, _request: KaelTurnRequest, onEvent: (event: KaelEvent) => void) => {
    onEvent({ ...started, v: 1, run_id: runId, seq: 1 } as KaelEvent);
    onEvent({ type: 'tool_started', call_id: `approval:${approvalId}`, tool: 'service_request_submit', label: 'Đang gửi yêu cầu dịch vụ', v: 1, run_id: runId, seq: 2 } as KaelEvent);
    await gate;
    const done = { type: 'run_completed', text: 'Đã gửi.', v: 1, run_id: runId, seq: 3 } as KaelEvent;
    onEvent(done);
    return { kind: 'terminal', event: done } as KaelTurnOutcome;
  });
  const stableLoader = jest.fn(async () => storedSnapshot);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, stableLoader));
  await act(async () => { await Promise.resolve(); });
  const before = result.current.tasks[0]!;
  await act(async () => { result.current.decide(result.current.approvals[0]!, true); await Promise.resolve(); });
  expect(result.current.processingTaskId).toBe(taskId);
  expect(result.current.activity).toBe('Đang gửi yêu cầu dịch vụ');
  expect(result.current.tasks[0]).toEqual(before);
  await act(async () => { release(); await gate; await Promise.resolve(); await Promise.resolve(); });
  expect(result.current.processingTaskId).toBeNull();
  expect(result.current.tasks[0]).toEqual(before);
});

describe('recovery evidence is tied to the interrupted run, not to an earlier completed reply', () => {
  const stored = (id: number, role: 'user' | 'assistant', text: string, incomplete = false) => ({ id: `88888888-8888-4888-8888-8888888888${String(id).padStart(2, '0')}`, role, text, incomplete });
  const earlier = [stored(1, 'user', 'Câu hỏi đầu tiên'), stored(2, 'assistant', 'Trả lời câu đầu tiên.')];
  const firstSnapshot: KaelConversationSnapshot = { ...empty, conversationId: conversation, messages: earlier };
  const interruptedRun = [{ events: [started, { type: 'message_delta' as const, text: 'Đang trả' }] }];

  async function secondRun(text: string, restore: () => Promise<KaelConversationSnapshot>, scripts = interruptedRun) {
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(firstSnapshot).mockImplementation(restore);
    const { streamer } = scriptedStreamer([...scripts]);
    const hook = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { hook.result.current.send(text); });
    await act(async () => { await Promise.resolve(); });
    return { ...hook, loader, streamer };
  }

  const withSecond = (reply: ReturnType<typeof stored> | null, text = 'Câu hỏi thứ hai'): KaelConversationSnapshot => ({
    ...firstSnapshot,
    messages: [...earlier, stored(3, 'user', text), ...(reply ? [reply] : [])],
  });

  test('the earlier completed reply does not clear the warning when the interrupted run was never stored', async () => {
    const { result, streamer } = await secondRun('Câu hỏi thứ hai', async () => firstSnapshot);
    expect(result.current.messages.at(-1)?.role).toBe('assistant');
    expect(result.current.notice).toMatch(/chưa xác nhận được/);
    expect(streamer).toHaveBeenCalledTimes(1);
  });

  test('a stored question without its reply keeps the interruption warning', async () => {
    const { result } = await secondRun('Câu hỏi thứ hai', async () => withSecond(null));
    expect(result.current.notice).toMatch(/chưa đầy đủ/);
  });

  test('a genuinely completed interrupted run is restored and the warning is cleared', async () => {
    const { result } = await secondRun('Câu hỏi thứ hai', async () => withSecond(stored(4, 'assistant', 'Trả lời câu thứ hai.')));
    expect(result.current.notice).toBeNull();
    expect(result.current.messages.map(message => message.text)).toEqual(['Câu hỏi đầu tiên', 'Trả lời câu đầu tiên.', 'Câu hỏi thứ hai', 'Trả lời câu thứ hai.']);
  });

  test('partial content of the interrupted run keeps the warning and the incomplete mark', async () => {
    const { result } = await secondRun('Câu hỏi thứ hai', async () => withSecond(stored(4, 'assistant', 'Trả lời dở', true)));
    expect(result.current.notice).toMatch(/chưa đầy đủ/);
    expect(result.current.messages.at(-1)).toEqual(expect.objectContaining({ text: 'Trả lời dở', incomplete: true }));
  });

  test('failed restoration keeps the uncertainty even though an earlier reply was complete', async () => {
    const { result } = await secondRun('Câu hỏi thứ hai', async () => { throw new Error('offline'); });
    expect(result.current.notice).toMatch(/chưa tải lại được/);
    expect(result.current.messages.map(message => message.text)).toContain('Câu hỏi đầu tiên');
  });

  test('a busy backend keeps the still-running notice and later clears only with the run reply', async () => {
    let snapshot = { ...withSecond(null), busy: true };
    const { result } = await secondRun('Câu hỏi thứ hai', async () => snapshot);
    expect(result.current.notice).toMatch(/vẫn đang xử lý/);
    snapshot = { ...withSecond(stored(4, 'assistant', 'Trả lời câu thứ hai.')), busy: false };
    await act(async () => { result.current.refresh(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.notice).toBeNull();
  });

  test('a busy backend that later shows only the earlier reply never clears the warning', async () => {
    let snapshot = { ...firstSnapshot, busy: true };
    const { result } = await secondRun('Câu hỏi thứ hai', async () => snapshot);
    snapshot = { ...firstSnapshot, busy: false };
    await act(async () => { result.current.refresh(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.notice).toMatch(/chưa xác nhận được/);
  });

  test('identical user messages in successive runs are told apart by position', async () => {
    const same = 'Câu hỏi đầu tiên';
    const missing = await secondRun(same, async () => firstSnapshot);
    expect(missing.result.current.notice).toMatch(/chưa xác nhận được/);
    const stored2 = await secondRun(same, async () => withSecond(stored(4, 'assistant', 'Trả lời lần hai.'), same));
    expect(stored2.result.current.notice).toBeNull();
    const partial = await secondRun(same, async () => withSecond(stored(4, 'assistant', 'Dở', true), same));
    expect(partial.result.current.notice).toMatch(/chưa đầy đủ/);
  });

  test('an interrupted approval keeps its reconcile card with the original identity and never retries on its own', async () => {
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(storedSnapshot).mockResolvedValue({
      ...storedSnapshot,
      messages: [...storedSnapshot.messages, stored(3, 'user', 'Đồng ý thực hiện thao tác Kael đề xuất.'), stored(4, 'assistant', 'Chưa rõ kết quả.')],
      tasks: [{ ...storedSnapshot.tasks[0]!, status: 'paused', version: 5 }],
      approvals: [reconciliation],
    });
    const { streamer, requests } = scriptedStreamer([{ events: [started, { type: 'tool_started', call_id: `approval:${approvalId}`, tool: 'service_request_submit', label: 'Đang gửi yêu cầu dịch vụ' }] }]);
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.decide(result.current.approvals[0]!, true); });
    await act(async () => { await Promise.resolve(); });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.action).toEqual({ type: 'approve', approval_id: approvalId, fingerprint: 'a'.repeat(64) });
    expect(result.current.approvals).toEqual([reconciliation]);
    expect(result.current.approvals[0]!.id).toBe(approvalId);
    expect(result.current.tasks[0]!.status).toBe('paused');
    expect(streamer).toHaveBeenCalledTimes(1);
  });
});

describe('interruption recovery across the persisted 60-message window', () => {
  const text = 'Câu hỏi lặp lại';
  const stored = (index: number, role: 'user' | 'assistant', content: string, incomplete = false) => ({ id: `88888888-8888-4888-8888-${String(index).padStart(12, '0')}`, role, text: content, incomplete });
  const history = Array.from({ length: 60 }, (_, index) => stored(index + 1, index % 2 === 0 ? 'user' : 'assistant', index % 2 === 0 ? text : 'Trả lời trước.'));
  const initial: KaelConversationSnapshot = { ...empty, conversationId: conversation, messages: history };

  test.each(['complete', 'partial', 'missing'] as const)('a %s interrupted reply is classified after the history window shifts', async status => {
    const reply = status === 'missing' ? [] : [stored(62, 'assistant', 'Trả lời mới.', status === 'partial')];
    const snapshot = { ...initial, messages: [...history, stored(61, 'user', text), ...reply].slice(-60) };
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(initial).mockResolvedValue(snapshot);
    const { streamer } = scriptedStreamer([{ events: [started, { type: 'message_delta', text: 'Trả lời' }] }]);
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.send(text); await Promise.resolve(); });
    if (status === 'complete') expect(result.current.notice).toBeNull();
    else expect(result.current.notice).toMatch(/trước khi Kael trả lời xong/);
    expect(result.current.messages.at(-1)?.id).toBe(`stored-${snapshot.messages.at(-1)!.id}`);
    expect(streamer).toHaveBeenCalledTimes(1);
  });

  test('locally completed turns after the restored anchor retain their relative position', async () => {
    const snapshot = { ...initial, messages: [...history, stored(61, 'user', text), stored(62, 'assistant', 'Trả lời thứ 31.'), stored(63, 'user', text), stored(64, 'assistant', 'Trả lời thứ 32.')].slice(-60) };
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(initial).mockResolvedValue(snapshot);
    const { streamer } = scriptedStreamer([{ events: [started, { type: 'run_completed', text: 'Trả lời thứ 31.' }] }, { events: [started, { type: 'message_delta', text: 'Trả lời' }] }]);
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.send(text); });
    await act(async () => { result.current.send(text); await Promise.resolve(); });
    expect(result.current.notice).toBeNull();
    expect(result.current.messages.at(-1)?.text).toBe('Trả lời thứ 32.');
    expect(streamer).toHaveBeenCalledTimes(2);
  });

  test('an evicted anchor cannot match an unrelated completed reply with identical text', async () => {
    const snapshot = { ...initial, messages: [stored(100, 'user', text), stored(101, 'assistant', 'Trả lời khác.')] };
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockResolvedValueOnce(initial).mockResolvedValue(snapshot);
    const { streamer } = scriptedStreamer([{ events: [started] }]);
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { result.current.send(text); await Promise.resolve(); });
    expect(result.current.notice).toMatch(/chưa xác nhận được/);
  });
});

describe('first turn interrupted before run_started', () => {
  const stored = (id: number, role: 'user' | 'assistant', text: string, incomplete = false) => ({ id: `99999999-9999-4999-8999-9999999999${String(id).padStart(2, '0')}`, role, text, incomplete });
  const text = 'Vòi nước bị rò, nhờ Kael tạo yêu cầu';
  const persisted = (reply: ReturnType<typeof stored> | null): KaelConversationSnapshot => ({ ...empty, conversationId: conversation, messages: [stored(1, 'user', text), ...(reply ? [reply] : [])] });
  const never = { events: [] as Body[], outcome: { kind: 'interrupted' } as KaelTurnOutcome };

  async function firstTurn(restore: () => Promise<KaelConversationSnapshot>, mount: () => Promise<KaelConversationSnapshot> = async () => empty) {
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockImplementationOnce(mount).mockImplementation(restore);
    const scripts = [never, { events: [started, { type: 'run_completed' as const, text: 'Xong.' }] }];
    const { streamer, requests } = scriptedStreamer(scripts);
    const hook = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { hook.result.current.send(text); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    return { ...hook, loader, streamer, requests };
  }

  const interruptedText = /trước khi Kael trả lời xong/;
  const unconfirmedText = /chưa xác nhận được/;
  const unverifiedText = /chưa tải lại được cuộc trò chuyện để xác minh/;

  test('a backend-persisted first turn is rehydrated when the connection fails before response headers', async () => {
    let snapshot: KaelConversationSnapshot = empty;
    const fetcher = jest.fn(async () => {
      snapshot = persisted(stored(2, 'assistant', 'Tôi đã nhận được yêu cầu.'));
      throw new TypeError('Network request failed');
    });
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>().mockImplementation(async () => snapshot);
    const streamer = (userId: string, request: KaelTurnRequest, onEvent: (event: KaelEvent) => void, signal: AbortSignal) =>
      streamKaelTurn(userId, request, onEvent, signal, fetcher, []);
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      result.current.send(text);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current.conversationId).toBe(conversation);
    expect(result.current.messages.map(message => [message.role, message.text])).toEqual([
      ['user', text],
      ['assistant', 'Tôi đã nhận được yêu cầu.'],
    ]);
    expect(result.current.notice).toBeNull();
    expect(result.current.running).toBe(false);
  });

  test('an ambiguous streamer exception rehydrates before it can be classified as refused', async () => {
    const loader = jest.fn<Promise<KaelConversationSnapshot>, [string, KaelMode, AbortSignal]>()
      .mockResolvedValueOnce(empty)
      .mockResolvedValue(persisted(stored(2, 'assistant', 'Yêu cầu đã được xử lý.')));
    const streamer = jest.fn(async () => { throw new TypeError('Network request failed'); });
    const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader));
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      result.current.send(text);
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(streamer).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map(message => [message.role, message.text])).toEqual([
      ['user', text],
      ['assistant', 'Yêu cầu đã được xử lý.'],
    ]);
    expect(result.current.notice).toBeNull();
  });

  test('restores a first message that the backend stored and answered, without a retry', async () => {
    const { result, streamer, loader } = await firstTurn(async () => persisted(stored(2, 'assistant', 'Đã ghi nhận yêu cầu.')));
    expect(result.current.notice).toBeNull();
    expect(result.current.conversationId).toBe(conversation);
    expect(result.current.messages.map(message => [message.role, message.text])).toEqual([['user', text], ['assistant', 'Đã ghi nhận yêu cầu.']]);
    expect(streamer).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  test('keeps the interruption warning when the first message was stored without its reply', async () => {
    const { result, streamer } = await firstTurn(async () => persisted(null));
    expect(result.current.notice).toMatch(interruptedText);
    expect(result.current.conversationId).toBe(conversation);
    expect(result.current.messages.map(message => message.text)).toEqual([text]);
    expect(streamer).toHaveBeenCalledTimes(1);
  });

  test('keeps a partial stored reply marked incomplete with the warning', async () => {
    const { result } = await firstTurn(async () => persisted(stored(2, 'assistant', 'Đang tr', true)));
    expect(result.current.notice).toMatch(interruptedText);
    expect(result.current.messages.at(-1)).toEqual(expect.objectContaining({ text: 'Đang tr', incomplete: true }));
  });

  test('a busy backend shows the still-running notice and never retries', async () => {
    const { result, streamer } = await firstTurn(async () => ({ ...persisted(null), busy: true }));
    expect(result.current.notice).toMatch(/vẫn đang xử lý/);
    expect(streamer).toHaveBeenCalledTimes(1);
  });

  test('an unavailable snapshot leaves an explicit unverified state and keeps the local message', async () => {
    const { result, streamer } = await firstTurn(async () => { throw new Error('offline'); });
    expect(result.current.notice).toMatch(unverifiedText);
    expect(result.current.messages.map(message => [message.role, message.text])).toEqual([['user', text]]);
    expect(result.current.conversationId).toBeNull();
    expect(streamer).toHaveBeenCalledTimes(1);
  });

  test('no matching persisted message stays unconfirmed and keeps the local message', async () => {
    const { result, streamer } = await firstTurn(async () => empty);
    expect(result.current.notice).toMatch(unconfirmedText);
    expect(result.current.messages.map(message => message.text)).toEqual([text]);
    expect(result.current.conversationId).toBeNull();
    expect(streamer).toHaveBeenCalledTimes(1);
  });

  test('a stored conversation holding different text does not confirm the interrupted message', async () => {
    const other: KaelConversationSnapshot = { ...empty, conversationId: conversation, messages: [stored(1, 'user', 'Một câu hỏi khác'), stored(2, 'assistant', 'Trả lời khác.')] };
    const { result } = await firstTurn(async () => other);
    expect(result.current.notice).toMatch(unconfirmedText);
    expect(result.current.messages.map(message => message.text)).toEqual([text]);
  });

  test('an earlier stored conversation with the same text is not mistaken for the interrupted run when the mount load failed', async () => {
    const old: KaelConversationSnapshot = { ...empty, conversationId: conversation, messages: [stored(1, 'user', text), stored(2, 'assistant', 'Trả lời cũ.')] };
    const { result } = await firstTurn(async () => old, async () => { throw new Error('offline'); });
    expect(result.current.notice).toMatch(unconfirmedText);
    expect(result.current.messages.map(message => message.text)).toEqual([text]);
  });

  test('a later verification adopts the stored conversation instead of creating a second one', async () => {
    let snapshot: KaelConversationSnapshot = empty;
    const { result, requests, streamer } = await firstTurn(async () => snapshot);
    expect(result.current.notice).toMatch(unconfirmedText);
    snapshot = persisted(stored(2, 'assistant', 'Đã ghi nhận yêu cầu.'));
    await act(async () => { result.current.refresh(); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(result.current.notice).toBeNull();
    expect(result.current.conversationId).toBe(conversation);
    expect(result.current.messages.map(message => message.text)).toEqual([text, 'Đã ghi nhận yêu cầu.']);
    expect(streamer).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);
    await act(async () => { result.current.send('Tiếp tục'); });
    expect(requests[1]?.conversationId).toBe(conversation);
  });
});

test('a Kael question is shown until the user answers, and the answer is sent as an ordinary message', async () => {
  const question = { id: '77777777-7777-4777-8777-777777777777', prompt: 'Thợ nên đến khi nào?', options: ['Sáng mai', 'Chiều mai'], date: true };
  const { streamer, requests } = scriptedStreamer([
    { events: [started, { type: 'question', question }, { type: 'run_completed', text: 'Bạn chọn giúp Kael nhé.' }] },
    { events: [started, { type: 'run_completed', text: 'Đã ghi nhận.' }] },
  ]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Máy lạnh không mát'); });
  expect(result.current.question).toEqual(question);
  await act(async () => { result.current.send('Chiều mai'); });
  expect(requests[1]?.action).toEqual({ type: 'message', text: 'Chiều mai' });
  expect(result.current.question).toBeNull();
});

test('feedback targets a streamed reply by its run and a restored reply by its stored id', async () => {
  const feedback = jest.fn(async () => undefined);
  const storedId = '88888888-8888-4888-8888-888888888888';
  const loader = jest.fn(async () => ({ ...empty, conversationId: conversation, messages: [{ id: storedId, role: 'assistant' as const, text: 'Trước đó', incomplete: false }] }));
  const { streamer } = scriptedStreamer([{ events: [started, { type: 'message_delta', text: 'Mới' }, { type: 'run_completed', text: 'Mới' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, loader, feedback));
  await act(async () => { await Promise.resolve(); });
  const restored = result.current.messages.find(message => message.text === 'Trước đó');
  expect(restored?.storedId).toBe(storedId);
  await act(async () => { expect(await result.current.rate(restored!, 'up', null)).toBe(true); });
  expect(feedback).toHaveBeenLastCalledWith('customer-a', { messageId: storedId }, 'up', null, expect.anything());
  await act(async () => { result.current.send('Hỏi tiếp'); });
  const fresh = result.current.messages.at(-1)!;
  await act(async () => { await result.current.rate(fresh, 'down', 'too_long'); });
  expect(feedback).toHaveBeenLastCalledWith('customer-a', { runId }, 'down', 'too_long', expect.anything());
  const user = result.current.messages.find(message => message.role === 'user')!;
  await act(async () => { expect(await result.current.rate(user, 'up', null)).toBe(false); });
  feedback.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { expect(await result.current.rate(fresh, 'up', null)).toBe(false); });
});

const conversationB = '77777777-7777-4777-8777-777777777777';
const stored = (id: string, role: 'user' | 'assistant', text: string) => ({ id, role, text, incomplete: false });
const sessionA: KaelConversationSnapshot = { ...empty, conversationId: conversation, messages: [stored('a1111111-1111-4111-8111-111111111111', 'user', 'Sửa vòi nước'), stored('a2222222-2222-4222-8222-222222222222', 'assistant', 'Đã ghi nhận vòi nước')] };
const sessionB: KaelConversationSnapshot = { ...empty, conversationId: conversationB, messages: [stored('b1111111-1111-4111-8111-111111111111', 'user', 'Vệ sinh sofa'), stored('b2222222-2222-4222-8222-222222222222', 'assistant', 'Đã ghi nhận sofa')] };

test('opens a chosen session by id and continues the same conversation', async () => {
  const opener = jest.fn(async () => sessionB);
  const { streamer, requests } = scriptedStreamer([{ events: [{ ...started, conversation_id: conversationB }, { type: 'message_delta', text: 'Ok' }, { type: 'run_completed', text: 'Ok' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { await result.current.open(conversationB); });
  expect(opener).toHaveBeenCalledWith('customer-a', 'client', conversationB, expect.any(AbortSignal));
  expect(result.current.opening).toBeNull();
  expect(result.current.conversationId).toBe(conversationB);
  expect(result.current.messages.map(message => message.text)).toEqual(['Vệ sinh sofa', 'Đã ghi nhận sofa']);
  await act(async () => { result.current.send('Thêm ghế'); });
  expect(requests[0]?.conversationId).toBe(conversationB);
});

test('a new session starts empty and creates its conversation only on the first message', async () => {
  const opener = jest.fn(async () => sessionA);
  const { streamer, requests } = scriptedStreamer([{ events: [{ ...started, conversation_id: conversationB }, { type: 'run_completed', text: 'Chào' }] }]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { await result.current.open(conversation); });
  await act(async () => { result.current.reset(); });
  expect(result.current.conversationId).toBeNull();
  expect(result.current.messages).toEqual([]);
  expect(streamer).not.toHaveBeenCalled();
  await act(async () => { result.current.send('Việc mới'); });
  expect(requests[0]?.conversationId).toBeNull();
});

test('rapid switching keeps only the last chosen session and ignores the late reply', async () => {
  let releaseA: (value: KaelConversationSnapshot) => void = () => undefined;
  const slowA = new Promise<KaelConversationSnapshot>(resolve => { releaseA = resolve; });
  const opener = jest.fn(async (_user: string, _mode: KaelMode, id: string) => (id === conversation ? slowA : sessionB));
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', scriptedStreamer([]).streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { void result.current.open(conversation); });
  expect(result.current.opening).toEqual({ id: conversation, failed: false });
  await act(async () => { await result.current.open(conversationB); });
  await act(async () => { releaseA(sessionA); await slowA; });
  expect(result.current.conversationId).toBe(conversationB);
  expect(result.current.messages.map(message => message.text)).toEqual(['Vệ sinh sofa', 'Đã ghi nhận sofa']);
});

test('the previous session content is gone while the next one loads and sending is blocked', async () => {
  let release: (value: KaelConversationSnapshot) => void = () => undefined;
  const pending = new Promise<KaelConversationSnapshot>(resolve => { release = resolve; });
  const opener = jest.fn(async (_user: string, _mode: KaelMode, id: string) => (id === conversation ? sessionA : pending));
  const { streamer } = scriptedStreamer([]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { await result.current.open(conversation); });
  await act(async () => { void result.current.open(conversationB); });
  expect(result.current.messages).toEqual([]);
  await act(async () => { result.current.send('Không được gửi vào phiên khác'); });
  expect(streamer).not.toHaveBeenCalled();
  await act(async () => { release(sessionB); await pending; });
  expect(result.current.messages.map(message => message.text)).toEqual(['Vệ sinh sofa', 'Đã ghi nhận sofa']);
});

test('a failed open is reported, blocks sending, and retries the same session', async () => {
  const opener = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(sessionA);
  const { streamer } = scriptedStreamer([]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { await result.current.open(conversation); });
  expect(result.current.opening).toEqual({ id: conversation, failed: true });
  await act(async () => { result.current.send('Không tạo phiên mới ngầm'); });
  expect(streamer).not.toHaveBeenCalled();
  await act(async () => { result.current.retryOpen(); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.opening).toBeNull();
  expect(result.current.conversationId).toBe(conversation);
});

test('opening another session keeps an unreconciled account check visible', async () => {
  const check = { ...approval, kind: 'reconcile' as const, expires_at: null };
  const opener = jest.fn(async () => ({ ...sessionB, approvals: [check] }));
  const loader = jest.fn(async () => ({ ...sessionA, approvals: [check] }));
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', scriptedStreamer([]).streamer, loader, jest.fn(), opener));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.approvals).toHaveLength(1);
  await act(async () => { await result.current.open(conversationB); });
  expect(result.current.approvals.map(item => item.kind)).toEqual(['reconcile']);
});

test('switching session mid-turn cancels only the local stream and does not leak the reply into the next session', async () => {
  let release: (outcome: KaelTurnOutcome) => void = () => undefined;
  const gate = new Promise<KaelTurnOutcome>(resolve => { release = resolve; });
  const streamer = jest.fn(async (_user: string, _request: KaelTurnRequest, onEvent: (event: KaelEvent) => void, signal: AbortSignal) => {
    onEvent({ ...started, v: 1, run_id: runId, seq: 1 } as KaelEvent);
    signal.addEventListener('abort', () => release({ kind: 'cancelled' }));
    return gate;
  });
  const opener = jest.fn(async () => sessionB);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { result.current.send('Đang chạy ở phiên A'); });
  expect(result.current.running).toBe(true);
  await act(async () => { await result.current.open(conversationB); });
  expect(result.current.running).toBe(false);
  expect(result.current.messages.map(message => message.text)).toEqual(['Vệ sinh sofa', 'Đã ghi nhận sofa']);
  expect(result.current.conversationId).toBe(conversationB);
});

test('a failed switch during a running turn leaves no running state, blocks sending, and retries into the chosen session', async () => {
  let release: (outcome: KaelTurnOutcome) => void = () => undefined;
  const gate = new Promise<KaelTurnOutcome>(resolve => { release = resolve; });
  const streamer = jest.fn(async (_user: string, _request: KaelTurnRequest, onEvent: (event: KaelEvent) => void, signal: AbortSignal) => {
    onEvent({ ...started, v: 1, run_id: runId, seq: 1 } as KaelEvent);
    signal.addEventListener('abort', () => release({ kind: 'cancelled' }));
    return gate;
  });
  const opener = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(sessionB);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader, jest.fn(), opener));
  await act(async () => { result.current.send('Đang chạy ở phiên A'); });
  expect(result.current.running).toBe(true);
  await act(async () => { await result.current.open(conversationB); });
  expect(result.current.opening).toEqual({ id: conversationB, failed: true });
  expect(result.current.running).toBe(false);
  expect(result.current.messages).toEqual([]);
  streamer.mockClear();
  await act(async () => { result.current.send('Không gửi vào phiên nào'); });
  expect(streamer).not.toHaveBeenCalled();
  await act(async () => { result.current.retryOpen(); await Promise.resolve(); });
  await act(async () => { await Promise.resolve(); });
  expect(result.current.opening).toBeNull();
  expect(result.current.running).toBe(false);
  expect(result.current.conversationId).toBe(conversationB);
  expect(result.current.messages.map(message => message.text)).toEqual(['Vệ sinh sofa', 'Đã ghi nhận sofa']);
});
