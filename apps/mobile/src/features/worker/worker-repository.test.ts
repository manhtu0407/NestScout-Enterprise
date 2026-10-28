import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges } from '@/features/shared';

import { readOffers, readWorkerCorrections, readWorkerSnapshot, type Job } from './worker-repository';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('@/features/shared', () => ({ readJobReports: jest.fn(), readScopeChanges: jest.fn() }));

const job = { job_id: '50000000-0000-4000-8000-000000000001', stage: 'working', version: 3, scope: 'Fixture', amount_minor: 100, currency: 'VND' };
const otherJobId = '50000000-0000-4000-8000-000000000002';
const jobs: Job[] = [{ ...job, stage: 'working', currency: 'VND' }, { ...job, job_id: otherJobId, stage: 'working', currency: 'VND' }];
const fixtureOffer = { invitation_id: 'invite', quote_id: 'quote', quote_version: 1, scope: 'Fixture', amount_minor: 100, currency: 'VND', expires_at: '2027-01-01', basis: 'local_fixture' };

const submission = (overrides: Record<string, unknown> = {}) => ({
  id: 'submission', job_id: job.job_id, decision: 'pending', correction_note: null, created_at: '2026-10-28T10:00:00+00:00', ...overrides,
});

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
      : path.startsWith('service_submissions') ? [submission({ decision: 'revision_requested', correction_note: 'Reseal the joint' })] : [],
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

test('corrections are requested through the granted columns and the Worker jobs only', async () => {
  answer([]);
  await readWorkerCorrections('worker-a', jobs, new AbortController().signal);
  expect(requestedPath()).toContain('service_submissions?select=id,job_id,decision,correction_note,created_at');
  expect(requestedPath()).toContain(`job_id=in.(${job.job_id},${otherJobId})`);
  expect(requestedPath()).not.toMatch(/decision_reason|decided_by|submitted_by|evidence/);
});

test('no request is made when the Worker has no jobs', async () => {
  await expect(readWorkerCorrections('worker-a', [], new AbortController().signal)).resolves.toEqual([]);
  expect(authenticatedRequest).not.toHaveBeenCalled();
});

test('only the latest submission of a job can carry an outstanding correction', async () => {
  answer([
    submission({ id: 'a1', decision: 'revision_requested', correction_note: 'Reseal the joint', created_at: '2026-10-28T09:00:00+00:00' }),
    submission({ id: 'a2', created_at: '2026-10-28T10:00:00+00:00' }),
    submission({ id: 'b1', job_id: otherJobId, decision: 'revision_requested', correction_note: 'Wipe the area', created_at: '2026-10-28T09:30:00+00:00' }),
  ]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).resolves.toEqual([{ job_id: otherJobId, note: 'Wipe the area' }]);
});

test('an older correction is ignored whatever order the rows arrive in', async () => {
  answer([
    submission({ id: 'a2', created_at: '2026-10-28T10:00:00+00:00' }),
    submission({ id: 'a1', decision: 'revision_requested', correction_note: 'Reseal the joint', created_at: '2026-10-28T09:00:00+00:00' }),
  ]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).resolves.toEqual([]);
});

test('a dispute and an acceptance carry no correction text', async () => {
  answer([submission({ id: 'a', decision: 'disputed' }), submission({ id: 'b', job_id: otherJobId, decision: 'accepted' })]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).resolves.toEqual([]);
});

test.each([
  ['a correction without text', submission({ decision: 'revision_requested' })],
  ['a correction with blank text', submission({ decision: 'revision_requested', correction_note: '  ' })],
  ['text on a decision that is not a correction', submission({ decision: 'accepted', correction_note: 'Leak' })],
  ['an unknown decision', submission({ decision: 'cancelled' })],
  ['a submission for a job that was not requested', submission({ job_id: '50000000-0000-4000-8000-0000000000ff' })],
  ['an unreadable timestamp', submission({ created_at: 'later' })],
  ['a row that is not an object', 'row'],
])('%s is rejected as invalid', async (_label, bad) => {
  answer([bad]);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Invalid submissions');
});

test('a refused or malformed read is reported instead of showing no correction', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: false } as Response);
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Submissions unavailable');
  answer({ not: 'a list' });
  await expect(readWorkerCorrections('worker-a', jobs, new AbortController().signal)).rejects.toThrow('Invalid submissions');
});

test('a job identifier that could alter the filter is refused before any request', async () => {
  const hostile: Job[] = [{ ...job, stage: 'working', currency: 'VND', job_id: `${job.job_id}),or=(id.neq.x` }];
  await expect(readWorkerCorrections('worker-a', hostile, new AbortController().signal)).rejects.toThrow('Invalid job identifier');
  expect(authenticatedRequest).not.toHaveBeenCalled();
});
