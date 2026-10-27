import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges } from '@/features/shared';

import { readCustomerActivity } from './customer-activity-repository';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('@/features/shared', () => ({ readJobReports: jest.fn(), readScopeChanges: jest.fn() }));

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
