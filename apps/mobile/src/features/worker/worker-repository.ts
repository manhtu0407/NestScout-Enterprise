import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges, workflowErrorFrom, type JobReport, type ScopeChange } from '@/features/shared';

export type Offer = {
  invitation_id: string;
  quote_id: string;
  quote_version: number;
  scope: string;
  amount_minor: number;
  currency: 'VND';
  expires_at: string;
  basis: string;
};

export type Job = {
  job_id: string;
  stage: 'assigned' | 'en_route' | 'arrived' | 'working' | 'paused' | 'submitted' | 'completed';
  version: number;
  scope: string;
  amount_minor: number;
  currency: 'VND';
};

async function rpc(userId: string, name: string, body: object, signal: AbortSignal): Promise<unknown> {
  const response = await authenticatedRequest(userId, `rpc/${name}`, { method: 'POST', signal, body: JSON.stringify(body) });
  if (!response.ok) throw await workflowErrorFrom(response);
  return response.json();
}

function terms(value: Record<string, unknown>): boolean {
  return typeof value.scope === 'string' && Number.isSafeInteger(value.amount_minor) && value.currency === 'VND';
}

export async function readOffers(userId: string, signal: AbortSignal): Promise<Offer[]> {
  const result = await rpc(userId, 'worker_offers', {}, signal);
  if (!Array.isArray(result) || !result.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.invitation_id === 'string' && typeof row.quote_id === 'string'
      && Number.isSafeInteger(row.quote_version) && typeof row.expires_at === 'string' && typeof row.basis === 'string' && terms(row);
  })) throw new Error('Invalid offers');
  return result as Offer[];
}

export async function readJobs(userId: string, signal: AbortSignal): Promise<Job[]> {
  const result = await rpc(userId, 'worker_jobs', {}, signal);
  if (!Array.isArray(result) || !result.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.job_id === 'string' && ['assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted', 'completed'].includes(String(row.stage))
      && Number.isSafeInteger(row.version) && terms(row);
  })) throw new Error('Invalid jobs');
  return result as Job[];
}

export function readWorkerChanges(userId: string, jobs: Job[], signal: AbortSignal): Promise<ScopeChange[]> {
  return readScopeChanges(userId, jobs.map(job => job.job_id), signal);
}

export function readWorkerReports(userId: string, jobs: Job[], signal: AbortSignal): Promise<JobReport[]> {
  return readJobReports(userId, jobs.map(job => job.job_id), signal);
}

export async function readWorkerSnapshot(userId: string, signal: AbortSignal): Promise<{
  offers: Offer[]; jobs: Job[]; changes: ScopeChange[]; reports: JobReport[];
}> {
  const [offers, jobs] = await Promise.all([readOffers(userId, signal), readJobs(userId, signal)]);
  const [changes, reports] = await Promise.all([readWorkerChanges(userId, jobs, signal), readWorkerReports(userId, jobs, signal)]);
  const [currentOffers, currentJobs] = await Promise.all([readOffers(userId, signal), readJobs(userId, signal)]);
  const offerKeys = (items: Offer[]) => items.map(item => JSON.stringify([
    item.invitation_id, item.quote_id, item.quote_version, item.scope, item.amount_minor, item.currency, item.expires_at,
  ])).sort();
  const jobKeys = (items: Job[]) => items.map(item => JSON.stringify([
    item.job_id, item.version, item.stage, item.scope, item.amount_minor, item.currency,
  ])).sort();
  if (JSON.stringify(offerKeys(offers)) !== JSON.stringify(offerKeys(currentOffers))
    || JSON.stringify(jobKeys(jobs)) !== JSON.stringify(jobKeys(currentJobs))) throw new Error('Worker activity changed during refresh');
  return { offers, jobs, changes, reports };
}

export async function acceptOffer(userId: string, offer: Offer, signal: AbortSignal): Promise<void> {
  const result = await rpc(userId, 'accept_service_invitation', {
    p_invitation_id: offer.invitation_id, p_quote_id: offer.quote_id, p_quote_version: offer.quote_version,
  }, signal);
  if (typeof result !== 'string') throw new Error('Invalid assignment');
}

export async function declineOffer(userId: string, offer: Offer, signal: AbortSignal): Promise<void> {
  const result = await rpc(userId, 'decline_service_invitation', {
    p_invitation_id: offer.invitation_id, p_quote_id: offer.quote_id, p_quote_version: offer.quote_version,
  }, signal);
  if (result !== offer.invitation_id) throw new Error('Invalid decline result');
}

export async function advanceJob(userId: string, job: Job, next: Job['stage'], signal: AbortSignal): Promise<void> {
  const result = await rpc(userId, 'advance_service_job', {
    p_job_id: job.job_id, p_version: job.version, p_next: next,
  }, signal);
  if (result !== job.version + 1) throw new Error('Invalid job result');
}

export async function submitWork(userId: string, jobId: string, version: number, key: string, evidence: string, signal: AbortSignal): Promise<void> {
  const result = await rpc(userId, 'submit_service_work', {
    p_job_id: jobId, p_version: version, p_key: key, p_evidence: evidence,
  }, signal);
  if (typeof result !== 'string') throw new Error('Invalid submission result');
}

export async function proposeScope(userId: string, jobId: string, version: number, key: string, scope: string, amount: number, rationale: string, signal: AbortSignal): Promise<void> {
  const result = await rpc(userId, 'propose_service_scope', {
    p_job_id: jobId, p_version: version, p_key: key, p_scope: scope, p_amount: amount, p_rationale: rationale,
  }, signal);
  if (typeof result !== 'string') throw new Error('Invalid proposal result');
}

export async function reportJob(userId: string, jobId: string, version: number, key: string, kind: JobReport['kind'], details: string, signal: AbortSignal): Promise<void> {
  const result = await rpc(userId, 'report_service_job', {
    p_job_id: jobId, p_version: version, p_key: key, p_kind: kind, p_details: details,
  }, signal);
  if (typeof result !== 'string') throw new Error('Invalid report result');
}
