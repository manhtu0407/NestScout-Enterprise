import type { Job, Offer, Pause, WorkerJobCard, WorkerProfileRecord } from '@/features/shared';

import { workerBadgesFor } from './worker-jobs';
import { expiryLabel, nextJobLabel, toWorkerJobs, toWorkerNotificationItems, toWorkerProfileView, type WorkerSnapshot } from './worker-views';

const now = new Date('2026-11-02T10:00:00Z');

const offer: Offer = { invitation_id: 'invite-1', quote_id: 'quote-1', quote_version: 1, scope: 'Sửa vòi', amount_minor: 450000, currency: 'VND', expires_at: '2026-11-02T10:25:00Z', basis: 'local_fixture' };
const job = (id: string, stage: Job['stage'], amount = 300000): Job => ({ job_id: id, stage, version: 2, scope: `Việc ${id}`, amount_minor: amount, currency: 'VND' });
const card = (kind: WorkerJobCard['kind'], ref: string, extra: Partial<WorkerJobCard> = {}): WorkerJobCard => ({
  kind, ref_id: ref, title: `Tiêu đề ${ref}`, description: `Tiêu đề ${ref}\nChi tiết`, photo_count: 2, location: '12 Lê Lợi', customer_label: 'Lan', updated_at: '2026-11-02T08:00:00Z', ...extra,
});
const empty: WorkerSnapshot = { offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] };
const pause = (jobId: string, category: Pause['category'], resume = false): Pause => ({ job_id: jobId, category, prior_stage: 'working', paused_from_version: 1, resume_requested: resume });

test('an offer shows its terms and the time left without the address or the customer name', () => {
  const [view] = toWorkerJobs({ ...empty, offers: [offer] }, [card('offer', 'invite-1', { location: '', customer_label: '' })], now);
  expect(view).toMatchObject({ id: 'invite-1', stage: 'offer', title: 'Tiêu đề invite-1', amountMinor: 450000, photoCount: 2, address: '', clientName: '', expiresLabel: 'Hết hạn sau 25 phút' });
});

test('an offer without a projected card still shows the quoted scope', () => {
  const [view] = toWorkerJobs({ ...empty, offers: [offer] }, [], now);
  expect(view).toMatchObject({ title: 'Sửa vòi', photoCount: 0, description: 'Sửa vòi' });
});

test.each([
  ['assigned', 0],
  ['en_route', 1],
  ['arrived', 2],
] as const)('a %s job sits in the assigned stage at step %i', (stage, step) => {
  const [view] = toWorkerJobs({ ...empty, jobs: [job('a', stage)] }, [card('job', 'a')], now);
  expect(view).toMatchObject({ stage: 'assigned', step, address: '12 Lê Lợi', clientName: 'Khách Lan' });
});

test('a delay report is remembered for travelling jobs and a no-answer report for arrived jobs', () => {
  const reports = [{ id: 'r1', job_id: 'a', kind: 'delay' as const, details: 'x' }, { id: 'r2', job_id: 'b', kind: 'delay' as const, details: 'x' }];
  const views = toWorkerJobs({ ...empty, jobs: [job('a', 'en_route'), job('b', 'arrived')], reports }, [], now);
  expect(views.map(view => view.delayReported)).toEqual([true, false]);
});

test('working jobs are active unless the customer asked for a correction', () => {
  const corrections = [{ job_id: 'b', note: 'Chụp thêm ảnh' }];
  const [active, correcting] = toWorkerJobs({ ...empty, jobs: [job('a', 'working'), job('b', 'working')], corrections }, [], now);
  expect(active).toMatchObject({ stage: 'active', canPropose: true });
  expect(correcting).toMatchObject({ stage: 'review', correctionNote: 'Chụp thêm ảnh', stageLabel: 'Khách yêu cầu chỉnh sửa' });
});

test('a pending scope proposal blocks another proposal', () => {
  const changes = [{ id: 'c', job_id: 'a', sequence: 1, old_scope: 'x', old_amount_minor: 1, new_scope: 'y', new_amount_minor: 2, currency: 'VND' as const, rationale: 'z', decision: 'pending' as const }];
  const [view] = toWorkerJobs({ ...empty, jobs: [job('a', 'working')], changes }, [], now);
  expect(view?.canPropose).toBe(false);
});

test('paused jobs report whether the worker can ask to resume, is waiting or is blocked for safety', () => {
  const pauses = [pause('a', 'ordinary_interruption'), pause('b', 'ordinary_interruption', true), pause('c', 'safety_concern')];
  const views = toWorkerJobs({ ...empty, jobs: [job('a', 'paused'), job('b', 'paused'), job('c', 'paused')], pauses }, [], now);
  expect(views.map(view => view.pause)).toEqual(['paused', 'resume', 'safety']);
  expect(views.every(view => view.stage === 'active')).toBe(true);
});

test('submitted jobs wait for the customer and completed jobs go to history', () => {
  const [submitted, done] = toWorkerJobs({ ...empty, jobs: [job('a', 'submitted'), job('b', 'completed')] }, [card('job', 'a'), card('job', 'b', { updated_at: '2026-11-01T08:00:00Z' })], now);
  expect(submitted).toMatchObject({ stage: 'review', stageLabel: 'Đã nộp 2 giờ trước' });
  expect(done).toMatchObject({ stage: 'done', stageLabel: 'Hôm qua' });
});

test('the amount follows the job, so an approved scope change is already reflected', () => {
  const [view] = toWorkerJobs({ ...empty, jobs: [job('a', 'working', 777000)] }, [], now);
  expect(view?.amountMinor).toBe(777000);
});

test('the title falls back to the scope and the icon follows the description', () => {
  const [view] = toWorkerJobs({ ...empty, jobs: [job('a', 'working')] }, [card('job', 'a', { title: '', description: 'Sửa vòi nước bị rò' })], now);
  expect(view).toMatchObject({ title: 'Việc a', icon: 'drop' });
});

test('expiry labels count down in minutes, hours and days and never go negative', () => {
  expect(expiryLabel('2026-11-02T10:01:00Z', now)).toBe('Hết hạn sau 1 phút');
  expect(expiryLabel('2026-11-02T12:30:00Z', now)).toBe('Hết hạn sau 3 giờ');
  expect(expiryLabel('2026-11-04T11:00:00Z', now)).toBe('Hết hạn sau 3 ngày');
  expect(expiryLabel('2026-11-02T09:59:00Z', now)).toBe('Đã hết hạn');
  expect(expiryLabel('not a date', now)).toBe('Đã hết hạn');
});

test('sidebar badges count offers, assigned jobs and corrections from live data', () => {
  const corrections = [{ job_id: 'c', note: 'Sửa lại' }];
  const views = toWorkerJobs({ ...empty, offers: [offer], jobs: [job('a', 'assigned'), job('b', 'arrived'), job('c', 'working'), job('d', 'completed')], corrections }, [], now);
  expect(workerBadgesFor(views)).toEqual({ 'worker-offers': 1, 'worker-assigned': 2, 'worker-review': 1 });
});

const record: WorkerProfileRecord = {
  profile_id: 'p1', display_name: 'Minh Anh', trade: 'Thợ điện nước', area: 'Quận 7', experience_years: 6, skills: ['Thay vòi'], about: 'Giới thiệu', radius_km: 10,
  accepting_jobs: false, service_ids: ['water', 'electric'], listed: true,
  certificates: [{ id: 'c1', title: 'An toàn điện', status: 'verified' }, { id: 'c2', title: 'Khác', status: 'pending' }, { id: 'c3', title: 'Cũ', status: 'rejected' }],
  review_count: 3, rating_average: 4.7, completed_jobs: 5, strengths: [{ label: 'Đúng giờ', count: 3 }],
  reviews: [{ id: 'v1', author: 'Tú', service: 'Sửa vòi', text: 'Tốt', created_at: '2026-11-02T08:00:00Z' }],
  documents: [], missing_items: [],
};

test('a worker without a profile has no profile view', () => {
  expect(toWorkerProfileView(null, now)).toBeNull();
});

test('a stored profile maps to the view with certificate labels and relative review times', () => {
  const view = toWorkerProfileView(record, now);
  expect(view).toMatchObject({ name: 'Minh Anh', trade: 'Thợ điện nước', area: 'Quận 7', experienceYears: 6, radiusKm: 10, accepting: false, listed: true, reviewCount: 3, ratingAverage: 4.7 });
  expect(view?.serviceIds).toEqual(['water', 'electric']);
  expect(view?.certificates.map(item => item.statusLabel)).toEqual(['Đã xác minh', 'Đang chờ xác minh', 'Chưa được chấp nhận']);
  expect(view?.reviews).toEqual([{ id: 'v1', author: 'Tú', time: '2 giờ trước', service: 'Sửa vòi', text: 'Tốt' }]);
  expect(view?.strengths).toEqual([{ label: 'Đúng giờ', count: 3 }]);
});

test('the next job is the first assigned job, else the first active one, else a placeholder', () => {
  const base = { icon: 'wrench' as const, description: '', clientName: '', photoCount: 0, address: '', amountMinor: 0 };
  const assigned = { ...base, id: 'a', stage: 'assigned' as const, title: 'Sửa ống', area: 'Quận 3', step: 0 };
  const active = { ...base, id: 'b', stage: 'active' as const, title: 'Thay khoá', area: '' };
  expect(nextJobLabel([active, assigned])).toBe('Sửa ống · Quận 3');
  expect(nextJobLabel([active])).toBe('Thay khoá');
  expect(nextJobLabel([])).toBe('Chưa có việc');
});

test('worker notifications point at the tab where the news can be acted on', () => {
  const base = { request_id: 'r1', title: 't', body: 'b', created_at: '2026-11-02T09:00:00Z', read_at: null };
  const items = toWorkerNotificationItems([
    { ...base, id: 'a', kind: 'job_offered' }, { ...base, id: 'b', kind: 'work_approved' }, { ...base, id: 'c', kind: 'revision_requested' },
    { ...base, id: 'd', kind: 'work_disputed' }, { ...base, id: 'e', kind: 'scope_approved' }, { ...base, id: 'f', kind: 'scope_rejected' },
    { ...base, id: 'g', kind: 'resume_agreed' }, { ...base, id: 'h', kind: 'review_received' },
  ], now);
  expect(items.map(item => item.target)).toEqual(['worker-offers', 'worker-history', 'worker-review', 'worker-review', 'worker-active', 'worker-active', 'worker-active', 'worker-reviews']);
  expect(items.every(item => item.requestId === undefined && item.unread)).toBe(true);
});

test('an offer shows the customer preferred visit time without presenting it as an appointment', () => {
  const [view] = toWorkerJobs({ ...empty, offers: [offer] }, [card('offer', 'invite-1', { preferred_visit_at: '2026-11-11T08:00:00.000Z' })], now);
  expect(view?.preferredVisitLabel).toMatch(/15:00/);
  const [plain] = toWorkerJobs({ ...empty, offers: [offer] }, [card('offer', 'invite-1')], now);
  expect(plain?.preferredVisitLabel).toBeUndefined();
});
