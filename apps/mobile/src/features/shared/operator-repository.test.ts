import { readOperatorCases, resolveOperatorCase, reviewOperatorCase } from './operator-repository';
import { WorkflowError } from './workflow-error';

const mockGetSession = jest.fn();
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: () => ({ auth: { getSession: mockGetSession } }) }));
jest.mock('@/lib/config', () => ({
  loadConfig: () => ({ supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'public-key' }),
}));

const id = '11111111-1111-4111-8111-111111111111';
const key = '33333333-3333-4333-8333-333333333333';
const request = '22222222-2222-4222-8222-222222222222';
const job = '44444444-4444-4444-8444-444444444444';
const signal = new AbortController().signal;

function row(overrides: Record<string, unknown> = {}) {
  return {
    escalation_id: id, request_id: request, job_id: job, status: 'open', kind: 'no_progress_after_arrival',
    note: null, created_at: '2026-11-13T09:00:00.000Z', reviewed_at: null, description: 'Chập điện phòng khách', location: 'Quận 7', worker_name: 'Thợ một', job_stage: 'arrived', ...overrides,
  };
}

function respond(body: unknown, ok = true, status = 200) {
  jest.mocked(global.fetch).mockResolvedValueOnce({ ok, status, json: async () => body } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'operator-a' }, access_token: 'token-a' } }, error: null });
  global.fetch = jest.fn();
});

test('the queue is read through the operator function and mapped', async () => {
  respond([row(), row({ escalation_id: key, status: 'reviewing', reviewed_at: '2026-11-13T09:05:00.000Z', note: 'Chưa thấy làm', worker_name: null, job_stage: null })]);
  await expect(readOperatorCases('operator-a', signal)).resolves.toEqual([
    { escalationId: id, requestId: request, jobId: job, status: 'open', note: null, createdAt: '2026-11-13T09:00:00.000Z', reviewedAt: null, description: 'Chập điện phòng khách', location: 'Quận 7', workerName: 'Thợ một', jobStage: 'arrived' },
    { escalationId: key, requestId: request, jobId: job, status: 'reviewing', note: 'Chưa thấy làm', createdAt: '2026-11-13T09:00:00.000Z', reviewedAt: '2026-11-13T09:05:00.000Z', description: 'Chập điện phòng khách', location: 'Quận 7', workerName: null, jobStage: null },
  ]);
  expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:54321/rest/v1/rpc/operator_escalation_queue', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer token-a' }) }));
});

test('an account that is not an operator is refused rather than shown an empty queue', async () => {
  respond({ code: '42501', message: 'operator unavailable' }, false, 403);
  await expect(readOperatorCases('operator-a', signal)).rejects.toBeInstanceOf(WorkflowError);
  respond({ code: '42501', message: 'operator unavailable' }, false, 403);
  await expect(readOperatorCases('operator-a', signal)).rejects.toMatchObject({ failure: 'forbidden' });
});

test.each([
  ['a status outside the contract', row({ status: 'resolved' })],
  ['a missing identifier', row({ escalation_id: 3 })],
  ['a creation time that is not a date', row({ created_at: 'soon' })],
  ['an unknown job stage', row({ job_stage: 'teleporting' })],
  ['a note that is not text', row({ note: 4 })],
  ['a row that is not an object', null],
])('%s is rejected', async (_name, bad) => {
  respond([bad]);
  await expect(readOperatorCases('operator-a', signal)).rejects.toThrow('Invalid operator response');
});

test('a response that is not a list is rejected', async () => {
  respond({ rows: [] });
  await expect(readOperatorCases('operator-a', signal)).rejects.toThrow('Invalid operator response');
});

test('a review sends the case and its idempotency key and accepts only review outcomes', async () => {
  respond({ outcome: 'reviewing' });
  await expect(reviewOperatorCase('operator-a', id, key, signal)).resolves.toBeUndefined();
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/review_service_escalation',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ p_escalation_id: id, p_key: key }) }),
  );
  respond({ outcome: 'already_reviewing' });
  await expect(reviewOperatorCase('operator-a', id, key, signal)).resolves.toBeUndefined();
  respond({ outcome: 'something_else' });
  await expect(reviewOperatorCase('operator-a', id, key, signal)).rejects.toThrow('Invalid review response');
  respond(null);
  await expect(reviewOperatorCase('operator-a', id, key, signal)).rejects.toThrow('Invalid review response');
});

test('a resolution sends the decision, a trimmed note and its key', async () => {
  respond({ outcome: 'resolved', resolution: 'proceed' });
  await expect(resolveOperatorCase('operator-a', id, 'proceed', '  Thợ sẽ bắt đầu ngay  ', key, signal)).resolves.toBeUndefined();
  expect(global.fetch).toHaveBeenCalledWith(
    'http://127.0.0.1:54321/rest/v1/rpc/resolve_service_escalation',
    expect.objectContaining({ body: JSON.stringify({ p_escalation_id: id, p_resolution: 'proceed', p_note: 'Thợ sẽ bắt đầu ngay', p_key: key }) }),
  );
  respond({ outcome: 'already_resolved' });
  await expect(resolveOperatorCase('operator-a', id, 'dismiss', '   ', key, signal)).resolves.toBeUndefined();
  expect(jest.mocked(global.fetch).mock.calls[1]?.[1]).toMatchObject({ body: JSON.stringify({ p_escalation_id: id, p_resolution: 'dismiss', p_note: null, p_key: key }) });
});

test('an oversized note never leaves the device and an unknown outcome is an error', async () => {
  await expect(resolveOperatorCase('operator-a', id, 'dismiss', 'x'.repeat(501), key, signal)).rejects.toThrow('Invalid resolution note');
  expect(global.fetch).not.toHaveBeenCalled();
  respond({ outcome: 'reviewing' });
  await expect(resolveOperatorCase('operator-a', id, 'dismiss', '', key, signal)).rejects.toThrow('Invalid resolution response');
});

test('a replacement that the server refuses because the worker already started is a definitive rejection', async () => {
  respond({ code: '22023', message: 'release not allowed at this stage' }, false, 400);
  await expect(resolveOperatorCase('operator-a', id, 'replace_worker', '', key, signal)).rejects.toMatchObject({ failure: 'rejected' });
});
