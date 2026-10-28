import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges } from '@/features/shared';

import { readOffers, readWorkerSnapshot } from './worker-repository';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));
jest.mock('@/features/shared', () => ({ readJobReports: jest.fn(), readScopeChanges: jest.fn() }));

const job = { job_id: '50000000-0000-4000-8000-000000000001', stage: 'working', version: 3, scope: 'Fixture', amount_minor: 100, currency: 'VND' };

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
});

test('an offer without a recognizable source field is rejected as invalid', async () => {
  const offer = { invitation_id: 'invite', quote_id: 'quote', quote_version: 1, scope: 'Fixture', amount_minor: 100, currency: 'VND', expires_at: '2027-01-01' };
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => [offer] } as Response);
  await expect(readOffers('worker-a', new AbortController().signal)).rejects.toThrow('Invalid offers');
  jest.mocked(authenticatedRequest).mockResolvedValue({ ok: true, json: async () => [{ ...offer, basis: 'local_fixture' }] } as Response);
  await expect(readOffers('worker-a', new AbortController().signal)).resolves.toHaveLength(1);
});
