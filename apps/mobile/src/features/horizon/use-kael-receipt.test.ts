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

type Body = Record<string, unknown> & { type: KaelEvent['type'] };

function scriptedStreamer(scripts: Body[][]) {
  return jest.fn(async (_userId: string, _request: KaelTurnRequest, onEvent: (event: KaelEvent) => void) => {
    const events = scripts.shift() ?? [];
    events.forEach((body, index) => onEvent({ ...body, v: 1, run_id: runId, seq: index + 1 } as KaelEvent));
    const last = events.at(-1)!;
    return { kind: 'terminal', event: { ...last, v: 1, run_id: runId, seq: events.length } } as KaelTurnOutcome;
  });
}

const started = { type: 'run_started' as const, conversation_id: conversation, request_id: 'r', replayed: false };
const submitted = (outcome: string) => ({ type: 'tool_completed' as const, call_id: 'call-submit', tool: 'service_request_submit', outcome, label: 'Gửi yêu cầu' });
const completed = (text: string) => ({ type: 'run_completed' as const, text });
const empty: KaelConversationSnapshot = { conversationId: null, busy: false, messages: [], tasks: [], approvals: [] };
const emptyLoader = jest.fn(async () => empty);

test('a succeeded submit sets the receipt and the next run clears it', async () => {
  const streamer = scriptedStreamer([[started, submitted('succeeded'), completed('Đã gửi.')], [started, completed('Ok.')]]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Gửi'); });
  expect(result.current.receipt).toBe('call-submit');
  await act(async () => { result.current.send('Cảm ơn'); });
  expect(result.current.receipt).toBeNull();
});

test.each(['uncertain', 'failed', 'denied', 'unavailable', 'approval_required'])('a %s submit never produces a receipt', async outcome => {
  const streamer = scriptedStreamer([[started, submitted(outcome), completed('Chưa rõ.')]]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Gửi'); });
  expect(result.current.receipt).toBeNull();
});

test('run_completed alone, or another tool succeeding, is not evidence of a submission', async () => {
  const streamer = scriptedStreamer([[started, { type: 'tool_completed', call_id: 'c', tool: 'customer_requests', outcome: 'succeeded', label: 'Xem' }, completed('Xong.')]]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Xem yêu cầu'); });
  expect(result.current.receipt).toBeNull();
});

test('a failed run after a success does not carry the old receipt into the next operation', async () => {
  const streamer = scriptedStreamer([[started, submitted('succeeded'), completed('Đã gửi.')], [started, { type: 'run_failed', code: 'provider_error', message: 'Lỗi', retryable: true }]]);
  const { result } = await renderHook(() => useKaelConversation('customer-a', 'client', streamer, emptyLoader));
  await act(async () => { result.current.send('Gửi'); });
  await act(async () => { result.current.send('Gửi lần nữa'); });
  expect(result.current.receipt).toBeNull();
  expect(result.current.notice).toBe('Lỗi');
});

test('switching mode drops the receipt', async () => {
  const streamer = scriptedStreamer([[started, submitted('succeeded'), completed('Đã gửi.')]]);
  const { result, rerender } = await renderHook(({ mode }: { mode: KaelMode }) => useKaelConversation('customer-a', mode, streamer, emptyLoader), { initialProps: { mode: 'client' as KaelMode } });
  await act(async () => { result.current.send('Gửi'); });
  expect(result.current.receipt).toBe('call-submit');
  await rerender({ mode: 'worker' });
  expect(result.current.receipt).toBeNull();
});
