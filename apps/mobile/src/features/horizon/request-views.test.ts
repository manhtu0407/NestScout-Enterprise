import type { CustomerActivity, CustomerJob, CustomerNotification, SavedWorkerRecord, ServiceQuote, ServiceRequest } from '@/features/shared';

import { countActionableQuotes, countUnreadNotifications, deriveRequestProgress, relativeTimeLabel, requestIcon, requestTitle, toNotificationItems, toQuoteItems, toRecentSessions, toRequestViews, toSavedWorkers } from './request-views';

const now = new Date('2026-11-02T10:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const hoursAhead = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

const request: ServiceRequest = { id: 'r1', description: 'Sửa vòi nước bồn rửa\nVòi bị rò rỉ ở chân', location: '', created_at: hoursAgo(3) };

function quote(overrides: Partial<ServiceQuote> = {}): ServiceQuote {
  return { id: 'q1', request_id: 'r1', version: 1, scope: 'Thay vòi', amount_minor: 450000, currency: 'VND', expires_at: hoursAhead(5), basis: 'local_fixture', accepted_at: null, rejected_at: null, ...overrides };
}

function job(stage: string): CustomerJob {
  return { id: 'j1', request_id: 'r1', stage, version: 2 };
}

const emptyActivity: CustomerActivity = { jobs: [], submissions: [], cases: [], changes: [], reports: [], pauses: [] };

test('relative labels move from minutes to dates', () => {
  expect(relativeTimeLabel(hoursAgo(0), now)).toBe('Vừa xong');
  expect(relativeTimeLabel(new Date(now.getTime() - 5 * 60_000).toISOString(), now)).toBe('5 phút trước');
  expect(relativeTimeLabel(hoursAgo(3), now)).toBe('3 giờ trước');
  expect(relativeTimeLabel(hoursAgo(30), now)).toBe('Hôm qua');
  expect(relativeTimeLabel(hoursAgo(24 * 4), now)).toBe('4 ngày trước');
  expect(relativeTimeLabel(hoursAgo(24 * 20), now)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  expect(relativeTimeLabel('not a date', now)).toBe('');
});

test('title is the first non-empty line and is truncated', () => {
  expect(requestTitle('\n  Sửa vòi nước  \nchi tiết')).toBe('Sửa vòi nước');
  const long = requestTitle('a'.repeat(80));
  expect(long.endsWith('…')).toBe(true);
  expect(long.length).toBeLessThanOrEqual(48);
});

test('icon follows the service keyword and falls back to requests', () => {
  expect(requestIcon('Thay bóng đèn')).toBe('bolt');
  expect(requestIcon('Vòi nước rò')).toBe('drop');
  expect(requestIcon('Giặt sofa')).toBe('sofa');
  expect(requestIcon('Việc khác')).toBe('requests');
});

test('a request without quotes waits for a quote', () => {
  expect(deriveRequestProgress([], undefined, now)).toMatchObject({ step: 1, stage: 'waiting', quoteCount: 0, status: 'Đang chờ báo giá' });
});

test('an open quote needs the customer and counts once', () => {
  expect(deriveRequestProgress([quote()], undefined, now)).toMatchObject({ step: 1, stage: 'waiting', quoteCount: 1, status: 'Có báo giá mới' });
});

test('only the latest quote version decides the state', () => {
  const older = quote({ id: 'q1', version: 1, rejected_at: hoursAgo(2) });
  const newer = quote({ id: 'q2', version: 2 });
  expect(deriveRequestProgress([older, newer], undefined, now).quoteCount).toBe(1);
  expect(deriveRequestProgress([quote({ version: 1 }), quote({ id: 'q2', version: 2, rejected_at: hoursAgo(1) })], undefined, now).status).toBe('Bạn đã từ chối báo giá');
});

test('an expired latest quote is not actionable', () => {
  expect(deriveRequestProgress([quote({ expires_at: hoursAgo(1) })], undefined, now)).toMatchObject({ quoteCount: 0, status: 'Báo giá đã hết hạn' });
});

test('an accepted quote without a job is matching a worker', () => {
  expect(deriveRequestProgress([quote({ accepted_at: hoursAgo(1) })], undefined, now)).toMatchObject({ step: 3, stage: 'waiting', status: 'Đang ghép thợ' });
});

test('job stages map to active, review and done', () => {
  expect(deriveRequestProgress([quote({ accepted_at: hoursAgo(2) })], job('working'), now)).toMatchObject({ step: 4, stage: 'active', status: 'Đang thực hiện' });
  expect(deriveRequestProgress([], job('paused'), now)).toMatchObject({ step: 4, stage: 'active' });
  expect(deriveRequestProgress([], job('submitted'), now)).toMatchObject({ step: 5, stage: 'active', status: 'Chờ bạn nghiệm thu' });
  expect(deriveRequestProgress([], job('completed'), now)).toMatchObject({ step: 6, stage: 'done' });
});

test('request views carry derived progress and omit unavailable fields', () => {
  const views = toRequestViews({ requests: [request], quotes: [quote()], activity: emptyActivity }, now);
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({ id: 'r1', title: 'Sửa vòi nước bồn rửa', icon: 'drop', status: 'Có báo giá mới', quoteCount: 1, step: 1, createdLabel: '3 giờ trước', meta: 'Gửi 3 giờ trước' });
  expect(views[0]?.location).toBeUndefined();
  expect(views[0]?.photoCount).toBeUndefined();
  expect(views[0]?.worker).toBeUndefined();
});

test('request views carry the attached photos and their count when photos are known', () => {
  const source = { uri: 'https://x/a.jpg', headers: { Authorization: 'Bearer t' } };
  const [counted] = toRequestViews({ requests: [request], quotes: [], activity: emptyActivity, photos: new Map([['r1', [source, source, source]]]) }, now);
  expect(counted?.photoCount).toBe(3);
  expect(counted?.photos).toEqual([source, source, source]);
  const [none] = toRequestViews({ requests: [request], quotes: [], activity: emptyActivity, photos: new Map() }, now);
  expect(none?.photoCount).toBe(0);
  expect(none?.photos).toEqual([]);
});

test('request views carry the stored location and the worker of the job', () => {
  const located: ServiceRequest = { ...request, location: '12 Nguyễn Huệ, Quận 1' };
  const workers = [
    { job_id: 'j1', request_id: 'r1', profile_id: 'p1', display_name: 'Thợ Minh', saved: true, review_rating: 4 },
    { job_id: 'j9', request_id: 'other', profile_id: 'p9', display_name: 'Thợ khác', saved: false, review_rating: null },
  ];
  const [view] = toRequestViews({ requests: [located], quotes: [], activity: emptyActivity, workers }, now);
  expect(view?.location).toBe('12 Nguyễn Huệ, Quận 1');
  expect(view?.worker).toEqual({ jobId: 'j1', profileId: 'p1', name: 'Thợ Minh', saved: true, rating: 4 });
});

test('recent sessions mark pinned requests and keep server order', () => {
  const second: ServiceRequest = { id: 'r2', description: 'Vệ sinh sofa', location: '', created_at: hoursAgo(30) };
  const sessions = toRecentSessions({ requests: [request, second], quotes: [], activity: emptyActivity }, new Set(['r2']), now);
  expect(sessions.map(session => session.id)).toEqual(['r1', 'r2']);
  expect(sessions.map(session => session.pinned)).toEqual([false, true]);
  expect(sessions[1]).toMatchObject({ title: 'Vệ sinh sofa', preview: 'Đang chờ báo giá', timeLabel: 'Hôm qua', phase: null });
});

test('quote items expose status, expiry and superseded versions', () => {
  const accepted = quote({ id: 'qa', version: 1, accepted_at: hoursAgo(1) });
  const superseded = quote({ id: 'qs', version: 1 });
  const latest = quote({ id: 'ql', version: 2 });
  const items = toQuoteItems([request], [superseded, latest], now);
  expect(items.find(item => item.id === 'qs')).toMatchObject({ expiresLabel: 'Đã được thay bằng phiên bản 2', status: 'pending', expired: false });
  expect(items.find(item => item.id === 'ql')?.expiresLabel).toMatch(/^Hiệu lực đến /);
  expect(toQuoteItems([request], [accepted], now)[0]).toMatchObject({ status: 'accepted', expiresLabel: 'Đã chấp nhận', basis: 'local_fixture', amountMinor: 450000 });
  expect(toQuoteItems([request], [quote({ rejected_at: hoursAgo(1) })], now)[0]).toMatchObject({ status: 'rejected', expiresLabel: 'Đã từ chối' });
  expect(toQuoteItems([request], [quote({ expires_at: hoursAgo(1) })], now)[0]).toMatchObject({ expired: true, expiresLabel: 'Đã hết hạn' });
});

test('quotes for unknown requests are dropped', () => {
  expect(toQuoteItems([request], [quote({ request_id: 'other' })], now)).toEqual([]);
});

test('actionable quote count uses the latest version per known request', () => {
  const second: ServiceRequest = { id: 'r2', description: 'Lắp đèn', location: '', created_at: hoursAgo(2) };
  const quotes = [
    quote({ id: 'a1', version: 1 }),
    quote({ id: 'a2', version: 2, rejected_at: hoursAgo(1) }),
    quote({ id: 'b1', request_id: 'r2' }),
    quote({ id: 'c1', request_id: 'unknown' }),
  ];
  expect(countActionableQuotes([request, second], quotes, now)).toBe(1);
});

function notification(overrides: Partial<CustomerNotification> = {}): CustomerNotification {
  return { id: 'n1', kind: 'quote_received', request_id: 'r1', title: 'Báo giá mới', body: 'Nội dung', created_at: hoursAgo(1), read_at: null, ...overrides };
}

test('notification items carry the request, unread state and icon', () => {
  const items = toNotificationItems([notification(), notification({ id: 'n2', kind: 'job_completed', read_at: hoursAgo(0), created_at: hoursAgo(40) })], now);
  expect(items[0]).toMatchObject({ id: 'n1', icon: 'receipt', unread: true, requestId: 'r1', time: '1 giờ trước', today: true });
  expect(items[1]).toMatchObject({ id: 'n2', icon: 'check', unread: false, today: false, time: 'Hôm qua' });
});

test('unread notifications are counted', () => {
  expect(countUnreadNotifications([notification(), notification({ id: 'n2', read_at: hoursAgo(0) }), notification({ id: 'n3' })])).toBe(2);
});

function savedRecord(overrides: Partial<SavedWorkerRecord> = {}): SavedWorkerRecord {
  return {
    profile_id: 'p1', display_name: 'Thợ Minh', trade: 'Thợ nước', area: 'Quận 7', experience_years: 8, skills: ['Sửa vòi'], service_areas: ['Quận 7'],
    saved_at: hoursAgo(30), review_count: 2, rating_average: 4.5, completed_jobs: 3,
    strengths: [{ label: 'Đúng giờ', count: 2 }],
    reviews: [{ id: 'v1', author: 'Chị A.', service: 'Sửa vòi', text: 'Tốt', created_at: hoursAgo(50) }], basis: 'local_fixture', ...overrides,
  };
}

test('saved workers use the opaque profile id and relative labels', () => {
  const [worker] = toSavedWorkers([savedRecord()], now);
  expect(worker).toMatchObject({ id: 'p1', name: 'Thợ Minh', savedLabel: 'Đã lưu hôm qua', experienceYears: 8, reviewCount: 2, ratingAverage: 4.5, completedJobs: 3 });
  expect(worker?.reviews).toEqual([{ id: 'v1', author: 'Chị A.', time: '2 ngày trước', service: 'Sửa vòi', text: 'Tốt' }]);
});

test('a worker saved a moment ago reads as just saved', () => {
  expect(toSavedWorkers([savedRecord({ saved_at: hoursAgo(0) })], now)[0]?.savedLabel).toBe('Vừa lưu');
});
