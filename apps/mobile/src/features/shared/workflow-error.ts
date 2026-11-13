export type WorkflowFailure = 'forbidden' | 'stale' | 'expired' | 'unavailable' | 'capacity' | 'early' | 'invalid' | 'rejected' | 'unknown';

export class WorkflowError extends Error {
  readonly failure: WorkflowFailure;

  constructor(failure: WorkflowFailure) {
    super(`Workflow operation ${failure}`);
    this.failure = failure;
  }
}

const byDomainMessage: Record<string, WorkflowFailure> = {
  'quote expired': 'expired',
  'invitation unavailable': 'unavailable',
  'invitation expired': 'expired',
  'request cancelled': 'unavailable',
  'service already set': 'unavailable',
  'invalid service': 'invalid',
  'agreement unavailable': 'unavailable',
  'already assigned': 'unavailable',
  'worker at capacity': 'capacity',
  'schedule conflict': 'capacity',
  'worker still has time': 'early',
  'run active': 'unavailable',
  'invalid request': 'invalid',
  'invalid evidence': 'invalid',
  'invalid proposal': 'invalid',
  'invalid report': 'invalid',
  'invalid reason': 'invalid',
  'invalid decision': 'invalid',
  'invalid pause': 'invalid',
  'certificate limit': 'invalid',
  'profile required': 'invalid',
};

function classify(code: unknown, message: unknown): WorkflowFailure {
  const domain = typeof message === 'string' && Object.hasOwn(byDomainMessage, message) ? byDomainMessage[message] : undefined;
  if (code === '42501') return 'forbidden';
  if (code === '40001') return domain === 'unavailable' || domain === 'capacity' ? domain : 'stale';
  if (code === '22023') return domain === 'expired' || domain === 'unavailable' || domain === 'invalid' || domain === 'early' ? domain : 'rejected';
  return 'unknown';
}

const versionConflicts: readonly string[] = ['already assigned', 'stale job', 'stale proposal', 'stale quote', 'stale terms', 'worker at capacity', 'schedule conflict', 'job changed'];

export async function workflowErrorFrom(response: Response): Promise<WorkflowError> {
  if (response.status > 500) return new WorkflowError('unknown');
  try {
    const body: unknown = await response.json();
    const fields = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
    if (response.status === 500 && !(fields.code === '40001' && typeof fields.message === 'string' && versionConflicts.includes(fields.message))) {
      return new WorkflowError('unknown');
    }
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
  capacity: 'You already have the maximum number of active jobs, or this visit overlaps another job. Finish or release a job first.',
  early: 'It is too early for this action. Please wait until the worker has had time to arrive or start the job.',
  invalid: 'Some of the details were not accepted. Check them and try again.',
  rejected: 'This step is no longer available. Refresh to see the current state.',
};

export function isDefinitiveFailure(error: unknown): boolean {
  return error instanceof WorkflowError && error.failure !== 'unknown';
}

export function failureMessage(error: unknown, uncertain: string): string {
  return error instanceof WorkflowError && error.failure !== 'unknown' ? definitive[error.failure] : uncertain;
}
