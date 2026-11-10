import { authenticatedRequest } from '@/lib/authenticated-rest';

import { readWorkerEarnings } from './worker-earnings-repository';
import { WorkflowError } from './workflow-error';

jest.mock('@/lib/authenticated-rest', () => ({ authenticatedRequest: jest.fn() }));

const signal = new AbortController().signal;
const respond = (body: unknown, ok = true, status = 200) => jest.mocked(authenticatedRequest).mockResolvedValue({ ok, status, json: async () => body } as Response);

const row = { job_id: 'j1', title: 'Sửa vòi', amount_minor: 450000, currency: 'VND', accepted_at: '2026-11-02T17:30:00Z', completed_on: '2026-11-03' };

beforeEach(() => jest.clearAllMocks());

test('earnings are read from the worker projection', async () => {
  respond([row]);
  await expect(readWorkerEarnings('u1', signal)).resolves.toEqual([row]);
  expect(authenticatedRequest).toHaveBeenCalledWith('u1', 'rpc/worker_earnings', { method: 'POST', signal, body: '{}' });
});

test('an empty history reads as an empty list', async () => {
  respond([]);
  await expect(readWorkerEarnings('u1', signal)).resolves.toEqual([]);
});

test.each([
  [{ nope: true }],
  [[{ ...row, amount_minor: '450000' }]],
  [[{ ...row, amount_minor: 1.5 }]],
  [[{ ...row, completed_on: '03/11/2026' }]],
  [[{ ...row, title: 1 }]],
  [[null]],
])('a malformed response %j is refused', async body => {
  respond(body);
  await expect(readWorkerEarnings('u1', signal)).rejects.toThrow('Invalid worker earnings response');
});

test('a refused call surfaces a workflow error', async () => {
  respond({ message: 'Worker is not eligible' }, false, 403);
  await expect(readWorkerEarnings('u1', signal)).rejects.toBeInstanceOf(WorkflowError);
});
