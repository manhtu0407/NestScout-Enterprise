import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges, WorkflowError } from '@/features/shared';

import { advanceJob, pauseJob, readJobs, readOffers, readWorkerCorrections, readWorkerPauses, readWorkerSnapshot, requestResume, type Job } from './worker-repository';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared/workflow-error'),
  readJobReports: jest.fn(),
  readScopeChanges: jest.fn(),
}));

const job = { job_id: '50000000-0000-4000-8000-000000000001', stage: 'working', version: 3, scope: 'Fixture', amount_minor: 100, currency: 'VND' };
const otherJobId = '50000000-0000-4000-8000-000000000002';
const jobs: Job[] = [{ ...job, stage: 'working', currency: 'VND' }, { ...job, job_id: otherJobId, stage: 'working', currency: 'VND' }];
const fixtureOffer = { invitation_id: 'invite', quote_id: 'quote', quote_version: 1, scope: 'Fixture', amount_minor: 100, currency: 'VND', expires_at: '2027-01-01', basis: 'local_fixture' };

const answer = (body: unknown) => jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => body } as Response);

const requestedPath = () => String(jest.mocked(authenticatedRequest).mock.calls[0]?.[1]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readJobReports).mockResolvedValue([]);
  jest.mocked(readScopeChanges).mockResolvedValue([]);
});

test('revocation while projections load discards the previous Worker job', async () => {
  let jobsRead = 0;
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => {
    const value = path === 'rpc/worker_jobs' && jobsRead++ === 0 ? [job] : [];
    return { ok: true, json: async () => value } as Response;
  });
  await expect(readWorkerSnapshot('worker-a', new AbortController().signal)).rejects.toThrow('Worker activity changed during refresh');
});

test('matching scoped projections are returned', async () => {
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => ({
    ok: true, json: async () => path === 'rpc/worker_jobs' ? [job] : [],
  } as Response));
  const result = await readWorkerSnapshot('worker-a', new AbortController().signal);
  expect(result.jobs).toEqual([job]);
  expect(result.corrections).toEqual([]);
});

test('the snapshot carries the Customer correction request for the job', async () => {
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => ({
    ok: true,
    json: async () => path === 'rpc/worker_jobs' ? [job]
      : path === 'rpc/worker_corrections' ? [{ job_id: job.job_id, submitted_from_version: 1, note: 'Reseal the joint' }] : [],
  } as Response));
  const result = await readWorkerSnapshot('worker-a', new AbortController().signal);
  expect(result.corrections).toEqual([{ job_id: job.job_id, note: 'Reseal the joint' }]);
});

test('a changed offer source while projections load discards the snapshot', async () => {
  let offersRead = 0;
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => {
    const value = path === 'rpc/worker_offers' ? [{ ...fixtureOffer, basis: offersRead++ === 0 ? 'local_fixture' : 'matching_engine' }] : [];
    return { ok: true, json: async () => value } as Response;
  });
  await expect(readWorkerSnapshot('worker-a', new AbortController().signal)).rejects.toThrow('Worker activity changed during refresh');
});

test('an offer without a recognizable source field is rejected as invalid', async () => {
  const offer = { invitation_id: 'invite', quote_id: 'quote', quote_version: 1, scope: 'Fixture', amount_minor: 100, currency: 'VND', expires_at: '2027-01-01' };
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => [offer] } as Response);
  await expect(readOffers('worker-a', new AbortController().signal)).rejects.toThrow('Invalid offers');
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => [{ ...offer, basis: 'local_fixture' }] } as Response);
  await expect(readOffers('worker-a', new AbortController().signal)).resolves.toHaveLength(1);
});

const correctionRow = (overrides: Record<string, unknown> = {}) => ({ job_id: job.job_id, submitted_from_version: 1, note: 'Reseal the joint', ...overrides });

test('corrections are requested from the server projection without any job identifier', async () => {
  answer([]);
  await readWorkerCorrections('worker-a', jobs, new AbortController().signal);
  expect(requestedPath()).toBe('rpc/worker_corrections');
  expect(String(jest.mocked(authenticatedRequest).mock.calls[0]?.[2]?.body)).toBe('{}');
});

test('the request does not grow with the number of jobs', async () => {
  const many: Job[] = Array.from({ length: 1500 }, (_, index) => ({ ...job, stage: 'working', currency: 'VND', job_id: `50000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
  answer([]);
  await readWorkerCorrections('worker-a', many, new AbortController().signal);
  expect(requestedPath()).toBe('rpc/worker_corrections');
});

test('no request is made when the Worker has no jobs', async () => {
  await expect(readWorkerCorrections('worker-a', [], new AbortController().signal)).resolves.toEqual([]);
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('each returned correction is mapped to its job without the internal version', async () => {
  answer([correctionRow(), correctionRow({ job_id: otherJobId, note: 'Wipe the area' })]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).resolves.toEqual([
    { job_id: job.job_id, note: 'Reseal the joint' }, { job_id: otherJobId, note: 'Wipe the area' },
  ]);
});

test('an empty answer from the server is a verified empty list', async () => {
  answer([]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).resolves.toEqual([]);
});

test.each([
  ['a row that is not an object', 'row'],
  ['a correction without text', correctionRow({ note: null })],
  ['a correction with blank text', correctionRow({ note: '  ' })],
  ['a job that is not in the Worker snapshot', correctionRow({ job_id: '50000000-0000-4000-8000-0000000000ff' })],
  ['a missing job identifier', correctionRow({ job_id: undefined })],
  ['a missing version', correctionRow({ submitted_from_version: undefined })],
  ['a version that is not an integer', correctionRow({ submitted_from_version: 1.5 })],
  ['a version below one', correctionRow({ submitted_from_version: 0 })],
  ['a version the job has not reached', correctionRow({ submitted_from_version: job.version })],
  ['a version sent as text', correctionRow({ submitted_from_version: '1' })],
])('%s is rejected as invalid', async (_label, bad) => {
  answer([bad]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Invalid corrections');
});

test('two rows for one job are rejected rather than choosing between them', async () => {
  answer([correctionRow(), correctionRow({ submitted_from_version: 2, note: 'Another note' })]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Invalid corrections');
});

test('a body that is not a list is rejected', async () => {
  answer({ not: 'a list' });
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Invalid corrections');
});

test.each([
  ['an expired session', 401, { code: 'PGRST301' }],
  ['a refused access', 403, { code: '42501' }],
  ['a throttled client', 429, {}],
  ['a server failure', 500, { code: 'XX000' }],
])('%s is reported instead of showing no correction', async (_label, status, body) => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: false, status, json: async () => body } as Response);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toBeInstanceOf(WorkflowError);
});

test('a response that cannot be read is reported', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('Unexpected token'); } } as unknown as Response);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Unexpected token');
});

test('a timeout and an abort are reported', async () => {
  jest.mocked(authenticatedRequest).mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('timed out');
  jest.mocked(authenticatedRequest).mockRejectedValue(new DOMException('Aborted', 'AbortError'));
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Aborted');
});

test('a snapshot fails as a whole when the corrections cannot be verified', async () => {
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => {
    if (path === 'rpc/worker_corrections') return { ok: false, status: 500, json: async () => ({}) } as Response;
    return { ok: true, json: async () => path === 'rpc/worker_jobs' ? [job] : [] } as Response;
  });
  await expect(readWorkerSnapshot('worker-a', new AbortController().signal)).rejects.toBeInstanceOf(WorkflowError);
});

test.each([
  ['offers', (signal: AbortSignal) => readOffers('worker-a', signal), fixtureOffer],
  ['jobs', (signal: AbortSignal) => readJobs('worker-a', signal), job],
])('a full page of %s is refused as possibly truncated', async (_label, read, row) => {
  answer(Array.from({ length: 999 }, () => row));
  await expect(read(new AbortController().signal)).resolves.toHaveLength(999);
  answer(Array.from({ length: 1000 }, () => row));
  await expect(read(new AbortController().signal)).rejects.toThrow('Result may be truncated');
});

test('a full page of corrections is refused as possibly truncated', async () => {
  answer(Array.from({ length: 1000 }, () => correctionRow()));
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Result may be truncated');
});

const pausedJob: Job = { ...job, stage: 'paused', currency: 'VND', version: 5 };
const pauseRow = (overrides: Record<string, unknown> = {}) => ({
  job_id: job.job_id, category: 'ordinary_interruption', prior_stage: 'working', paused_from_version: 4, resume_requested: false, created_at: '2026-10-28T10:00:00Z', ...overrides,
});

test('open pauses are requested without any job identifier and mapped', async () => {
  answer([pauseRow({ resume_requested: true })]);
  await expect(readWorkerPauses('worker-a', [pausedJob], new AbortController().signal)).resolves.toEqual([
    { job_id: job.job_id, category: 'ordinary_interruption', prior_stage: 'working', paused_from_version: 4, resume_requested: true },
  ]);
  expect(requestedPath()).toBe('rpc/worker_pauses');
});

test('no pause request is made when the Worker has no jobs', async () => {
  await expect(readWorkerPauses('worker-a', [], new AbortController().signal)).resolves.toEqual([]);
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('a job that is not paused needs no pause row', async () => {
  answer([]);
  await expect(readWorkerPauses('worker-a', jobs, new AbortController().signal)).resolves.toEqual([]);
});

test.each([
  ['a row that is not an object', 'row'],
  ['an unknown category', pauseRow({ category: 'holiday' })],
  ['an unknown prior stage', pauseRow({ prior_stage: 'submitted' })],
  ['a missing prior stage', pauseRow({ prior_stage: undefined })],
  ['a version the job has not passed', pauseRow({ paused_from_version: 5 })],
  ['a version below one', pauseRow({ paused_from_version: 0 })],
  ['a version sent as text', pauseRow({ paused_from_version: '4' })],
  ['a request flag that is not a boolean', pauseRow({ resume_requested: 'yes' })],
  ['a safety stop that claims a resume request', pauseRow({ category: 'safety_concern', resume_requested: true })],
  ['a job that is not in the snapshot', pauseRow({ job_id: '50000000-0000-4000-8000-0000000000ff' })],
  ['a job that is not paused', pauseRow({ job_id: otherJobId })],
])('%s is rejected as invalid', async (_label, bad) => {
  answer([bad]);
  await expect(readWorkerPauses('worker-a', [pausedJob, { ...job, job_id: otherJobId, stage: 'working', currency: 'VND' }], new AbortController().signal)).rejects.toThrow('Invalid pauses');
});

test('two rows for one job are rejected', async () => {
  answer([pauseRow(), pauseRow()]);
  await expect(readWorkerPauses('worker-a', [pausedJob], new AbortController().signal)).rejects.toThrow('Invalid pauses');
});

test('a paused job without a pause row is rejected rather than guessed', async () => {
  answer([]);
  await expect(readWorkerPauses('worker-a', [pausedJob], new AbortController().signal)).rejects.toThrow('Invalid pauses');
});

test('a body that is not a list and a full page are rejected', async () => {
  answer({ not: 'a list' });
  await expect(readWorkerPauses('worker-a', [pausedJob], new AbortController().signal)).rejects.toThrow('Invalid pauses');
  answer(Array.from({ length: 1000 }, () => pauseRow()));
  await expect(readWorkerPauses('worker-a', [pausedJob], new AbortController().signal)).rejects.toThrow('Result may be truncated');
});

test('a refused pause read is reported', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: '42501' }) } as Response);
  await expect(readWorkerPauses('worker-a', [pausedJob], new AbortController().signal)).rejects.toBeInstanceOf(WorkflowError);
});

test('the snapshot carries the open pauses', async () => {
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => ({
    ok: true, json: async () => path === 'rpc/worker_jobs' ? [{ ...pausedJob }] : path === 'rpc/worker_pauses' ? [pauseRow()] : [],
  } as Response));
  const result = await readWorkerSnapshot('worker-a', new AbortController().signal);
  expect(result.pauses).toEqual([{ job_id: job.job_id, category: 'ordinary_interruption', prior_stage: 'working', paused_from_version: 4, resume_requested: false }]);
});

test('the pause, resume and advance commands send the exact job version', async () => {
  answer(6);
  await pauseJob('worker-a', pausedJob, 'safety_concern', new AbortController().signal);
  expect(requestedPath()).toBe('rpc/pause_service_job');
  expect(JSON.parse(String(jest.mocked(authenticatedRequest).mock.calls[0]?.[2]?.body))).toEqual({ p_job_id: job.job_id, p_version: 5, p_category: 'safety_concern' });
  jest.clearAllMocks();
  answer(6);
  await requestResume('worker-a', pausedJob, new AbortController().signal);
  expect(requestedPath()).toBe('rpc/request_service_resume');
  expect(JSON.parse(String(jest.mocked(authenticatedRequest).mock.calls[0]?.[2]?.body))).toEqual({ p_job_id: job.job_id, p_version: 5 });
  jest.clearAllMocks();
  answer(6);
  await advanceJob('worker-a', pausedJob, 'working', new AbortController().signal);
  expect(JSON.parse(String(jest.mocked(authenticatedRequest).mock.calls[0]?.[2]?.body))).toEqual({ p_job_id: job.job_id, p_version: 5, p_next: 'working' });
});

test.each([
  ['a pause', (signal: AbortSignal) => pauseJob('worker-a', pausedJob, 'ordinary_interruption', signal), 'Invalid pause result'],
  ['a resume request', (signal: AbortSignal) => requestResume('worker-a', pausedJob, signal), 'Invalid resume result'],
])('%s with an unexpected version is rejected', async (_label, command, message) => {
  answer(9);
  await expect(command(new AbortController().signal)).rejects.toThrow(message);
});

test('a refused pause command keeps its classification', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: '40001', message: 'stale job' }) } as Response);
  await expect(pauseJob('worker-a', pausedJob, 'safety_concern', new AbortController().signal)).rejects.toMatchObject({ failure: 'stale' });
});
