export type WorkflowFailure = 'forbidden' | 'stale' | 'rejected' | 'unknown';

export class WorkflowError extends Error {
  constructor(readonly failure: WorkflowFailure) {
    super(`Workflow operation ${failure}`);
  }
}

function classify(code: unknown): WorkflowFailure {
  if (code === '42501') return 'forbidden';
  if (code === '40001') return 'stale';
  if (code === '22023') return 'rejected';
  return 'unknown';
}

export async function workflowErrorFrom(response: Response): Promise<WorkflowError> {
  if (response.status >= 500) return new WorkflowError('unknown');
  try {
    const body: unknown = await response.json();
    const code = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).code : undefined;
    return new WorkflowError(classify(code));
  } catch {
    return new WorkflowError('unknown');
  }
}

const definitive: Record<Exclude<WorkflowFailure, 'unknown'>, string> = {
  forbidden: 'This action is not available for your account or this item.',
  stale: 'This item changed after it was loaded. Refresh and review it before trying again.',
  rejected: 'This step is no longer available. Refresh to see the current state.',
};

export function isDefinitiveFailure(error: unknown): boolean {
  return error instanceof WorkflowError && error.failure !== 'unknown';
}

export function failureMessage(error: unknown, uncertain: string): string {
  return error instanceof WorkflowError && error.failure !== 'unknown' ? definitive[error.failure] : uncertain;
}
