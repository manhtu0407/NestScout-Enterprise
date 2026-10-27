import { failureMessage, isDefinitiveFailure, WorkflowError, workflowErrorFrom } from './workflow-error';

const response = (status: number, body: unknown) => ({ status, json: async () => body }) as Response;

test('database refusals map to bounded user messages without echoing server text', async () => {
  const forbidden = await workflowErrorFrom(response(403, { code: '42501', message: 'job unavailable' }));
  const stale = await workflowErrorFrom(response(400, { code: '40001', message: 'stale job' }));
  const rejected = await workflowErrorFrom(response(400, { code: '22023', message: 'invalid transition' }));
  expect([forbidden.failure, stale.failure, rejected.failure]).toEqual(['forbidden', 'stale', 'rejected']);
  expect(failureMessage(forbidden, 'uncertain')).toBe('This action is not available for your account or this item.');
  expect(failureMessage(stale, 'uncertain')).toMatch(/changed after it was loaded/);
  expect(failureMessage(rejected, 'uncertain')).toMatch(/no longer available/);
  expect(failureMessage(stale, 'uncertain')).not.toMatch(/stale job/);
});

test('server faults, unknown codes and unreadable bodies stay uncertain', async () => {
  const unavailable = await workflowErrorFrom(response(503, { code: '42501' }));
  const unknown = await workflowErrorFrom(response(400, { code: 'XX000' }));
  const unreadable = await workflowErrorFrom({ status: 400, json: async () => { throw new Error('not json'); } } as unknown as Response);
  for (const error of [unavailable, unknown, unreadable]) {
    expect(error.failure).toBe('unknown');
    expect(isDefinitiveFailure(error)).toBe(false);
    expect(failureMessage(error, 'uncertain')).toBe('uncertain');
  }
});

test('network and unexpected errors are never reported as definitive', () => {
  expect(isDefinitiveFailure(new Error('offline'))).toBe(false);
  expect(failureMessage(new Error('offline'), 'uncertain')).toBe('uncertain');
  expect(isDefinitiveFailure(new WorkflowError('stale'))).toBe(true);
});
