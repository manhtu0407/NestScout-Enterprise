import { act, renderHook } from '@testing-library/react-native';

import type { KaelEvent, KaelTurnOutcome, KaelTurnRequest } from '@/features/shared';

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
const approval = { id: approvalId, task_id: taskId, tool: 'service_request_submit', summary: 'Gửi yêu cầu dịch vụ', details: { 'Địa điểm': 'Quận 3' }, fingerprint: 'a'.repeat(64), expires_at: '2026-11-03T04:00:00Z' };

test('streams a reply, tracks tasks and approvals, and continues in the same conversation', async () => {
  const { streamer, requests } = scriptedStreamer([
    { events: [started, { type: 'tool_started', call_id: 'c', tool: 'task_create', label: 'Đang ghi nhận việc cần làm' }, task('waiting_for_approval'), { type: 'approval_required', approval }, { type: 'message_delta', text: 'Bạn xác nhận nhé.' }, { type: 'run_completed', text: 'Bạn xác nhận nhé.' }] },
    { events: [started, task('completed'), { type: 'message_delta', text: 'Đã gửi.' }, { type: 'run_completed', text: 'Đã gửi.' }] },
  ]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer));
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
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer));
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
  const guest = await renderHook(() => useKaelConversation(null, 'client', streamer));
  await act(async () => { guest.result.current.send('Xin chào'); });
  expect(streamer).not.toHaveBeenCalled();
  expect(guest.result.current.available).toBe(false);

  const { result, rerender } = await renderHook(({ mode }: { mode: 'client' | 'worker' }) => useKaelConversation('worker-a', mode, streamer), { initialProps: { mode: 'client' } });
  await act(async () => { result.current.send('Xin chào'); });
  expect(result.current.messages).toHaveLength(2);
  await rerender({ mode: 'worker' });
  expect(result.current.messages).toHaveLength(0);
  await act(async () => { result.current.send('Lịch hôm nay'); });
  expect(requests[1]).toEqual(expect.objectContaining({ mode: 'worker', conversationId: null }));
});
