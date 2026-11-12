import { cancelRequest, readDispatchSummaries, redispatchRequest } from './dispatch-repository';
import { WorkflowError } from './workflow-error';

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock('@/lib/config', () => ({
  loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }),
}));

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const signal = new AbortController().signal;

function row(overrides: Record<string, unknown> = {}) {
  return { request_id: first, state: 'no_match', open_invites: 0, earliest_expiry: null, rounds: 1, can_retry: true, can_cancel: true, ...overrides };
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
    { requestId: first, state: 'searching', openInvites: 2, earliestExpiry: '2026-11-12T10:30:00.000Z', rounds: 1, canRetry: false, canCancel: true },
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
  ['a row that is not an object', null],
])('%s is rejected', async (_name, bad) => {
  respond([bad]);
  await expect(readDispatchSummaries('customer-a', [first], signal)).rejects.toThrow('Invalid dispatch response');
});

test('a response that is not a list is rejected', async () => {
  respond({ rows: [] });
  await expect(readDispatchSummaries('customer-a', [first], signal)).rejects.toThrow('Invalid dispatch response');
});

test('a retry sends the request and returns how many workers were invited', async () => {
  respond(2);
  await expect(redispatchRequest('customer-a', first, signal)).resolves.toBe(2);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/redispatch_service_request',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_request_id: first }) }),
  );
});

test('a retry that returns anything but a count is rejected', async () => {
  respond('2');
  await expect(redispatchRequest('customer-a', first, signal)).rejects.toThrow('Invalid retry response');
});

test('a refused retry becomes a classified workflow failure', async () => {
  respond({ code: '22023', message: 'dispatch unavailable' }, false, 400);
  await expect(redispatchRequest('customer-a', first, signal)).rejects.toMatchObject({ failure: 'rejected' });
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
