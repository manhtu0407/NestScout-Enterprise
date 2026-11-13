import { cancelRequest, readDispatchSummaries, requestReassignment, retryDispatchRequest, setRequestService } from './dispatch-repository';
import { WorkflowError } from './workflow-error';

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '33333333-3333-4333-8333-333333333333' }));
jest.mock('@/lib/config', () => ({
  loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }),
}));

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const signal = new AbortController().signal;

function row(overrides: Record<string, unknown> = {}) {
  return { request_id: first, state: 'no_match', open_invites: 0, earliest_expiry: null, rounds: 1, can_retry: true, can_cancel: true, can_reclassify: false, next_retry_at: null, retries_left: 2, last_outcome: 'no_eligible_worker', can_reassign: false, reassign_at: null, ...overrides };
}

function respond(body: unknown, ok = true, status = 200) {
  jest.mocked(global.fetch).mockResolvedValueOnce({ ok, status, json: async () => body } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'customer-a' }, access_token: 'token-a' } }, error: null });
  global.fetch = jest.fn();
});

test('no identifiers means no request', async () => {
  await expect(readDispatchSummaries('customer-a', [], signal)).resolves.toEqual([]);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('summaries are read through the owner scoped function and mapped', async () => {
  respond([row({ state: 'searching', open_invites: 2, earliest_expiry: '2026-11-12T10:30:00.000Z', can_retry: false })]);
  await expect(readDispatchSummaries('customer-a', [first], signal)).resolves.toEqual([
    { requestId: first, state: 'searching', openInvites: 2, earliestExpiry: '2026-11-12T10:30:00.000Z', rounds: 1, canRetry: false, canCancel: true, canReclassify: false, nextRetryAt: null, retriesLeft: 2, lastOutcome: 'no_eligible_worker', canReassign: false, reassignAt: null },
  ]);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/get_dispatch_summary',
    expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token-a' }), body: JSON.stringify({ p_request_ids: [first] }) }),
  );
});

test('more than one hundred requests are read in batches', async () => {
  const ids = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
  respond([]);
  respond([]);
  await expect(readDispatchSummaries('customer-a', ids, signal)).resolves.toEqual([]);
  expect(global.fetch).toHaveBeenCalledTimes(2);
  const sizes = jest.mocked(global.fetch).mock.calls.map(call => (JSON.parse(String((call[1] as RequestInit).body)) as { p_request_ids: string[] }).p_request_ids.length);
  expect(sizes).toEqual([100, 1]);
});

test('an identifier that is not a uuid is rejected before any request', async () => {
  await expect(readDispatchSummaries('customer-a', ['r1'], signal)).rejects.toThrow('Invalid request identifier');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a failed read is an error and never an empty list', async () => {
  respond({ message: 'down' }, false, 503);
  await expect(readDispatchSummaries('customer-a', [first], signal)).rejects.toThrow('Could not read dispatch summaries');
});

test.each([
  ['a state outside the contract', row({ state: 'matched' })],
  ['a request that was not asked for', row({ request_id: second })],
  ['a negative count', row({ open_invites: -1 })],
  ['a fractional round count', row({ rounds: 1.5 })],
  ['an expiry that is not a date', row({ earliest_expiry: 'soon' })],
  ['a non boolean flag', row({ can_retry: 'yes' })],
  ['a non boolean reclassify flag', row({ can_reclassify: 'yes' })],
  ['a negative retry budget', row({ retries_left: -1 })],
  ['a non boolean reassign flag', row({ can_reassign: 'yes' })],
  ['a reassign time that is not a date', row({ reassign_at: 'soon' })],
  ['a retry time that is not a date', row({ next_retry_at: 'soon' })],
  ['a row that is not an object', null],
])('%s is rejected', async (_name, bad) => {
  respond([bad]);
  await expect(readDispatchSummaries('customer-a', [first], signal)).rejects.toThrow('Invalid dispatch response');
});

test('a response that is not a list is rejected', async () => {
  respond({ rows: [] });
  await expect(readDispatchSummaries('customer-a', [first], signal)).rejects.toThrow('Invalid dispatch response');
});

test('summaries from a server without the recovery fields read with safe defaults', async () => {
  respond([{ request_id: first, state: 'recovering', open_invites: 1, earliest_expiry: '2026-11-12T10:30:00.000Z', rounds: 2, can_retry: false, can_cancel: true }]);
  await expect(readDispatchSummaries('customer-a', [first], signal)).resolves.toMatchObject([{ state: 'recovering', canReclassify: false, canReassign: false, reassignAt: null, nextRetryAt: null, retriesLeft: 0, lastOutcome: null }]);
});

test('a retry returns the structured outcome the database decided', async () => {
  respond({ outcome: 'cooldown', state: 'no_match', can_retry: false, retries_left: 1, open_invites: 0, next_retry_at: '2026-11-12T10:30:00.000Z' });
  await expect(retryDispatchRequest('customer-a', first, signal)).resolves.toEqual({
    outcome: 'cooldown', state: 'no_match', canRetry: false, retriesLeft: 1, openInvites: 0, nextRetryAt: '2026-11-12T10:30:00.000Z',
  });
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/retry_service_dispatch',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_request_id: first }) }),
  );
});

test('a retry that opened a search carries no remaining budget and still reads as success', async () => {
  respond({ round: 3, outcome: 'invited', invited: 1, state: 'searching', can_retry: false, retries_left: null, open_invites: 1, next_retry_at: '2026-11-12T10:30:00.000Z' });
  await expect(retryDispatchRequest('customer-a', first, signal)).resolves.toEqual({
    outcome: 'invited', state: 'searching', canRetry: false, retriesLeft: 0, openInvites: 1, nextRetryAt: '2026-11-12T10:30:00.000Z',
  });
});

test.each([
  ['a bare count', 2],
  ['an unknown outcome', { outcome: 'done', state: 'searching', can_retry: false, retries_left: 1, open_invites: 1 }],
  ['an unknown state', { outcome: 'invited', state: 'matched', can_retry: false, retries_left: 1, open_invites: 1 }],
  ['a missing budget', { outcome: 'invited', state: 'searching', can_retry: false, open_invites: 1 }],
])('a retry response with %s is rejected', async (_name, bad) => {
  respond(bad);
  await expect(retryDispatchRequest('customer-a', first, signal)).rejects.toThrow('Invalid retry response');
});

test('a refused retry becomes a classified workflow failure', async () => {
  respond({ code: '22023', message: 'request cancelled' }, false, 400);
  await expect(retryDispatchRequest('customer-a', first, signal)).rejects.toMatchObject({ failure: 'unavailable' });
});

test('setting a missing service sends the owner command and confirms the same value', async () => {
  respond('aircon');
  await expect(setRequestService('customer-a', first, 'aircon', signal)).resolves.toBe('aircon');
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/set_request_service',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_request_id: first, p_service_id: 'aircon' }) }),
  );
  respond('water');
  await expect(setRequestService('customer-a', first, 'aircon', signal)).rejects.toThrow('Invalid service response');
});

test('a service that is already set is a definitive refusal', async () => {
  respond({ code: '22023', message: 'service already set' }, false, 400);
  await expect(setRequestService('customer-a', first, 'aircon', signal)).rejects.toMatchObject({ failure: 'unavailable' });
});

test('a cancellation confirms the same request', async () => {
  respond(first);
  await expect(cancelRequest('customer-a', first, signal)).resolves.toBe(first);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/cancel_service_request',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_request_id: first }) }),
  );
});

test('a cancellation that echoes another request is rejected', async () => {
  respond(second);
  await expect(cancelRequest('customer-a', first, signal)).rejects.toThrow('Invalid cancellation response');
});

test('cancelling an assigned request reports that it is no longer available', async () => {
  respond({ code: '40001', message: 'already assigned' }, false, 409);
  const failure: unknown = await cancelRequest('customer-a', first, signal).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(WorkflowError);
  expect(failure).toMatchObject({ failure: 'unavailable' });
});

test('an assigned request that can hand over reads its reassign window', async () => {
  respond([row({ state: 'assigned', can_retry: false, can_cancel: false, can_reassign: true, reassign_at: '2026-11-12T10:30:00.000Z' })]);
  await expect(readDispatchSummaries('customer-a', [first], signal)).resolves.toMatchObject([{ state: 'assigned', canReassign: true, reassignAt: '2026-11-12T10:30:00.000Z' }]);
});

test('a reassignment sends one idempotency key and accepts only a release outcome', async () => {
  respond({ outcome: 'released', dispatch: { outcome: 'invited' } });
  await expect(requestReassignment('customer-a', first, signal)).resolves.toBeUndefined();
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/request_service_reassignment',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_request_id: first, p_key: '33333333-3333-4333-8333-333333333333' }) }),
  );
  respond({ outcome: 'already_released' });
  await expect(requestReassignment('customer-a', first, signal)).resolves.toBeUndefined();
  respond({ outcome: 'done' });
  await expect(requestReassignment('customer-a', first, signal)).rejects.toThrow('Invalid reassignment response');
  respond(7);
  await expect(requestReassignment('customer-a', first, signal)).rejects.toThrow('Invalid reassignment response');
});

test('a reassignment asked before the worker had time is a definitive early refusal', async () => {
  respond({ code: '22023', message: 'worker still has time' }, false, 400);
  await expect(requestReassignment('customer-a', first, signal)).rejects.toMatchObject({ failure: 'early' });
});
