import { callRpc } from './customer-data-repository';

export type WorkerEarningRecord = {
  job_id: string;
  title: string;
  amount_minor: number;
  currency: string;
  accepted_at: string;
  completed_on: string;
};

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function isEarning(value: unknown): value is WorkerEarningRecord {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.job_id === 'string' && typeof row.title === 'string' && Number.isSafeInteger(row.amount_minor) && typeof row.currency === 'string'
    && typeof row.accepted_at === 'string' && typeof row.completed_on === 'string' && dayPattern.test(row.completed_on);
}

export async function readWorkerEarnings(userId: string, signal: AbortSignal): Promise<WorkerEarningRecord[]> {
  const result = await callRpc(userId, 'worker_earnings', {}, signal);
  if (!Array.isArray(result) || !result.every(isEarning)) throw new Error('Invalid worker earnings response');
  return result;
}
