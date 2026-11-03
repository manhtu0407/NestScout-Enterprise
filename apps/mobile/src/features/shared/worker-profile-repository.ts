import { callRpc, type SavedWorkerReview, type SavedWorkerStrength } from './customer-data-repository';

export type WorkerCertificateStatus = 'pending' | 'verified' | 'rejected';
export type WorkerCertificateRecord = { id: string; title: string; status: WorkerCertificateStatus };

export type WorkerProfileRecord = {
  profile_id: string;
  display_name: string;
  trade: string;
  area: string;
  experience_years: number;
  skills: string[];
  about: string;
  radius_km: number;
  accepting_jobs: boolean;
  service_ids: string[];
  listed: boolean;
  certificates: WorkerCertificateRecord[];
  review_count: number;
  rating_average: number;
  completed_jobs: number;
  strengths: SavedWorkerStrength[];
  reviews: SavedWorkerReview[];
};

export type WorkerProfileInput = { display_name: string; trade: string; area: string; experience_years: number; about: string; skills: readonly string[] };

const certificateStatuses: readonly string[] = ['pending', 'verified', 'rejected'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function isCertificate(value: unknown): value is WorkerCertificateRecord {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string' && certificateStatuses.includes(String(value.status));
}

function isStrength(value: unknown): value is SavedWorkerStrength {
  return isRecord(value) && typeof value.label === 'string' && Number.isSafeInteger(value.count);
}

function isReview(value: unknown): value is SavedWorkerReview {
  return isRecord(value) && typeof value.id === 'string' && typeof value.author === 'string' && typeof value.service === 'string'
    && typeof value.text === 'string' && typeof value.created_at === 'string';
}

function isProfileRecord(value: unknown): value is WorkerProfileRecord {
  return isRecord(value) && typeof value.profile_id === 'string' && typeof value.display_name === 'string' && typeof value.trade === 'string'
    && typeof value.area === 'string' && Number.isSafeInteger(value.experience_years) && isTextList(value.skills) && typeof value.about === 'string'
    && Number.isSafeInteger(value.radius_km) && typeof value.accepting_jobs === 'boolean' && isTextList(value.service_ids)
    && typeof value.listed === 'boolean' && Array.isArray(value.certificates) && value.certificates.every(isCertificate)
    && Number.isSafeInteger(value.review_count) && typeof value.rating_average === 'number' && Number.isSafeInteger(value.completed_jobs)
    && Array.isArray(value.strengths) && value.strengths.every(isStrength) && Array.isArray(value.reviews) && value.reviews.every(isReview);
}

export async function readWorkerProfile(userId: string, signal: AbortSignal): Promise<WorkerProfileRecord | null> {
  const result = await callRpc(userId, 'my_worker_profile', {}, signal);
  if (!Array.isArray(result) || result.length > 1 || !result.every(isProfileRecord)) throw new Error('Invalid worker profile response');
  return result[0] ?? null;
}

export async function saveWorkerProfile(userId: string, input: WorkerProfileInput, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'save_worker_profile', {
    p_display_name: input.display_name, p_trade: input.trade, p_area: input.area, p_experience_years: input.experience_years,
    p_about: input.about, p_skills: input.skills,
  }, signal);
  if (typeof result !== 'string') throw new Error('Invalid worker profile response');
  return result;
}

export async function saveWorkerCoverage(userId: string, radiusKm: number, serviceIds: readonly string[], signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'save_worker_coverage', { p_radius_km: radiusKm, p_service_ids: serviceIds }, signal);
  if (typeof result !== 'string') throw new Error('Invalid worker coverage response');
}

export async function setWorkerAccepting(userId: string, accepting: boolean, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'set_worker_accepting', { p_accepting: accepting }, signal);
  if (result !== accepting) throw new Error('Invalid worker availability response');
}

export async function addWorkerCertificate(userId: string, title: string, signal: AbortSignal): Promise<string> {
  const result = await callRpc(userId, 'add_worker_certificate', { p_title: title }, signal);
  if (typeof result !== 'string') throw new Error('Invalid certificate response');
  return result;
}

export async function removeWorkerCertificate(userId: string, id: string, signal: AbortSignal): Promise<void> {
  const result = await callRpc(userId, 'remove_worker_certificate', { p_id: id }, signal);
  if (result !== id) throw new Error('Invalid certificate response');
}
