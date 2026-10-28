import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges, WorkflowError } from '@/features/shared';

import { consentResume, readCustomerActivity } from './customer-activity-repository';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('@/features/shared', () => ({
  ...jest.requireActual('@/features/shared/workflow-error'),
  readJobReports: jest.fn(),
  readScopeChanges: jest.fn(),
}));

const requestId = '10000000-0000-4000-8000-000000000001';
const jobId = '50000000-0000-4000-8000-000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readJobReports).mockResolvedValue([]);
  jest.mocked(readScopeChanges).mockResolvedValue([]);
});

test('a job changing while its related projections load is not published as one snapshot', async () => {
  let reads = 0;
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => {
    const data = path.startsWith('service_jobs?')
      ? [{ id: jobId, request_id: requestId, stage: 'working', version: ++reads }]
      : [];
    return { ok: true, json: async () => data } as Response;
  });
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal))
    .rejects.toThrow('Activity changed during refresh');
});

test('matching job versions permit the scoped projections to be returned', async () => {
  jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => {
    const data = path.startsWith('service_jobs?')
      ? [{ id: jobId, request_id: requestId, stage: 'working', version: 2 }]
      : [];
    return { ok: true, json: async () => data } as Response;
  });
  const result = await readCustomerActivity('customer-a', [requestId], new AbortController().signal);
  expect(result.jobs).toEqual([{ id: jobId, request_id: requestId, stage: 'working', version: 2 }]);
});

const pausedJob = { id: jobId, request_id: requestId, stage: 'paused', version: 5 };
const pauseRow = (overrides: Record<string, unknown> = {}) => ({
  job_id: jobId, category: 'ordinary_interruption', prior_stage: 'working', paused_from_version: 4, resume_requested: false, created_at: '2026-10-28T10:00:00Z', ...overrides,
});

const activityWith = (jobs: unknown[], pauses: unknown, pauseStatus = 200) => jest.mocked(authenticatedRequest).mockImplementation(async (_user, path) => {
  if (path === 'rpc/open_job_pauses') return { ok: pauseStatus === 200, status: pauseStatus, json: async () => pauses } as Response;
  return { ok: true, json: async () => path.startsWith('service_jobs?') ? jobs : [] } as Response;
});

test('open pauses are read for the paused jobs of the Customer', async () => {
  activityWith([pausedJob], [pauseRow({ resume_requested: true })]);
  const result = await readCustomerActivity('customer-a', [requestId], new AbortController().signal);
  expect(result.pauses).toEqual([{ job_id: jobId, category: 'ordinary_interruption', resume_requested: true }]);
  const call = jest.mocked(authenticatedRequest).mock.calls.find(([, path]) => path === 'rpc/open_job_pauses');
  expect(call?.[2]?.method).toBe('POST');
});

test('no pause request is made when the Customer has no job', async () => {
  activityWith([], []);
  const result = await readCustomerActivity('customer-a', [requestId], new AbortController().signal);
  expect(result.pauses).toEqual([]);
  expect(jest.mocked(authenticatedRequest).mock.calls.some(([, path]) => path === 'rpc/open_job_pauses')).toBe(false);
});

test.each([
  ['a row that is not an object', 'row'],
  ['an unknown category', pauseRow({ category: 'holiday' })],
  ['a request flag that is not a boolean', pauseRow({ resume_requested: 1 })],
  ['a safety stop that claims a resume request', pauseRow({ category: 'safety_concern', resume_requested: true })],
  ['a job that is not in the activity', pauseRow({ job_id: '50000000-0000-4000-8000-0000000000ff' })],
])('%s is rejected as invalid', async (_label, bad) => {
  activityWith([pausedJob], [bad]);
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toThrow('Invalid pauses');
});

test('a pause for a job that is not paused is rejected', async () => {
  activityWith([{ ...pausedJob, stage: 'working' }], [pauseRow()]);
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toThrow('Invalid pauses');
});

test('a paused job without a pause row and duplicate rows are rejected', async () => {
  activityWith([pausedJob], []);
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toThrow('Invalid pauses');
  activityWith([pausedJob], [pauseRow(), pauseRow()]);
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toThrow('Invalid pauses');
});

test('a body that is not a list, a full page and a refused read are reported', async () => {
  activityWith([pausedJob], { not: 'a list' });
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toThrow('Invalid pauses');
  activityWith([pausedJob], Array.from({ length: 1000 }, () => pauseRow()));
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toThrow('Result may be truncated');
  activityWith([pausedJob], { code: '42501' }, 403);
  await expect(readCustomerActivity('customer-a', [requestId], new AbortController().signal)).rejects.toBeInstanceOf(WorkflowError);
});

test('consent sends the exact job and version and expects the next version', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => 6 } as Response);
  await consentResume('customer-a', pausedJob, new AbortController().signal);
  const [, path, init] = jest.mocked(authenticatedRequest).mock.calls[0] ?? [];
  expect(path).toBe('rpc/consent_service_resume');
  expect(JSON.parse(String(init?.body))).toEqual({ p_job_id: jobId, p_version: 5 });
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => 9 } as Response);
  await expect(consentResume('customer-a', pausedJob, new AbortController().signal)).rejects.toThrow('Invalid result');
});

test('refused consent keeps its classification', async () => {
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: '40001', message: 'stale job' }) } as Response);
  await expect(consentResume('customer-a', pausedJob, new AbortController().signal)).rejects.toMatchObject({ failure: 'stale' });
});
