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

test.each([
  ['an expired agreement', '22023', 'quote expired', 'expired', /agreement has expired/],
  ['an unavailable offer', '22023', 'invitation unavailable', 'unavailable', /offer is no longer available/],
  ['an unavailable agreement', '22023', 'agreement unavailable', 'unavailable', /offer is no longer available/],
  ['an offer already taken', '40001', 'already assigned', 'unavailable', /offer is no longer available/],
  ['an invalid request', '22023', 'invalid request', 'invalid', /details were not accepted/],
  ['invalid evidence', '22023', 'invalid evidence', 'invalid', /details were not accepted/],
  ['an invalid proposal', '22023', 'invalid proposal', 'invalid', /details were not accepted/],
  ['an invalid report', '22023', 'invalid report', 'invalid', /details were not accepted/],
  ['an invalid reason', '22023', 'invalid reason', 'invalid', /details were not accepted/],
  ['an invalid decision', '22023', 'invalid decision', 'invalid', /details were not accepted/],
  ['an invalid pause', '22023', 'invalid pause', 'invalid', /details were not accepted/],
  ['a stale job', '40001', 'stale job', 'stale', /changed after it was loaded/],
  ['a stale quote', '40001', 'stale quote', 'stale', /changed after it was loaded/],
  ['stale terms', '40001', 'stale terms', 'stale', /changed after it was loaded/],
  ['a state that moved on', '22023', 'invalid transition', 'rejected', /no longer available/],
  ['a pending scope decision', '22023', 'scope decision pending', 'rejected', /no longer available/],
  ['a dispute hold', '22023', 'dispute hold', 'rejected', /no longer available/],
  ['a reused key', '22023', 'submission key conflict', 'rejected', /no longer available/],
  ['an unrecognized message on a rejected step', '22023', 'something new', 'rejected', /no longer available/],
  ['a message named like an object property', '22023', 'constructor', 'rejected', /no longer available/],
  ['a missing resource', '42501', 'job unavailable', 'forbidden', /not available for your account/],
])('%s is classified as %s without echoing the server text', async (_label, code, message, failure, text) => {
  const error = await workflowErrorFrom(response(400, { code, message }));
  expect(error.failure).toBe(failure);
  expect(isDefinitiveFailure(error)).toBe(true);
  expect(failureMessage(error, 'uncertain')).toMatch(text);
  expect(failureMessage(error, 'uncertain')).not.toContain(message);
  expect(error.message).not.toContain(message);
});

test('a domain message under a different error class does not change the class', async () => {
  const forbidden = await workflowErrorFrom(response(403, { code: '42501', message: 'quote expired' }));
  const unknown = await workflowErrorFrom(response(400, { code: 'XX000', message: 'quote expired' }));
  expect(forbidden.failure).toBe('forbidden');
  expect(unknown.failure).toBe('unknown');
});

test('a body without a message keeps the class of its code', async () => {
  expect((await workflowErrorFrom(response(400, { code: '22023' }))).failure).toBe('rejected');
  expect((await workflowErrorFrom(response(400, { code: '22023', message: 42 }))).failure).toBe('rejected');
  expect((await workflowErrorFrom(response(400, null))).failure).toBe('unknown');
});
