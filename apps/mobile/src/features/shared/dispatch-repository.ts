import { authenticatedRequest } from '@/lib/authenticated-rest';

import { workflowErrorFrom } from './workflow-error';

export const dispatchStates = ['awaiting_acceptance', 'not_dispatched', 'searching', 'no_match', 'exhausted', 'assigned', 'cancelled'] as const;
export type DispatchState = (typeof dispatchStates)[number];

export type DispatchSummary = {
  requestId: string;
  state: DispatchState;
  openInvites: number;
  earliestExpiry: string | null;
  rounds: number;
  canRetry: boolean;
  canCancel: boolean;
};

const summaryBatchSize = 100;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isDispatchState(value: unknown): value is DispatchState {
  return typeof value === 'string' && (dispatchStates as readonly string[]).includes(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function toSummary(row: unknown, requested: ReadonlySet<string>): DispatchSummary {
  if (typeof row !== 'object' || row === null) throw new Error('Invalid dispatch response');
  const item = row as Record<string, unknown>;
  const expiry = item.earliest_expiry;
  if (typeof item.request_id !== 'string' || !requested.has(item.request_id) || !isDispatchState(item.state) || !isCount(item.open_invites) || !isCount(item.rounds)
    || (expiry !== null && (typeof expiry !== 'string' || Number.isNaN(Date.parse(expiry)))) || typeof item.can_retry !== 'boolean' || typeof item.can_cancel !== 'boolean') {
    throw new Error('Invalid dispatch response');
  }
  return { requestId: item.request_id, state: item.state, openInvites: item.open_invites, earliestExpiry: expiry, rounds: item.rounds, canRetry: item.can_retry, canCancel: item.can_cancel };
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

export async function redispatchRequest(userId: string, requestId: string, signal: AbortSignal): Promise<number> {
  const response = await authenticatedRequest(userId, 'rpc/redispatch_service_request', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (!isCount(result)) throw new Error('Invalid retry response');
  return result;
}

export async function cancelRequest(userId: string, requestId: string, signal: AbortSignal): Promise<string> {
  const response = await authenticatedRequest(userId, 'rpc/cancel_service_request', { method: 'POST', signal, body: JSON.stringify({ p_request_id: requestId }) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (result !== requestId) throw new Error('Invalid cancellation response');
  return result;
}
