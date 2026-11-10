import { loadKaelConversation, streamKaelTurn, type KaelTurnRequest } from './kael-runtime-repository';
import type { KaelEvent } from './kael-events';
import { ConfigError } from '@/lib/config';

const mockGetSession = jest.fn();
const mockLoadConfig = jest.fn(() => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }));
jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock('@/lib/config', () => {
  class ConfigError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConfigError';
    }
  }
  return { loadConfig: () => mockLoadConfig(), ConfigError };
});

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
  mockLoadConfig.mockReturnValue({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' });
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

const snapshotBody = {
  conversation_id: conversation,
  busy: false,
  messages: [{ id: '44444444-4444-4444-8444-444444444444', role: 'user', content: 'Sửa máy lạnh', status: 'complete' }],
  tasks: [{ id: '55555555-5555-4555-8555-555555555555', title: 'Sửa máy lạnh', kind: 'service_request', status: 'waiting_for_approval', version: 3, summary: '' }],
  approvals: [{ id: '66666666-6666-4666-8666-666666666666', task_id: '55555555-5555-4555-8555-555555555555', tool: 'service_request_submit', summary: 'Gửi yêu cầu dịch vụ', details: { 'Mô tả': 'Rò nước' }, fingerprint: 'a'.repeat(64), kind: 'confirm', expires_at: '2026-11-03T04:00:00+00:00' }],
};

test('recovers the current conversation through the account-scoped read contract only', async () => {
  const request = jest.fn(async () => ({ ok: true, status: 200, json: async () => snapshotBody }) as unknown as Response);
  const snapshot = await loadKaelConversation('customer-a', 'worker', new AbortController().signal, request);
  expect(request).toHaveBeenCalledWith('customer-a', 'rpc/kael_conversation_state', expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_mode: 'worker' }) }));
  expect(snapshot.conversationId).toBe(conversation);
  expect(snapshot.messages).toEqual([{ id: '44444444-4444-4444-8444-444444444444', role: 'user', text: 'Sửa máy lạnh', incomplete: false }]);
  expect(snapshot.approvals[0]?.details).toEqual({ 'Mô tả': 'Rò nước' });
  const reconcile = { ...snapshotBody.approvals[0], kind: 'reconcile', expires_at: null };
  const uncertain = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...snapshotBody, approvals: [reconcile] }) }) as unknown as Response);
  expect((await loadKaelConversation('customer-a', 'client', new AbortController().signal, uncertain)).approvals).toEqual([expect.objectContaining({ kind: 'reconcile', expires_at: null, id: reconcile.id })]);
});

test('an unreadable or out-of-contract recovery is an error, never an empty conversation', async () => {
  const failing = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response);
  await expect(loadKaelConversation('customer-a', 'client', new AbortController().signal, failing)).rejects.toThrow('HTTP 401');
  const malformed = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...snapshotBody, approvals: [{ ...snapshotBody.approvals[0], fingerprint: 'short' }] }) }) as unknown as Response);
  await expect(loadKaelConversation('customer-a', 'client', new AbortController().signal, malformed)).rejects.toThrow('outside the contract');
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
    .resolves.toEqual(expect.objectContaining({ kind: 'refused', code: 'provider_unavailable', message: expect.stringContaining('HTTP 502') }));
});

test('invalid TestFlight config and Auth are definite refusals while network failures remain recoverable', async () => {
  mockLoadConfig.mockImplementationOnce(() => { throw new ConfigError('EXPO_PUBLIC_TESTFLIGHT_SUPABASE_URL is required.'); });
  const config = await streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, jest.fn());
  expect(config).toEqual(expect.objectContaining({ kind: 'refused', code: 'provider_unavailable', message: expect.stringContaining('EXPO_PUBLIC_TESTFLIGHT_SUPABASE_URL') }));

  mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
  const auth = await streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, jest.fn());
  expect(auth).toEqual(expect.objectContaining({ kind: 'refused', code: 'unauthenticated', message: expect.stringContaining('Supabase Auth') }));

  const disconnected = await streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal,
    jest.fn(async () => { throw new TypeError('Network request failed'); }));
  expect(disconnected).toEqual({ kind: 'interrupted' });
});

test('a fetch failure before response headers is an unknown server outcome, not a refusal', async () => {
  const fetcher = jest.fn(async () => { throw new TypeError('Network request failed'); });
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, fetcher))
    .resolves.toEqual({ kind: 'interrupted' });
  expect(fetcher).toHaveBeenCalledTimes(1);

  const response = { ok: true, status: 200, body: null } as unknown as Response;
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, jest.fn(async () => response)))
    .resolves.toEqual({ kind: 'interrupted' });
});

test('a changed session or cancelled request never reports success', async () => {
  const { fetcher } = streamed([line(1, { type: 'run_completed', text: 'x' })]);
  await expect(streamKaelTurn('customer-b', request, () => undefined, new AbortController().signal, fetcher)).resolves.toMatchObject({
    kind: 'refused', code: 'unauthenticated', message: expect.stringContaining('đăng nhập lại'), retryable: false,
  });
  expect(fetcher).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(streamKaelTurn('customer-a', request, () => undefined, controller.signal, fetcher)).resolves.toEqual({ kind: 'cancelled' });
});

describe('stream sequence integrity', () => {
  const start = line(1, { type: 'run_started', conversation_id: conversation, request_id: request.requestId, replayed: false });
  const run = async (chunks: string[]) => {
    const events: KaelEvent[] = [];
    const { fetcher, cancel } = streamed(chunks);
    const outcome = await streamKaelTurn('customer-a', request, event => events.push(event), new AbortController().signal, fetcher);
    return { outcome, events, cancel };
  };

  test('accepts a contiguous sequence from 1 to a terminal event', async () => {
    const { outcome, events } = await run([start + line(2, { type: 'message_delta', text: 'a' }) + line(3, { type: 'run_completed', text: 'a' })]);
    expect(outcome.kind).toBe('terminal');
    expect(events.map(event => event.seq)).toEqual([1, 2, 3]);
  });

  test('a stream that does not start at sequence 1 is interrupted before any event is delivered', async () => {
    const { outcome, events } = await run([line(2, { type: 'run_started', conversation_id: conversation, request_id: request.requestId, replayed: false }) + line(3, { type: 'run_completed', text: 'a' })]);
    expect(outcome).toEqual({ kind: 'interrupted' });
    expect(events).toEqual([]);
  });

  test('a skipped sequence number is an interruption and never reaches the terminal handler', async () => {
    const { outcome, events, cancel } = await run([start + line(2, { type: 'message_delta', text: 'a' }) + line(4, { type: 'run_completed', text: 'a' })]);
    expect(outcome).toEqual({ kind: 'interrupted' });
    expect(events.map(event => event.seq)).toEqual([1, 2]);
    expect(events.some(event => event.type === 'run_completed')).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  test('a skipped approval event is never inferred from the events that follow it', async () => {
    const { outcome, events } = await run([start + line(3, { type: 'tool_completed', call_id: 'approval:x', tool: 'service_request_submit', outcome: 'succeeded', label: 'x' }) + line(4, { type: 'run_completed', text: 'Đã gửi' })]);
    expect(outcome).toEqual({ kind: 'interrupted' });
    expect(events.map(event => event.type)).toEqual(['run_started']);
  });

  test('legitimate duplicates and replays of old events are ignored while the stream continues', async () => {
    const { outcome, events } = await run([start + line(2, { type: 'message_delta', text: 'a' }) + line(2, { type: 'message_delta', text: 'a' }) + line(1, { type: 'message_delta', text: 'old' }) + line(3, { type: 'run_completed', text: 'a' })]);
    expect(outcome.kind).toBe('terminal');
    expect(events.map(event => event.seq)).toEqual([1, 2, 3]);
  });

  test('truncated final lines and missing terminal events are interruptions', async () => {
    const truncated = line(2, { type: 'run_completed', text: 'a' }).trim();
    expect((await run([start + truncated.slice(0, 20)])).outcome).toEqual({ kind: 'interrupted' });
    const unterminated = await run([start + truncated]);
    expect(unterminated.outcome).toEqual({ kind: 'interrupted' });
    expect(unterminated.events.map(event => event.type)).toEqual(['run_started']);
    expect((await run([start + line(2, { type: 'message_delta', text: 'a' })])).outcome).toEqual({ kind: 'interrupted' });
  });

  test('malformed events and a changed run identity stop the stream without a terminal event', async () => {
    const other = '44444444-4444-4444-8444-444444444444';
    expect((await run([start + '{"v":1,"seq":2,"run_id":"x"}\n'])).outcome).toEqual({ kind: 'interrupted' });
    expect((await run([start + line(2, { type: 'run_completed', text: 'a' }, other)])).outcome).toEqual({ kind: 'interrupted' });
    expect((await run([start + line(0, { type: 'message_delta', text: 'a' })])).outcome).toEqual({ kind: 'interrupted' });
  });
});

function replyOf(chunks: string[], options: { durable?: boolean; status?: number } = {}) {
  const { durable = true, status = 200 } = options;
  const encoder = new TextEncoder();
  let index = 0;
  const body = {
    getReader: () => ({
      read: async () => (index < chunks.length ? { value: encoder.encode(chunks[index++]), done: false } : { value: undefined, done: true }),
      cancel: async () => undefined,
    }),
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (durable && name === 'x-kael-runtime' ? 'durable' : null) },
    body,
    json: async () => JSON.parse(chunks.join('')),
  } as unknown as Response;
}

const started = line(1, { type: 'run_started', conversation_id: conversation, request_id: request.requestId, replayed: false });
const replayedStart = line(1, { type: 'run_started', conversation_id: conversation, request_id: request.requestId, replayed: true });
const firstDelta = line(2, { type: 'message_delta', text: 'Chào ' });
const secondDelta = line(3, { type: 'message_delta', text: 'bạn' });
const completed = line(4, { type: 'run_completed', text: 'Chào bạn' });

test('a durable run that loses its connection is reattached by request id and each event is delivered once', async () => {
  const fetcher = jest.fn()
    .mockResolvedValueOnce(replyOf([started + firstDelta]))
    .mockResolvedValueOnce(replyOf([replayedStart + firstDelta + secondDelta + completed]));
  const events: KaelEvent[] = [];
  const outcome = await streamKaelTurn('customer-a', request, event => events.push(event), new AbortController().signal, fetcher, [0, 0]);
  expect(outcome).toEqual({ kind: 'terminal', event: expect.objectContaining({ type: 'run_completed', text: 'Chào bạn' }) });
  expect(events.map(event => `${event.seq}:${event.type}`)).toEqual(['1:run_started', '2:message_delta', '3:message_delta', '4:run_completed']);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const bodies = fetcher.mock.calls.map(call => JSON.parse((call[1] as { body: string }).body));
  expect(bodies[1]).toEqual(bodies[0]);
});

test('a durable run is reattached through a transient busy answer while another process takes it over', async () => {
  const busy = replyOf([JSON.stringify({ error: { code: 'busy', message: 'Kael đang xử lý yêu cầu trước đó.', retryable: true } })], { status: 409 });
  const fetcher = jest.fn()
    .mockResolvedValueOnce(replyOf([started + firstDelta]))
    .mockResolvedValueOnce(busy)
    .mockResolvedValueOnce(replyOf([replayedStart + firstDelta + secondDelta + completed]));
  const outcome = await streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, fetcher, [0, 0, 0]);
  expect(outcome.kind).toBe('terminal');
  expect(fetcher).toHaveBeenCalledTimes(3);
});

test('reconnection is bounded and ends interrupted when the run never comes back', async () => {
  const fetcher = jest.fn(async () => replyOf([started + firstDelta]));
  const events: KaelEvent[] = [];
  const outcome = await streamKaelTurn('customer-a', request, event => events.push(event), new AbortController().signal, fetcher, [0, 0]);
  expect(outcome).toEqual({ kind: 'interrupted' });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(events).toHaveLength(2);
});

test('a first busy answer is reported at once and a legacy run is never replayed by the client', async () => {
  const busy = jest.fn(async () => replyOf([JSON.stringify({ error: { code: 'busy', message: 'Kael đang xử lý yêu cầu trước đó.', retryable: true } })], { status: 409 }));
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, busy, [0, 0])).resolves.toEqual({
    kind: 'refused', code: 'busy', message: 'Kael đang xử lý yêu cầu trước đó.', retryable: true,
  });
  expect(busy).toHaveBeenCalledTimes(1);
  const legacy = jest.fn(async () => replyOf([started + firstDelta], { durable: false }));
  await expect(streamKaelTurn('customer-a', request, () => undefined, new AbortController().signal, legacy, [0, 0])).resolves.toEqual({ kind: 'interrupted' });
  expect(legacy).toHaveBeenCalledTimes(1);
});

test('cancelling while waiting to reconnect stops without another request', async () => {
  const controller = new AbortController();
  const fetcher = jest.fn(async () => replyOf([started + firstDelta]));
  const pending = streamKaelTurn('customer-a', request, event => { if (event.seq === 2) controller.abort(); }, controller.signal, fetcher, [60000]);
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
