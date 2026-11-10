import { callRpc, readRows } from './customer-data-repository';

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export async function readDeletionRequest(userId: string, signal: AbortSignal): Promise<string | null> {
  const rows = await readRows(userId, 'account_deletion_requests?select=requested_at', signal, 'Could not read deletion request');
  if (rows.length > 1) throw new Error('Invalid deletion request response');
  if (rows.length === 0) return null;
  const row = rows[0];
  if (typeof row !== 'object' || row === null || !isTimestamp((row as Record<string, unknown>).requested_at)) throw new Error('Invalid deletion request response');
  return (row as { requested_at: string }).requested_at;
}

export async function requestAccountDeletion(userId: string, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'request_account_deletion', {}, signal);
  if (!isTimestamp(result)) throw new Error('Invalid deletion request response');
  return result;
}

export async function cancelAccountDeletion(userId: string, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'cancel_account_deletion', {}, signal);
  if (typeof result !== 'boolean') throw new Error('Invalid deletion request response');
}

export const consentPurposes = ['ai_sharing', 'push_notifications'] as const;
export type ConsentPurpose = (typeof consentPurposes)[number];

export async function readConsent(userId: string, purpose: ConsentPurpose, signal: AbortSignal): Promise<boolean> {
  const rows = await readRows(userId, `consent_events?select=granted&purpose=eq.${purpose}&order=id.desc&limit=1`, signal, 'Could not read consent');
  if (rows.length === 0) return false;
  const row = rows[0];
  if (rows.length > 1 || typeof row !== 'object' || row === null || typeof (row as Record<string, unknown>).granted !== 'boolean') throw new Error('Invalid consent response');
  return (row as { granted: boolean }).granted;
}

export async function recordConsent(userId: string, purpose: ConsentPurpose, granted: boolean, version: string, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'set_consent', { p_purpose: purpose, p_granted: granted, p_version: version }, signal);
  if (!isTimestamp(result)) throw new Error('Invalid consent response');
  return result;
}

export async function exportPersonalData(userId: string, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'export_my_data', {}, signal);
  if (typeof result !== 'object' || result === null || Array.isArray(result) || !isTimestamp((result as Record<string, unknown>).exported_at)) throw new Error('Invalid export response');
  return JSON.stringify(result, null, 2);
}

export type PushPlatform = 'ios' | 'android';

export async function registerPushToken(userId: string, token: string, platform: PushPlatform, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'register_push_token', { p_token: token, p_platform: platform }, signal);
  if (!isTimestamp(result)) throw new Error('Invalid push registration response');
}

export async function unregisterPushToken(userId: string, token: string, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'unregister_push_token', { p_token: token }, signal);
  if (typeof result !== 'boolean') throw new Error('Invalid push registration response');
}

export type JobChangeKind = 'cancel' | 'reschedule';
export type JobChangeStatus = 'pending' | 'agreed' | 'declined' | 'withdrawn';
export type JobChange = { id: string; jobId: string; requestedBy: string; kind: JobChangeKind; proposedFor: string | null; reason: string | null; status: JobChangeStatus; createdAt: string };

const changeKinds: readonly string[] = ['cancel', 'reschedule'];
const changeStatuses: readonly string[] = ['pending', 'agreed', 'declined', 'withdrawn'];

function parseJobChange(value: unknown): JobChange {
  const row = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  if (row === null || typeof row.id !== 'string' || typeof row.job_id !== 'string' || typeof row.requested_by !== 'string'
    || typeof row.kind !== 'string' || !changeKinds.includes(row.kind) || typeof row.status !== 'string' || !changeStatuses.includes(row.status)
    || !isTimestamp(row.created_at) || (row.proposed_for !== null && !isTimestamp(row.proposed_for)) || (row.reason !== null && typeof row.reason !== 'string')) {
    throw new Error('Invalid job change response');
  }
  return { id: row.id, jobId: row.job_id, requestedBy: row.requested_by, kind: row.kind as JobChangeKind, proposedFor: row.proposed_for as string | null,
    reason: row.reason as string | null, status: row.status as JobChangeStatus, createdAt: row.created_at };
}

export async function readJobChanges(userId: string, jobId: string, signal: AbortSignal): Promise<JobChange[]> {
  const rows = await readRows(userId, `job_change_requests?select=id,job_id,requested_by,kind,proposed_for,reason,status,created_at&job_id=eq.${encodeURIComponent(jobId)}&order=created_at.desc&limit=20`, signal, 'Could not read job changes');
  return rows.map(parseJobChange);
}

export async function requestJobChange(userId: string, jobId: string, kind: JobChangeKind, proposedFor: string | null, reason: string | null, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'request_job_change', { p_job_id: jobId, p_kind: kind, p_proposed_for: proposedFor, p_reason: reason }, signal);
  if (typeof result !== 'string') throw new Error('Invalid job change response');
  return result;
}

export async function decideJobChange(userId: string, changeId: string, decision: 'agreed' | 'declined' | 'withdrawn', signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'decide_job_change', { p_change_id: changeId, p_decision: decision }, signal);
  if (result !== decision) throw new Error('Invalid job change response');
}
