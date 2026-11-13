import { callRpc } from './customer-data-repository';
import { jobStages, type EscalationResolution, type JobStage } from './dispatch-repository';

export type OperatorCase = {
  escalationId: string;
  requestId: string;
  jobId: string;
  status: 'open' | 'reviewing';
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  description: string;
  location: string;
  workerName: string | null;
  jobStage: JobStage | null;
  reviewState: OperatorReviewState;
  reviewExpiresAt: string | null;
  takeoverCount: number;
};

export type OperatorReviewState = 'unclaimed' | 'mine' | 'held' | 'stale';

export type OperatorAccess = { expiresAt: string; openCases: number };

const reviewStates: readonly unknown[] = ['unclaimed', 'mine', 'held', 'stale'];

export const operatorNoteLimit = 500;

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function toCase(row: unknown): OperatorCase {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid operator response');
  const item = row as Record<string, unknown>;
  const stage = item.job_stage ?? null;
  const note = item.note ?? null;
  const reviewedAt = item.reviewed_at ?? null;
  const worker = item.worker_name ?? null;
  const expires = item.review_expires_at ?? null;
  if (typeof item.escalation_id !== 'string' || typeof item.request_id !== 'string' || typeof item.job_id !== 'string'
    || (item.status !== 'open' && item.status !== 'reviewing') || (note !== null && typeof note !== 'string') || !isInstant(item.created_at)
    || (reviewedAt !== null && !isInstant(reviewedAt)) || typeof item.description !== 'string' || typeof item.location !== 'string'
    || (worker !== null && typeof worker !== 'string') || (stage !== null && !(jobStages as readonly unknown[]).includes(stage))
    || !reviewStates.includes(item.review_state) || (expires !== null && !isInstant(expires))
    || typeof item.takeover_count !== 'number' || !Number.isSafeInteger(item.takeover_count) || item.takeover_count < 0) {
    throw new Error('Invalid operator response');
  }
  return {
    escalationId: item.escalation_id, requestId: item.request_id, jobId: item.job_id, status: item.status, note, createdAt: item.created_at,
    reviewedAt, description: item.description, location: item.location, workerName: worker, jobStage: stage as JobStage | null,
    reviewState: item.review_state as OperatorReviewState, reviewExpiresAt: expires, takeoverCount: item.takeover_count,
  };
}

export async function readOperatorAccess(userId: string, signal: AbortSignal): Promise<OperatorAccess | null> {
  const result = await callRpc(userId, 'operator_access', {}, signal);
  if (!Array.isArray(result) || result.length > 1) throw new Error('Invalid operator access response');
  if (result.length === 0) return null;
  const row: unknown = result[0];
  if (typeof row !== 'object' || row === null) throw new Error('Invalid operator access response');
  const item = row as Record<string, unknown>;
  if (!isInstant(item.expires_at) || typeof item.open_cases !== 'number' || !Number.isSafeInteger(item.open_cases) || item.open_cases < 0) {
    throw new Error('Invalid operator access response');
  }
  return { expiresAt: item.expires_at, openCases: item.open_cases };
}

export async function readOperatorCases(userId: string, signal: AbortSignal): Promise<OperatorCase[]> {
  const result = await callRpc(userId, 'operator_escalation_queue', {}, signal);
  if (!Array.isArray(result)) throw new Error('Invalid operator response');
  return result.map(toCase);
}

function outcomeOf(result: unknown): unknown {
  return typeof result === 'object' && result !== null ? (result as Record<string, unknown>).outcome : undefined;
}

export async function reviewOperatorCase(userId: string, escalationId: string, key: string, signal: AbortSignal): Promise<void> {
  const outcome = outcomeOf(await callRpc(userId, 'review_service_escalation', { p_escalation_id: escalationId, p_key: key }, signal));
  if (outcome !== 'reviewing' && outcome !== 'taken_over' && outcome !== 'already_reviewing' && outcome !== 'already_resolved') {
    throw new Error('Invalid review response');
  }
}

export async function resolveOperatorCase(
  userId: string, escalationId: string, resolution: EscalationResolution, note: string, key: string, signal: AbortSignal,
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length > operatorNoteLimit) throw new Error('Invalid resolution note');
  const body = { p_escalation_id: escalationId, p_resolution: resolution, p_note: trimmed === '' ? null : trimmed, p_key: key };
  const outcome = outcomeOf(await callRpc(userId, 'resolve_service_escalation', body, signal));
  if (outcome !== 'resolved' && outcome !== 'already_resolved') throw new Error('Invalid resolution response');
}
