import { authenticatedRequest } from '@/lib/authenticated-rest';

import { workflowErrorFrom } from './workflow-error';

export type CustomerNotificationKind = 'quote_received' | 'job_assigned' | 'job_progress' | 'work_submitted' | 'job_completed' | 'scope_proposed' | 'dispatch_exhausted' | 'job_released';
export type WorkerNotificationKind = 'job_offered' | 'work_approved' | 'revision_requested' | 'work_disputed' | 'scope_approved' | 'scope_rejected' | 'resume_agreed' | 'review_received' | 'job_auto_accepted' | 'job_withdrawn';
export type JobChangeNotificationKind = 'change_requested' | 'change_decided';
export type NotificationKind = CustomerNotificationKind | WorkerNotificationKind | JobChangeNotificationKind;
export type NotificationAudience = 'customer' | 'worker';
export type CustomerNotification = { id: string; kind: NotificationKind; request_id: string; title: string; body: string; created_at: string; read_at: string | null };
export type CustomerProfile = { display_name: string; email: string; address: string };
export type StoredCustomerProfile = CustomerProfile & { avatar_path: string; updated_at: string };
export type CustomerSettings = { push: boolean; quotes: boolean; messages: boolean; promotions: boolean; reduce_motion: boolean };
export type JobWorkerCard = { job_id: string; request_id: string; profile_id: string; display_name: string; saved: boolean; review_rating: number | null; listed: boolean };
export type JobReview = { rating: number; body: string; tags: readonly string[] };

export type SavedWorkerStrength = { label: string; count: number };
export type SavedWorkerReview = { id: string; author: string; service: string; text: string; created_at: string };
export type SavedWorkerRecord = {
  profile_id: string;
  display_name: string;
  trade: string;
  area: string;
  experience_years: number;
  skills: string[];
  service_areas: string[];
  saved_at: string;
  review_count: number;
  rating_average: number;
  completed_jobs: number;
  strengths: SavedWorkerStrength[];
  reviews: SavedWorkerReview[];
  basis: string;
};

const notificationKindsByAudience: Readonly<Record<NotificationAudience, readonly NotificationKind[]>> = {
  customer: ['quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed', 'dispatch_exhausted', 'job_released', 'change_requested', 'change_decided'],
  worker: ['job_offered', 'job_auto_accepted', 'job_withdrawn', 'work_approved', 'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received', 'change_requested', 'change_decided'],
};
const notificationLimit = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isStrength(value: unknown): value is SavedWorkerStrength {
  return isRecord(value) && typeof value.label === 'string' && typeof value.count === 'number' && Number.isSafeInteger(value.count);
}

function isReview(value: unknown): value is SavedWorkerReview {
  return isRecord(value) && typeof value.id === 'string' && typeof value.author === 'string' && typeof value.service === 'string'
    && typeof value.text === 'string' && typeof value.created_at === 'string';
}

function isSavedWorkerRecord(value: unknown): value is SavedWorkerRecord {
  return isRecord(value) && typeof value.profile_id === 'string' && typeof value.display_name === 'string' && typeof value.trade === 'string'
    && typeof value.area === 'string' && typeof value.experience_years === 'number' && isTextList(value.skills) && isTextList(value.service_areas)
    && typeof value.saved_at === 'string' && Number.isSafeInteger(value.review_count) && typeof value.rating_average === 'number'
    && Number.isSafeInteger(value.completed_jobs) && Array.isArray(value.strengths) && value.strengths.every(isStrength)
    && Array.isArray(value.reviews) && value.reviews.every(isReview) && typeof value.basis === 'string';
}

const settingKeys: readonly (keyof CustomerSettings)[] = ['push', 'quotes', 'messages', 'promotions', 'reduce_motion'];

function isJobWorkerCard(value: unknown): value is JobWorkerCard {
  return isRecord(value) && typeof value.job_id === 'string' && typeof value.request_id === 'string' && typeof value.profile_id === 'string'
    && typeof value.display_name === 'string' && typeof value.saved === 'boolean' && typeof value.listed === 'boolean'
    && (value.review_rating === null || (Number.isSafeInteger(value.review_rating) && (value.review_rating as number) >= 1 && (value.review_rating as number) <= 5));
}

export async function readRows(userId: string, path: string, signal: AbortSignal, failure: string): Promise<unknown[]> {
  const response = await authenticatedRequest(userId, path, { signal });
  if (!response.ok) throw new Error(failure);
  const result: unknown = await response.json();
  if (!Array.isArray(result)) throw new Error(failure);
  return result;
}

export async function callRpc(userId: string, name: string, body: object, signal: AbortSignal): Promise<unknown> {
  const response = await authenticatedRequest(userId, `rpc/${name}`, { method: 'POST', signal, body: JSON.stringify(body) });
  if (!response.ok) throw await workflowErrorFrom(response);
  return response.json();
}

export async function readPinnedRequestIds(userId: string, signal: AbortSignal): Promise<string[]> {
  const rows = await readRows(userId, 'request_pins?select=request_id', signal, 'Could not read pins');
  if (!rows.every(row => isRecord(row) && typeof row.request_id === 'string')) throw new Error('Invalid pin response');
  return rows.map(row => (row as { request_id: string }).request_id);
}

export async function setRequestPinned(userId: string, requestId: string, pinned: boolean, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'set_request_pinned', { p_request_id: requestId, p_pinned: pinned }, signal);
  if (result !== pinned) throw new Error('Invalid pin response');
}

export async function readNotifications(userId: string, signal: AbortSignal, audience: NotificationAudience = 'customer'): Promise<CustomerNotification[]> {
  const notificationKinds: readonly string[] = notificationKindsByAudience[audience];
  const rows = await readRows(userId, `notifications?select=id,kind,request_id,title,body,created_at,read_at&kind=in.(${notificationKinds.join(',')})&order=created_at.desc&limit=${notificationLimit}`, signal, 'Could not read notifications');
  if (!rows.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.kind === 'string' && notificationKinds.includes(row.kind)
    && typeof row.request_id === 'string' && typeof row.title === 'string' && typeof row.body === 'string'
    && typeof row.created_at === 'string' && (row.read_at === null || typeof row.read_at === 'string'))) throw new Error('Invalid notification response');
  return rows as CustomerNotification[];
}

export async function markNotificationsRead(userId: string, ids: readonly string[], signal: AbortSignal): Promise<void> {
  if (ids.length === 0) return;
  const result = await callRpc(userId, 'mark_notifications_read', { p_ids: ids }, signal);
  if (!Number.isSafeInteger(result)) throw new Error('Invalid read response');
}

export async function readCustomerProfile(userId: string, signal: AbortSignal): Promise<StoredCustomerProfile | null> {
  const rows = await readRows(userId, 'customer_profiles?select=display_name,email,address,avatar_path,updated_at', signal, 'Could not read profile');
  if (rows.length === 0) return null;
  const row = rows[0];
  if (rows.length !== 1 || !isRecord(row) || typeof row.display_name !== 'string' || typeof row.email !== 'string' || typeof row.address !== 'string'
    || typeof row.avatar_path !== 'string' || typeof row.updated_at !== 'string') {
    throw new Error('Invalid profile response');
  }
  return { display_name: row.display_name, email: row.email, address: row.address, avatar_path: row.avatar_path, updated_at: row.updated_at };
}

export async function saveCustomerProfile(userId: string, profile: CustomerProfile, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'save_customer_profile', { p_display_name: profile.display_name, p_email: profile.email, p_address: profile.address }, signal);
  if (result !== userId) throw new Error('Invalid profile response');
}

export async function readCustomerSettings(userId: string, signal: AbortSignal): Promise<CustomerSettings | null> {
  const rows = await readRows(userId, `customer_settings?select=${settingKeys.join(',')}`, signal, 'Could not read settings');
  if (rows.length === 0) return null;
  const row = rows[0];
  if (rows.length !== 1 || !isRecord(row) || !settingKeys.every(key => typeof row[key] === 'boolean')) throw new Error('Invalid settings response');
  return { push: row.push as boolean, quotes: row.quotes as boolean, messages: row.messages as boolean, promotions: row.promotions as boolean, reduce_motion: row.reduce_motion as boolean };
}

export async function saveCustomerSettings(userId: string, settings: CustomerSettings, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'save_customer_settings', {
    p_push: settings.push, p_quotes: settings.quotes, p_messages: settings.messages, p_promotions: settings.promotions, p_reduce_motion: settings.reduce_motion,
  }, signal);
  if (result !== userId) throw new Error('Invalid settings response');
}

export async function clearKaelHistory(userId: string, mode: 'client' | 'worker', signal: AbortSignal): Promise<number> {
  const result = await callRpc(userId, 'clear_kael_history', { p_mode: mode }, signal);
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 0) throw new Error('Invalid history response');
  return result;
}

export async function readAccountPhone(userId: string, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'account_phone', {}, signal);
  if (typeof result !== 'string') throw new Error('Invalid phone response');
  return result;
}

export async function readJobWorkerCards(userId: string, signal: AbortSignal): Promise<JobWorkerCard[]> {
  const result = await callRpc(userId, 'job_worker_cards', {}, signal);
  if (!Array.isArray(result) || !result.every(isJobWorkerCard)) throw new Error('Invalid job worker response');
  return result;
}

export async function reviewJobWorker(userId: string, jobId: string, review: JobReview, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'review_job_worker', { p_job_id: jobId, p_rating: review.rating, p_body: review.body, p_tags: review.tags }, signal);
  if (typeof result !== 'string') throw new Error('Invalid review response');
  return result;
}

export async function readSavedWorkers(userId: string, signal: AbortSignal): Promise<SavedWorkerRecord[]> {
  const result = await callRpc(userId, 'saved_workers', {}, signal);
  if (!Array.isArray(result) || !result.every(isSavedWorkerRecord)) throw new Error('Invalid saved worker response');
  return result;
}

export async function saveWorker(userId: string, profileId: string, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'save_worker', { p_profile_id: profileId }, signal);
  if (result !== profileId) throw new Error('Invalid saved worker response');
}

export async function unsaveWorker(userId: string, profileId: string, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'unsave_worker', { p_profile_id: profileId }, signal);
  if (result !== profileId) throw new Error('Invalid saved worker response');
}

export async function submitSupportRequest(userId: string, key: string, subject: string, body: string, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'submit_support_request', { p_submission_key: key, p_subject: subject, p_body: body }, signal);
  if (typeof result !== 'string') throw new Error('Invalid support response');
  return result;
}
