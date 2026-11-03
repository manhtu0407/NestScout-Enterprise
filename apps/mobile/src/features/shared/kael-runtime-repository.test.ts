import { streamKaelTurn, type KaelTurnRequest } from './kael-runtime-repository';
import type { KaelEvent } from './kael-events';

const mockGetSession = jest.fn();
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock('@/lib/config', () => ({
  loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }),
}));

const runId = '11111111-1111-4111-8111-111111111111';
const conversation = '22222222-2222-4222-8222-222222222222';
const request: KaelTurnRequest = { requestId: '33333333-3333-4333-8333-333333333333', conversationId: null, mode: 'client', action: { type: 'message', text: 'Xin chào' } };
const line = (seq: number, body: Record<string, unknown>, run = runId) => `${JSON.stringify({ v: 1, run_id: run, seq, ...body })}\n`;

function streamed(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  let index = 0;
  const cancel = jest.fn(async () => undefined);
  const body = { getReader: () => ({ read: async () => (index < chunks.length ? { value: encoder.encode(chunks[index++]), done: false } : { value: undefined, done: true }), cancel }) };
  const response = { ok: status >= 200 && status < 300, status, body, json: async () => JSON.parse(chunks.join('')) } as unknown as Response;
  return { fetcher: jest.fn(async () => response), cancel };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'customer-a' }, access_token: 'token-a' } }, error: null });
});

test('posts the turn to the Kael function with the session token and streams ordered events to completion', async () => {
  const all = line(1, { type: 'run_started', conversation_id: conversation, request_id: request.requestId, replayed: false })
    + line(2, { type: 'message_delta', text: 'Chào ' }) + line(3, { type: 'message_delta', text: 'bạn' }) + line(4, { type: 'run_completed', text: 'Chào bạn' });
  const { fetcher, cancel } = streamed([all.slice(0, 50), all.slice(50, 140), all.slice(140)]);
  const events: KaelEvent[] = [];
  const outcome = await streamKaelTurn('customer-a', request, event => events.push(event), new AbortController().signal, fetcher);
  expect(outcome).toEqual({ kind: 'terminal', event: expect.objectContaining({ type: 'run_completed', text: 'Chào bạn' }) });
  expect(events.map(event => event.type)).toEqual(['run_started', 'message_delta', 'message_delta', 'run_completed']);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
  expect(url).toBe('http://127.0.0.1:54321/functions/v1/kael');
  expect(init.headers.Authorization).toBe('Bearer token-a');
  expect(JSON.parse(init.body)).toEqual({ request_id: request.requestId, conversation_id: null, mode: 'client', action: { type: 'message', text: 'Xin chào' } });
  expect(cancel).toHaveBeenCalled();
});

test('a stream that ends without a terminal event is interrupted, never completed', async () => {
  const { fetcher } = streamed([line(1, { type: 'message_delta', text: 'Đang' })]);
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, fetcher)).resolves.toEqual({ kind: 'interrupted' });
});

test('duplicate sequence numbers are ignored and events from another run stop the stream', async () => {
  const events: KaelEvent[] = [];
  const duplicate = streamed([line(1, { type: 'message_delta', text: 'a' }) + line(1, { type: 'message_delta', text: 'a' }) + line(2, { type: 'run_completed', text: 'a' })]);
  await streamKaelTurn('customer-a', request, event => events.push(event), new AbortController().signal, duplicate.fetcher);
  expect(events.filter(event => event.type === 'message_delta')).toHaveLength(1);
  const foreign = streamed([line(1, { type: 'message_delta', text: 'a' }) + line(2, { type: 'run_completed', text: 'x' }, '44444444-4444-4444-8444-444444444444')]);
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, foreign.fetcher)).resolves.toEqual({ kind: 'interrupted' });
  const malformed = streamed([line(1, { type: 'message_delta', text: 'a' }) + '{"v":1,"type":"run_completed"}\n']);
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, malformed.fetcher)).resolves.toEqual({ kind: 'interrupted' });
});

test('server refusals surface the server message, and unreadable refusals stay honest', async () => {
  const busy = streamed([JSON.stringify({ error: { code: 'busy', message: 'Kael vẫn đang xử lý.', retryable: true } })], 409);
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, busy.fetcher))
    .resolves.toEqual({ kind: 'refused', code: 'busy', message: 'Kael vẫn đang xử lý.', retryable: true });
  const opaque = streamed(['<html>'], 502);
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, opaque.fetcher))
    .resolves.toEqual(expect.objectContaining({ kind: 'refused', code: 'internal' }));
});

test('a changed session or cancelled request never reports success', async () => {
  const { fetcher } = streamed([line(1, { type: 'run_completed', text: 'x' })]);
  await expect(streamKaelTurn('customer-b', request, () => undefined, new AbortController().signal, fetcher)).resolves.toEqual({ kind: 'interrupted' });
  expect(fetcher).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(streamKaelTurn('customer-a', request, () => undefined, controller.signal, fetcher)).resolves.toEqual({ kind: 'cancelled' });
});
