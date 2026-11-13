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
};

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
  if (typeof item.escalation_id !== 'string' || typeof item.request_id !== 'string' || typeof item.job_id !== 'string'
    || (item.status !== 'open' && item.status !== 'reviewing') || (note !== null && typeof note !== 'string') || !isInstant(item.created_at)
    || (reviewedAt !== null && !isInstant(reviewedAt)) || typeof item.description !== 'string' || typeof item.location !== 'string'
    || (worker !== null && typeof worker !== 'string') || (stage !== null && !(jobStages as readonly unknown[]).includes(stage))) {
    throw new Error('Invalid operator response');
  }
  return {
    escalationId: item.escalation_id, requestId: item.request_id, jobId: item.job_id, status: item.status, note, createdAt: item.created_at,
    reviewedAt, description: item.description, location: item.location, workerName: worker, jobStage: stage as JobStage | null,
  };
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
  if (outcome !== 'reviewing' && outcome !== 'already_reviewing' && outcome !== 'already_resolved') throw new Error('Invalid review response');
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
