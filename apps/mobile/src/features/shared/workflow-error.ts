export type WorkflowFailure = 'forbidden' | 'stale' | 'expired' | 'unavailable' | 'invalid' | 'rejected' | 'unknown';

export class WorkflowError extends Error {
  constructor(readonly failure: WorkflowFailure) {
    super(`Workflow operation ${failure}`);
  }
}

const byDomainMessage: Record<string, WorkflowFailure> = {
  'quote expired': 'expired',
  'invitation unavailable': 'unavailable',
  'agreement unavailable': 'unavailable',
  'already assigned': 'unavailable',
  'invalid request': 'invalid',
  'invalid evidence': 'invalid',
  'invalid proposal': 'invalid',
  'invalid report': 'invalid',
  'invalid reason': 'invalid',
  'invalid decision': 'invalid',
  'invalid pause': 'invalid',
};

function classify(code: unknown, message: unknown): WorkflowFailure {
  const domain = typeof message === 'string' && Object.hasOwn(byDomainMessage, message) ? byDomainMessage[message] : undefined;
  if (code === '42501') return 'forbidden';
  if (code === '40001') return domain === 'unavailable' ? 'unavailable' : 'stale';
  if (code === '22023') return domain === 'expired' || domain === 'unavailable' || domain === 'invalid' ? domain : 'rejected';
  return 'unknown';
}

export async function workflowErrorFrom(response: Response): Promise<WorkflowError> {
  if (response.status >= 500) return new WorkflowError('unknown');
  try {
    const body: unknown = await response.json();
    const fields = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
    return new WorkflowError(classify(fields.code, fields.message));
  } catch {
    return new WorkflowError('unknown');
  }
}

const definitive: Record<Exclude<WorkflowFailure, 'unknown'>, string> = {
  forbidden: 'This action is not available for your account or this item.',
  stale: 'This item changed after it was loaded. Refresh and review it before trying again.',
  expired: 'This agreement has expired. Refresh to see whether a new one is available.',
  unavailable: 'This offer is no longer available. Refresh to see the current offers.',
  invalid: 'Some of the details were not accepted. Check them and try again.',
  rejected: 'This step is no longer available. Refresh to see the current state.',
};

export function isDefinitiveFailure(error: unknown): boolean {
  return error instanceof WorkflowError && error.failure !== 'unknown';
}

export function failureMessage(error: unknown, uncertain: string): string {
  return error instanceof WorkflowError && error.failure !== 'unknown' ? definitive[error.failure] : uncertain;
}
