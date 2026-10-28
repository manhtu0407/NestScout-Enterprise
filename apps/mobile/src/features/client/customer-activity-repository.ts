import { authenticatedRequest } from '@/lib/authenticated-rest';
import { readJobReports, readScopeChanges, workflowErrorFrom, type JobReport, type ScopeChange } from '@/features/shared';

export type CustomerJob = { id: string; request_id: string; stage: string; version: number };
export type Submission = { id: string; job_id: string; evidence: string; decision: string };
export type SupportCase = { id: string; job_id: string; kind: string; reason: string };
export type JobPause = { job_id: string; category: 'ordinary_interruption' | 'safety_concern'; resume_requested: boolean };
export type CustomerActivity = { jobs: CustomerJob[]; submissions: Submission[]; cases: SupportCase[]; changes: ScopeChange[]; reports: JobReport[]; pauses: JobPause[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const apiRowLimit = 1000;

async function list(userId: string, path: string, signal: AbortSignal): Promise<unknown[]> {
  const response = await authenticatedRequest(userId, path, { signal });
  if (!response.ok) throw new Error('Activity unavailable');
  const value: unknown = await response.json();
  if (!Array.isArray(value)) throw new Error('Invalid activity');
  return value;
}

async function readPauses(userId: string, jobs: CustomerJob[], signal: AbortSignal): Promise<JobPause[]> {
  const response = await authenticatedRequest(userId, 'rpc/open_job_pauses', { method: 'POST', signal, body: '{}' });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error('Invalid pauses');
  if (result.length >= apiRowLimit) throw new Error('Result may be truncated');
  const listed = new Map(jobs.map(job => [job.id, job]));
  const seen = new Set<string>();
  const pauses = result.map((value: unknown) => {
    if (typeof value !== 'object' || value === null) throw new Error('Invalid pauses');
    const row = value as Record<string, unknown>;
    const job = typeof row.job_id === 'string' ? listed.get(row.job_id) : undefined;
    if (!job || job.stage !== 'paused' || seen.has(job.id)
      || (row.category !== 'ordinary_interruption' && row.category !== 'safety_concern')
      || typeof row.resume_requested !== 'boolean' || (row.category === 'safety_concern' && row.resume_requested)) throw new Error('Invalid pauses');
    seen.add(job.id);
    return { job_id: job.id, category: row.category as JobPause['category'], resume_requested: row.resume_requested };
  });
  if (jobs.some(job => job.stage === 'paused' && !seen.has(job.id))) throw new Error('Invalid pauses');
  return pauses;
}

export async function readCustomerActivity(userId: string, requestIds: string[], signal: AbortSignal): Promise<CustomerActivity> {
  if (!requestIds.length) return { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] };
  if (!requestIds.every(id => uuid.test(id))) throw new Error('Invalid request identifier');
  const jobsPath = `service_jobs?select=id,request_id,stage,version&request_id=in.(${requestIds.join(',')})`;
  const jobs = await list(userId, jobsPath, signal);
  if (!jobs.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.id === 'string' && uuid.test(row.id) && typeof row.request_id === 'string'
      && requestIds.includes(row.request_id) && typeof row.stage === 'string' && Number.isSafeInteger(row.version);
  })) throw new Error('Invalid jobs');
  const jobIds = (jobs as CustomerJob[]).map(job => job.id);
  if (!jobIds.length) return { jobs: jobs as CustomerJob[], submissions: [], cases: [], changes: [], reports: [], pauses: [] };
  const [submissions, cases, changes, reports, pauses] = await Promise.all([
    list(userId, `service_submissions?select=id,job_id,evidence,decision&job_id=in.(${jobIds.join(',')})`, signal),
    list(userId, `service_cases?select=id,job_id,kind,reason&job_id=in.(${jobIds.join(',')})`, signal),
    readScopeChanges(userId, jobIds, signal),
    readJobReports(userId, jobIds, signal),
    readPauses(userId, jobs as CustomerJob[], signal),
  ]);
  if (!submissions.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.job_id === 'string' && jobIds.includes(row.job_id)
      && typeof row.evidence === 'string' && typeof row.decision === 'string';
  }) || !cases.every((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const row = value as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.job_id === 'string' && jobIds.includes(row.job_id)
      && typeof row.kind === 'string' && typeof row.reason === 'string';
  })) throw new Error('Invalid activity');
  const currentJobs = await list(userId, jobsPath, signal);
  if (currentJobs.length !== jobs.length || !(jobs as CustomerJob[]).every(job => currentJobs.some((value: unknown) => {
    if (typeof value !== 'object' || value === null) return false;
    const current = value as Record<string, unknown>;
    return current.id === job.id && current.request_id === job.request_id && current.version === job.version && current.stage === job.stage;
  }))) throw new Error('Activity changed during refresh');
  return { jobs: jobs as CustomerJob[], submissions: submissions as Submission[], cases: cases as SupportCase[], changes, reports, pauses };
}

async function rpc(userId: string, name: string, body: object, signal: AbortSignal): Promise<void> {
  const response = await authenticatedRequest(userId, `rpc/${name}`, { method: 'POST', signal, body: JSON.stringify(body) });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (typeof result !== 'string') throw new Error('Invalid result');
}

export function decideSubmission(userId: string, submissionId: string, version: number, decision: 'accepted' | 'revision_requested' | 'disputed', reason: string | null, signal: AbortSignal): Promise<void> {
  return rpc(userId, 'decide_service_submission', { p_submission_id: submissionId, p_version: version, p_decision: decision, p_reason: reason }, signal);
}

export function openAftercare(userId: string, jobId: string, key: string, reason: string, signal: AbortSignal): Promise<void> {
  return rpc(userId, 'open_service_aftercare', { p_job_id: jobId, p_key: key, p_reason: reason }, signal);
}

export function decideScope(userId: string, proposalId: string, jobVersion: number, sequence: number, decision: 'approved' | 'rejected', signal: AbortSignal): Promise<void> {
  return rpc(userId, 'decide_service_scope', { p_proposal_id: proposalId, p_job_version: jobVersion, p_sequence: sequence, p_decision: decision }, signal);
}

export async function consentResume(userId: string, job: CustomerJob, signal: AbortSignal): Promise<void> {
  const response = await authenticatedRequest(userId, 'rpc/consent_service_resume', {
    method: 'POST', signal, body: JSON.stringify({ p_job_id: job.id, p_version: job.version }),
  });
  if (!response.ok) throw await workflowErrorFrom(response);
  const result: unknown = await response.json();
  if (result !== job.version + 1) throw new Error('Invalid result');
}
