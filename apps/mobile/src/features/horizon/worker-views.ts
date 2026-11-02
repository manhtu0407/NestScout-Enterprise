import type { Correction, Job, JobReport, Offer, Pause, ScopeChange, WorkerJobCard } from '@/features/shared';

import { relativeTimeLabel, requestIcon } from './request-views';
import type { WorkerJob, WorkerJobStage } from './worker-jobs';

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
