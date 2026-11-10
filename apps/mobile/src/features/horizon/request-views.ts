import type { CustomerActivity, CustomerJob, CustomerNotification, IconName, JobWorkerCard, NotificationKind, SavedWorkerRecord, ServiceQuote, ServiceRequest as RequestRecord } from '@/features/shared';

import type { NotificationItem, QuoteItem, QuoteStatus, SavedWorker } from './content';
import type { RecentSession } from './recent-session';
import { workflowSteps, type PhotoSource, type RequestStage, type ServiceRequest } from './requests-screen';

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;
const maxTitleLength = 48;

export type RequestProgress = { step: number; stage: RequestStage; status: string; nextAction: string; quoteCount: number };

const jobStatus: Record<string, { status: string; nextAction: string }> = {
  assigned: { status: 'Đã có thợ nhận việc', nextAction: 'Thợ sẽ liên hệ và di chuyển tới chỗ bạn.' },
  en_route: { status: 'Thợ đang trên đường tới', nextAction: 'Chờ thợ đến nơi.' },
  arrived: { status: 'Thợ đã đến nơi', nextAction: 'Thợ sắp bắt đầu công việc.' },
  working: { status: 'Đang thực hiện', nextAction: 'Thợ đang làm việc.' },
  paused: { status: 'Công việc đang tạm dừng', nextAction: 'Chờ thợ tiếp tục hoặc xác nhận với bạn.' },
  submitted: { status: 'Chờ bạn nghiệm thu', nextAction: 'Xem kết quả thợ gửi và quyết định nghiệm thu.' },
  completed: { status: 'Đã hoàn tất', nextAction: 'Công việc đã hoàn tất.' },
};

const iconKeywords: readonly { pattern: RegExp; icon: IconName }[] = [
  { pattern: /điện|bóng đèn|ổ cắm|công tắc/i, icon: 'bolt' },
  { pattern: /nước|vòi|ống|bồn|toilet|bồn cầu/i, icon: 'drop' },
  { pattern: /sofa|ghế|nệm/i, icon: 'sofa' },
  { pattern: /vệ sinh|dọn|lau/i, icon: 'home' },
  { pattern: /lắp|sửa|thay|khoá|khóa/i, icon: 'wrench' },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function relativeTimeLabel(iso: string, now: Date): string {
  const then = new Date(iso);
  const elapsed = now.getTime() - then.getTime();
  if (Number.isNaN(elapsed)) return '';
  if (elapsed < minuteMs) return 'Vừa xong';
  if (elapsed < hourMs) return `${Math.floor(elapsed / minuteMs)} phút trước`;
  if (elapsed < dayMs) return `${Math.floor(elapsed / hourMs)} giờ trước`;
  if (elapsed < 2 * dayMs) return 'Hôm qua';
  if (elapsed < 7 * dayMs) return `${Math.floor(elapsed / dayMs)} ngày trước`;
  return `${pad(then.getDate())}/${pad(then.getMonth() + 1)}/${then.getFullYear()}`;
}

export function requestTitle(description: string): string {
  const firstLine = description.split('\n').map(line => line.trim()).find(line => line.length > 0) ?? '';
  return firstLine.length > maxTitleLength ? `${firstLine.slice(0, maxTitleLength - 1).trimEnd()}…` : firstLine;
}

export function requestIcon(description: string): IconName {
  return iconKeywords.find(entry => entry.pattern.test(description))?.icon ?? 'requests';
}

function isExpired(quote: ServiceQuote, now: Date): boolean {
  return quote.accepted_at === null && quote.rejected_at === null && new Date(quote.expires_at).getTime() <= now.getTime();
}

function latestQuote(quotes: readonly ServiceQuote[]): ServiceQuote | undefined {
  return quotes.reduce<ServiceQuote | undefined>((latest, quote) => (!latest || quote.version > latest.version ? quote : latest), undefined);
}

function stageFor(step: number): RequestStage {
  if (step >= workflowSteps.length) return 'done';
  return step >= 4 ? 'active' : 'waiting';
}

export function deriveRequestProgress(quotes: readonly ServiceQuote[], job: CustomerJob | undefined, now: Date): RequestProgress {
  if (job) {
    const copy = jobStatus[job.stage] ?? { status: 'Đang xử lý', nextAction: 'Hệ thống đang cập nhật tiến trình.' };
    const step = job.stage === 'completed' ? workflowSteps.length : job.stage === 'submitted' ? 5 : 4;
    return { step, stage: stageFor(step), quoteCount: 0, ...copy };
  }
  if (quotes.some(quote => quote.accepted_at !== null)) {
    return { step: 3, stage: 'waiting', quoteCount: 0, status: 'Đang ghép thợ', nextAction: 'Chờ thợ nhận việc. Bạn đã chấp nhận báo giá.' };
  }
  const latest = latestQuote(quotes);
  if (!latest) return { step: 1, stage: 'waiting', quoteCount: 0, status: 'Đang chờ báo giá', nextAction: 'Báo giá sẽ hiện ở mục Báo giá khi có.' };
  if (latest.rejected_at !== null) return { step: 1, stage: 'waiting', quoteCount: 0, status: 'Bạn đã từ chối báo giá', nextAction: 'Chờ báo giá mới.' };
  if (isExpired(latest, now)) return { step: 1, stage: 'waiting', quoteCount: 0, status: 'Báo giá đã hết hạn', nextAction: 'Chờ báo giá mới.' };
  return { step: 1, stage: 'waiting', quoteCount: 1, status: 'Có báo giá mới', nextAction: 'Xem báo giá và quyết định.' };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}

type Records = { requests: readonly RequestRecord[]; quotes: readonly ServiceQuote[]; activity: CustomerActivity; workers?: readonly JobWorkerCard[]; photos?: ReadonlyMap<string, readonly PhotoSource[]> };

function progressByRequest({ requests, quotes, activity }: Records, now: Date): Map<string, RequestProgress> {
  const quotesByRequest = groupBy(quotes, quote => quote.request_id);
  const jobByRequest = new Map(activity.jobs.map(job => [job.request_id, job]));
  return new Map(requests.map(request => [request.id, deriveRequestProgress(quotesByRequest.get(request.id) ?? [], jobByRequest.get(request.id), now)]));
}

export function toRequestViews(records: Records, now: Date): ServiceRequest[] {
  const progress = progressByRequest(records, now);
  const workerByRequest = new Map((records.workers ?? []).map(card => [card.request_id, card]));
  return records.requests.map(request => {
    const current = progress.get(request.id) as RequestProgress;
    const sent = relativeTimeLabel(request.created_at, now);
    const card = workerByRequest.get(request.id);
    return {
      id: request.id,
      title: requestTitle(request.description),
      icon: requestIcon(request.description),
      meta: `Gửi ${sent.toLocaleLowerCase('vi-VN')}`,
      status: current.status,
      stage: current.stage,
      quoteCount: current.quoteCount > 0 ? current.quoteCount : undefined,
      step: current.step,
      nextAction: current.nextAction,
      description: request.description,
      location: request.location || undefined,
      photoCount: records.photos ? (records.photos.get(request.id)?.length ?? 0) : undefined,
      photos: records.photos ? (records.photos.get(request.id) ?? []) : undefined,
      createdLabel: sent,
      preferredVisitAt: request.preferred_visit_at ?? null,
      worker: card ? { jobId: card.job_id, profileId: card.profile_id, name: card.display_name, saved: card.saved, rating: card.review_rating } : undefined,
    };
  });
}

export function toRecentSessions(records: Records, pinnedIds: ReadonlySet<string>, now: Date): RecentSession[] {
  const progress = progressByRequest(records, now);
  return records.requests.map(request => ({
    id: request.id,
    title: requestTitle(request.description),
    preview: progress.get(request.id)?.status ?? '',
    timeLabel: relativeTimeLabel(request.created_at, now),
    phase: null,
    pinned: pinnedIds.has(request.id),
  }));
}

function expiryLabel(quote: ServiceQuote, status: QuoteStatus, superseded: ServiceQuote | undefined, expired: boolean, now: Date): string {
  if (status === 'accepted') return 'Đã chấp nhận';
  if (status === 'rejected') return 'Đã từ chối';
  if (superseded) return `Đã được thay bằng phiên bản ${superseded.version}`;
  if (expired) return 'Đã hết hạn';
  const expires = new Date(quote.expires_at);
  const clock = `${pad(expires.getHours())}:${pad(expires.getMinutes())}`;
  const sameDay = expires.toDateString() === now.toDateString();
  const nextDay = expires.toDateString() === new Date(now.getTime() + dayMs).toDateString();
  if (sameDay) return `Hiệu lực đến ${clock} hôm nay`;
  if (nextDay) return `Hiệu lực đến ${clock} ngày mai`;
  return `Hiệu lực đến ${clock} ${pad(expires.getDate())}/${pad(expires.getMonth() + 1)}`;
}

export function toQuoteItems(requests: readonly RequestRecord[], quotes: readonly ServiceQuote[], now: Date): QuoteItem[] {
  const requestById = new Map(requests.map(request => [request.id, request]));
  const quotesByRequest = groupBy(quotes, quote => quote.request_id);
  return quotes.flatMap(quote => {
    const request = requestById.get(quote.request_id);
    if (!request) return [];
    const status: QuoteStatus = quote.accepted_at !== null ? 'accepted' : quote.rejected_at !== null ? 'rejected' : 'pending';
    const latest = latestQuote(quotesByRequest.get(quote.request_id) ?? []);
    const superseded = latest && latest.version > quote.version ? latest : undefined;
    const expired = isExpired(quote, now);
    return [{
      id: quote.id,
      requestId: quote.request_id,
      requestTitle: requestTitle(request.description),
      version: quote.version,
      scope: quote.scope,
      amountMinor: quote.amount_minor,
      currency: quote.currency,
      expiresLabel: expiryLabel(quote, status, superseded, expired, now),
      expired,
      basis: quote.basis,
      status,
      time: relativeTimeLabel(request.created_at, now),
    }];
  });
}

export function countActionableQuotes(requests: readonly RequestRecord[], quotes: readonly ServiceQuote[], now: Date): number {
  const requestIds = new Set(requests.map(request => request.id));
  const latestByRequest = new Map<string, ServiceQuote>();
  for (const quote of quotes) {
    const current = latestByRequest.get(quote.request_id);
    if (requestIds.has(quote.request_id) && (!current || quote.version > current.version)) latestByRequest.set(quote.request_id, quote);
  }
  return [...latestByRequest.values()].filter(quote => quote.accepted_at === null && quote.rejected_at === null && !isExpired(quote, now)).length;
}

const notificationIcons: Record<NotificationKind, IconName> = {
  quote_received: 'receipt',
  job_assigned: 'briefcase',
  job_progress: 'clock',
  work_submitted: 'check',
  job_completed: 'check',
  scope_proposed: 'receipt',
  job_offered: 'bolt',
  work_approved: 'check',
  revision_requested: 'clock',
  work_disputed: 'help',
  scope_approved: 'receipt',
  scope_rejected: 'receipt',
  resume_agreed: 'briefcase',
  review_received: 'star',
  change_requested: 'clock',
  change_decided: 'clock',
};

export function toNotificationItems(notifications: readonly CustomerNotification[], now: Date): NotificationItem[] {
  return notifications.map(item => ({
    id: item.id,
    icon: notificationIcons[item.kind],
    title: item.title,
    body: item.body,
    time: relativeTimeLabel(item.created_at, now),
    unread: item.read_at === null,
    today: new Date(item.created_at).toDateString() === now.toDateString(),
    requestId: item.request_id,
  }));
}

export function countUnreadNotifications(notifications: readonly CustomerNotification[]): number {
  return notifications.filter(item => item.read_at === null).length;
}

function savedLabel(iso: string, now: Date): string {
  const elapsed = relativeTimeLabel(iso, now);
  return elapsed === 'Vừa xong' ? 'Vừa lưu' : `Đã lưu ${elapsed.toLocaleLowerCase('vi-VN')}`;
}

export function toSavedWorkers(records: readonly SavedWorkerRecord[], now: Date): SavedWorker[] {
  return records.map(record => ({
    id: record.profile_id,
    name: record.display_name,
    trade: record.trade,
    area: record.area,
    savedLabel: savedLabel(record.saved_at, now),
    experienceYears: record.experience_years,
    skills: record.skills,
    serviceAreas: record.service_areas,
    reviewCount: record.review_count,
    ratingAverage: record.rating_average,
    completedJobs: record.completed_jobs,
    strengths: record.strengths,
    reviews: record.reviews.map(review => ({ id: review.id, author: review.author, time: relativeTimeLabel(review.created_at, now), service: review.service, text: review.text })),
    basis: record.basis,
  }));
}
