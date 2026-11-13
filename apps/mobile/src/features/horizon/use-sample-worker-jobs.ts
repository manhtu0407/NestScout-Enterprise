import { useCallback, useState } from 'react';

import { sampleWorkerJobs, workerJobSteps, type WorkerCommand, type WorkerJob } from './worker-jobs';

type Change = Partial<Pick<WorkerJob, 'stage' | 'step' | 'stageLabel' | 'pause' | 'delayReported' | 'correctionNote'>>;

export function useSampleWorkerJobs(initial: readonly WorkerJob[] = sampleWorkerJobs) {
  const [changes, setChanges] = useState<Readonly<Record<string, Change>>>({});
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const jobs = initial.filter(job => !dismissed.includes(job.id)).map(job => ({ ...job, ...changes[job.id] }));

  const perform = useCallback(async (id: string, command: WorkerCommand): Promise<string> => {
    const job = jobs.find(item => item.id === id);
    const move = (change: Change, message: string) => {
      setChanges(existing => ({ ...existing, [id]: { ...existing[id], ...change } }));
      return message;
    };
    switch (command.type) {
      case 'accept': return move({ stage: 'assigned', step: 0 }, 'Đã nhận việc. Xem trong mục Đã nhận.');
      case 'decline':
        setDismissed(existing => [...existing, id]);
        return 'Đã từ chối lời mời này.';
      case 'advance': {
        const step = job?.step ?? 0;
        if (step + 1 < workerJobSteps.length) return move({ step: step + 1 }, `Đã cập nhật: ${workerJobSteps[step + 1]}.`);
        return move({ stage: 'active', step: undefined, stageLabel: 'Vừa bắt đầu' }, 'Đã bắt đầu làm. Xem trong mục Đang làm.');
      }
      case 'pause':
        return command.category === 'safety_concern'
          ? move({ pause: 'safety' }, 'Đã tạm dừng vì lo ngại an toàn. Việc này không thể làm tiếp.')
          : move({ pause: 'paused' }, 'Đã tạm dừng việc. Muốn làm tiếp cần khách đồng ý.');
      case 'resume': return move({ pause: 'resume' }, 'Đã gửi yêu cầu làm tiếp. Chờ khách đồng ý.');
      case 'submit': return move({ stage: 'review', pause: undefined, correctionNote: undefined, stageLabel: 'Vừa nộp' }, 'Đã nộp kết quả. Chờ khách duyệt.');
      case 'propose': return 'Đã gửi đề xuất đổi phạm vi. Chờ khách quyết định.';
      case 'release':
        setDismissed(existing => [...existing, id]);
        return 'Đã rút khỏi việc này. Việc được mời cho thợ khác.';
      default: return move({ delayReported: true }, 'Đã ghi nhận báo chậm. Không có khoản phí hay thay đổi lịch tự động.');
    }
  }, [jobs]);

  return { jobs, perform };
}
