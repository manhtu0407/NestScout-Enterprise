import { kaelPhaseEntries, kaelPhases } from './kael-phase';
import type { KaelPhase } from './kael-phase';
import { workflowSteps } from './requests-screen';
import type { WorkerJob, WorkerJobStage } from './worker-jobs';
import type { ServiceRequest } from './requests-screen';

export type KaelProgress = { hint: string; steps: readonly string[]; current: number; finished: boolean; spinnerLabel: string };

export function progressForPhase(phase: KaelPhase | null): KaelProgress | null {
  if (phase === null) return null;
  const current = kaelPhases.indexOf(phase);
  const finished = phase === 'completed';
  const step = `Bước ${current + 1} / ${kaelPhases.length}`;
  return {
    hint: finished ? `${step} · Chưa xác nhận thanh toán` : step,
    steps: kaelPhaseEntries.map(entry => entry.control),
    current,
    finished,
    spinnerLabel: finished ? 'Công việc đã hoàn tất, chưa xác nhận thanh toán' : 'Đang tiến hành',
  };
}

export function pickProgressRequest(requests: readonly ServiceRequest[]): ServiceRequest | null {
  return requests.find(request => request.stage !== 'done') ?? requests[0] ?? null;
}

export function progressForRequest(request: Pick<ServiceRequest, 'title' | 'status' | 'step'>): KaelProgress {
  const finished = request.step >= workflowSteps.length;
  return {
    hint: `${request.title} · ${request.status}`,
    steps: workflowSteps,
    current: Math.min(request.step, workflowSteps.length),
    finished,
    spinnerLabel: finished ? 'Yêu cầu đã hoàn tất' : 'Đang tiến hành',
  };
}

const workerSteps: readonly string[] = ['Lời mời', 'Đã nhận', 'Đang làm', 'Chờ duyệt', 'Hoàn tất'];
const workerStageOrder: readonly WorkerJobStage[] = ['offer', 'assigned', 'active', 'review', 'done'];
const workerPriority: readonly WorkerJobStage[] = ['active', 'review', 'assigned', 'offer', 'done'];

export function pickProgressJob(jobs: readonly WorkerJob[]): WorkerJob | null {
  for (const stage of workerPriority) {
    const job = jobs.find(candidate => candidate.stage === stage);
    if (job) return job;
  }
  return null;
}

export function progressForWorkerJob(job: Pick<WorkerJob, 'title' | 'stage' | 'stageLabel'>): KaelProgress {
  const finished = job.stage === 'done';
  const label = job.stageLabel ?? workerSteps[workerStageOrder.indexOf(job.stage)] ?? '';
  return {
    hint: `${job.title} · ${label}`,
    steps: workerSteps,
    current: finished ? workerSteps.length : workerStageOrder.indexOf(job.stage),
    finished,
    spinnerLabel: finished ? 'Việc đã hoàn tất' : 'Đang tiến hành',
  };
}
