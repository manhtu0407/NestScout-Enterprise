import type { CustomerNotification, Correction, Job, JobReport, NotificationKind, Offer, Pause, ScopeChange, WorkerJobCard, WorkerProfileRecord } from '@/features/shared';
import type { NotificationItem } from './content';

import { relativeTimeLabel, requestIcon, toNotificationItems } from './request-views';
import type { WorkerJob, WorkerJobStage } from './worker-jobs';
import { certificateStatusLabels, type WorkerProfileView } from './worker-profile';

export type WorkerSnapshot = {
  offers: readonly Offer[];
  jobs: readonly Job[];
  changes: readonly ScopeChange[];
  reports: readonly JobReport[];
  corrections: readonly Correction[];
  pauses: readonly Pause[];
};

const minuteMs = 60_000;
const assignedSteps: Readonly<Record<string, number>> = { assigned: 0, en_route: 1, arrived: 2 };

export function expiryLabel(expiresAt: string, now: Date): string {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(remaining) || remaining <= 0) return 'Đã hết hạn';
  const minutes = Math.ceil(remaining / minuteMs);
  if (minutes < 60) return `Hết hạn sau ${minutes} phút`;
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? `Hết hạn sau ${hours} giờ` : `Hết hạn sau ${Math.ceil(hours / 24)} ngày`;
}

function customerName(label: string): string {
  return label ? `Khách ${label}` : 'Khách hàng';
}

function offerView(offer: Offer, card: WorkerJobCard | undefined, now: Date): WorkerJob {
  const description = card?.description ?? offer.scope;
  return {
    id: offer.invitation_id,
    stage: 'offer',
    title: card?.title || offer.scope,
    icon: requestIcon(description),
    area: '',
    description,
    clientName: '',
    photoCount: card?.photo_count ?? 0,
    address: '',
    amountMinor: offer.amount_minor,
    expiresLabel: expiryLabel(offer.expires_at, now),
  };
}

function jobView(job: Job, card: WorkerJobCard | undefined, snapshot: WorkerSnapshot, now: Date): WorkerJob {
  const description = card?.description ?? job.scope;
  const correction = snapshot.corrections.find(item => item.job_id === job.job_id);
  const pause = snapshot.pauses.find(item => item.job_id === job.job_id);
  const reports = snapshot.reports.filter(item => item.job_id === job.job_id);
  const stamped = card?.updated_at ? relativeTimeLabel(card.updated_at, now) : '';
  const base = {
    id: job.job_id,
    title: card?.title || job.scope,
    icon: requestIcon(description),
    area: card?.location ?? '',
    description,
    clientName: customerName(card?.customer_label ?? ''),
    photoCount: card?.photo_count ?? 0,
    address: card?.location ?? '',
    amountMinor: job.amount_minor,
  };
  const pendingChange = snapshot.changes.some(change => change.job_id === job.job_id && change.decision === 'pending');
  let stage: WorkerJobStage;
  switch (job.stage) {
    case 'assigned':
    case 'en_route':
    case 'arrived':
      return {
        ...base,
        stage: 'assigned',
        step: assignedSteps[job.stage],
        delayReported: reports.some(report => report.kind === (job.stage === 'arrived' ? 'customer_absent' : 'delay')),
      };
    case 'paused':
      return {
        ...base,
        stage: 'active',
        stageLabel: stamped ? `Tạm dừng ${stamped.toLocaleLowerCase('vi')}` : 'Đang tạm dừng',
        pause: pause?.category === 'safety_concern' ? 'safety' : pause?.resume_requested ? 'resume' : 'paused',
      };
    case 'working':
      stage = correction ? 'review' : 'active';
      return {
        ...base,
        stage,
        stageLabel: correction ? 'Khách yêu cầu chỉnh sửa' : stamped ? `Bắt đầu ${stamped.toLocaleLowerCase('vi')}` : undefined,
        correctionNote: correction?.note,
        canPropose: !pendingChange,
      };
    case 'submitted':
      return { ...base, stage: 'review', stageLabel: stamped ? `Đã nộp ${stamped.toLocaleLowerCase('vi')}` : 'Đã nộp' };
    default:
      return { ...base, stage: 'done', stageLabel: stamped };
  }
}

export function toWorkerJobs(snapshot: WorkerSnapshot, cards: readonly WorkerJobCard[], now: Date): WorkerJob[] {
  const offerCards = new Map(cards.filter(card => card.kind === 'offer').map(card => [card.ref_id, card]));
  const jobCards = new Map(cards.filter(card => card.kind === 'job').map(card => [card.ref_id, card]));
  return [
    ...snapshot.offers.map(offer => offerView(offer, offerCards.get(offer.invitation_id), now)),
    ...snapshot.jobs.map(job => jobView(job, jobCards.get(job.job_id), snapshot, now)),
  ];
}

export function toWorkerProfileView(record: WorkerProfileRecord | null, now: Date): WorkerProfileView | null {
  if (record === null) return null;
  return {
    name: record.display_name,
    trade: record.trade,
    area: record.area,
    experienceYears: record.experience_years,
    about: record.about,
    skills: record.skills,
    radiusKm: record.radius_km,
    accepting: record.accepting_jobs,
    serviceIds: record.service_ids,
    listed: record.listed,
    certificates: record.certificates.map(item => ({ id: item.id, title: item.title, status: item.status, statusLabel: certificateStatusLabels[item.status] })),
    documents: record.documents.map(item => ({ id: item.id, kind: item.kind, title: item.title, status: item.status, statusLabel: certificateStatusLabels[item.status] })),
    missing: record.missing_items,
    reviewCount: record.review_count,
    ratingAverage: record.rating_average,
    strengths: record.strengths,
    reviews: record.reviews.map(review => ({ id: review.id, author: review.author, time: relativeTimeLabel(review.created_at, now), service: review.service, text: review.text })),
  };
}

export function nextJobLabel(jobs: readonly WorkerJob[]): string {
  const next = jobs.find(job => job.stage === 'assigned') ?? jobs.find(job => job.stage === 'active');
  if (!next) return 'Chưa có việc';
  return next.area ? `${next.title} · ${next.area}` : next.title;
}

const notificationTargets: Readonly<Partial<Record<NotificationKind, string>>> = {
  job_offered: 'worker-offers',
  work_approved: 'worker-history',
  revision_requested: 'worker-review',
  work_disputed: 'worker-review',
  scope_approved: 'worker-active',
  scope_rejected: 'worker-active',
  resume_agreed: 'worker-active',
  review_received: 'worker-reviews',
};

export function toWorkerNotificationItems(notifications: readonly CustomerNotification[], now: Date): NotificationItem[] {
  return toNotificationItems(notifications, now).map(({ id, icon, title, body, time, unread, today }, index) => {
    const target = notificationTargets[notifications[index]?.kind ?? 'job_offered'];
    return target === undefined ? { id, icon, title, body, time, unread, today } : { id, icon, title, body, time, unread, today, target };
  });
}
