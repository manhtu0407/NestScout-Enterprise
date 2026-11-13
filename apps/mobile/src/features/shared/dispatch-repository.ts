import { authenticatedRequest } from '@/lib/authenticated-rest';
import { randomUUID } from 'expo-crypto';

import { dispatchServiceIds, type DispatchServiceId } from './dispatch-service-id';
import { workflowErrorFrom } from './workflow-error';

export const dispatchStates = ['awaiting_acceptance', 'not_dispatched', 'recovering', 'needs_service', 'searching', 'no_match', 'exhausted', 'assigned', 'cancelled'] as const;
export type DispatchState = (typeof dispatchStates)[number];

export const retryOutcomes = [
  'invited', 'no_eligible_worker', 'limit_reached', 'cooldown', 'already_searching', 'already_assigned', 'cancelled', 'needs_service', 'dispatch_disabled', 'invalid_request',
] as const;
export type RetryOutcome = (typeof retryOutcomes)[number];

export type DispatchSummary = {
  requestId: string;
  state: DispatchState;
  openInvites: number;
  earliestExpiry: string | null;
  rounds: number;
  canRetry: boolean;
  canCancel: boolean;
  canReclassify: boolean;
  nextRetryAt: string | null;
  retriesLeft: number;
  lastOutcome: string | null;
  canReassign: boolean;
  reassignAt: string | null;
  jobStage: JobStage | null;
  canEscalate: boolean;
  escalateAt: string | null;
  escalatedAt: string | null;
};

export const jobStages = ['assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted', 'completed'] as const;
export type JobStage = (typeof jobStages)[number];

export type RetryResult = {
  outcome: RetryOutcome;
  state: DispatchState;
  canRetry: boolean;
  retriesLeft: number;
  openInvites: number;
  nextRetryAt: string | null;
};

const summaryBatchSize = 100;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDispatchState(value: unknown): value is DispatchState {
  return typeof value === 'string' && (dispatchStates as readonly string[]).includes(value);
}

function isRetryOutcome(value: unknown): value is RetryOutcome {
  return typeof value === 'string' && (retryOutcomes as readonly string[]).includes(value);
}

function isJobStage(value: unknown): value is JobStage {
  return typeof value === 'string' && (jobStages as readonly string[]).includes(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function optionalInstant(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (!isInstant(value)) throw new Error('Invalid dispatch response');
  return value;
}

function toSummary(row: unknown, requested: ReadonlySet<string>): DispatchSummary {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid dispatch response');
  const item = row as Record<string, unknown>;
  const expiry = item.earliest_expiry;
  const reclassify = item.can_reclassify ?? false;
  const retriesLeft = item.retries_left ?? 0;
  const lastOutcome = item.last_outcome ?? null;
  const reassign = item.can_reassign ?? false;
  const escalate = item.can_escalate ?? false;
  const jobStage = item.job_stage ?? null;
  if (typeof item.request_id !== 'string' || !requested.has(item.request_id) || !isDispatchState(item.state) || !isCount(item.open_invites) || !isCount(item.rounds)
    || (expiry !== null && (typeof expiry !== 'string' || Number.isNaN(Date.parse(expiry)))) || typeof item.can_retry !== 'boolean' || typeof item.can_cancel !== 'boolean'
    || typeof reclassify !== 'boolean' || typeof reassign !== 'boolean' || typeof escalate !== 'boolean' || (jobStage !== null && !isJobStage(jobStage)) || !isCount(retriesLeft) || (lastOutcome !== null && typeof lastOutcome !== 'string')) {
    throw new Error('Invalid dispatch response');
  }
  return {
    requestId: item.request_id, state: item.state, openInvites: item.open_invites, earliestExpiry: expiry, rounds: item.rounds, canRetry: item.can_retry,
    canCancel: item.can_cancel, canReclassify: reclassify, nextRetryAt: optionalInstant(item.next_retry_at), retriesLeft, lastOutcome,
    canReassign: reassign, reassignAt: optionalInstant(item.reassign_at), jobStage, canEscalate: escalate,
    escalateAt: optionalInstant(item.escalate_at), escalatedAt: optionalInstant(item.escalated_at),
  };
}

async function readBatch(userId: string, requestIds: readonly string[], signal: AbortSignal): Promise<DispatchSummary[]> {
  const response = await authenticatedRequest(userId, 'rpc/get_dispatch_summary', { method: 'POST', signal, body: JSON.stringify({ p_request_ids: requestIds }) });
  if (!response.ok) throw new Error('Could not read dispatch summaries');
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error('Invalid dispatch response');
  const requested = new Set(requestIds);
  return result.map(row => toSummary(row, requested));
}

export async function readDispatchSummaries(userId: string, requestIds: readonly string[], signal: AbortSignal): Promise<DispatchSummary[]> {
  if (!requestIds.length) return [];
  if (!requestIds.every(id => uuid.test(id))) throw new Error('Invalid request identifier');
  const batches: string[][] = [];
  for (let start = 0; start < requestIds.length; start += summaryBatchSize) batches.push(requestIds.slice(start, start + summaryBatchSize));
  return (await Promise.all(batches.map(batch => readBatch(userId, batch, signal)))).flat();
}

export async function retryDispatchRequest(userId: string, requestId: string, signal: AbortSignal): Promise<RetryResult> {
  const response = await authenticatedRequest(userId, 'rpc/retry_service_dispatch', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null) throw new Error('Invalid retry response');
  const item = result as Record<string, unknown>;
  const retriesLeft = item.retries_left === null ? 0 : item.retries_left;
  if (!isRetryOutcome(item.outcome) || !isDispatchState(item.state) || typeof item.can_retry !== 'boolean' || !isCount(retriesLeft) || !isCount(item.open_invites)) {
    throw new Error('Invalid retry response');
  }
  return {
    outcome: item.outcome, state: item.state, canRetry: item.can_retry, retriesLeft, openInvites: item.open_invites,
    nextRetryAt: optionalInstant(item.next_retry_at),
  };
}

export async function setRequestService(userId: string, requestId: string, serviceId: DispatchServiceId, signal: AbortSignal): Promise<DispatchServiceId> {
  if (!dispatchServiceIds.includes(serviceId)) throw new Error('Invalid service');
  const response = await authenticatedRequest(userId, 'rpc/set_request_service', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId, p_service_id: serviceId }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (result !== serviceId) throw new Error('Invalid service response');
  return serviceId;
}

export async function requestReassignment(userId: string, requestId: string, signal: AbortSignal): Promise<void> {
  const response = await authenticatedRequest(userId, 'rpc/request_service_reassignment', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId, p_key: randomUUID() }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  const outcome = typeof result === 'object' && result !== null ? (result as Record<string, unknown>).outcome : undefined;
  if (outcome !== 'released' && outcome !== 'already_released') throw new Error('Invalid reassignment response');
}

export async function escalateJob(userId: string, requestId: string, signal: AbortSignal): Promise<void> {
  const response = await authenticatedRequest(userId, 'rpc/escalate_service_job', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId, p_key: randomUUID() }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  const outcome = typeof result === 'object' && result !== null ? (result as Record<string, unknown>).outcome : undefined;
  if (outcome !== 'escalated' && outcome !== 'already_escalated') throw new Error('Invalid escalation response');
}

export async function cancelRequest(userId: string, requestId: string, signal: AbortSignal): Promise<string> {
  const response = await authenticatedRequest(userId, 'rpc/cancel_service_request', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (result !== requestId) throw new Error('Invalid cancellation response');
  return result;
}
