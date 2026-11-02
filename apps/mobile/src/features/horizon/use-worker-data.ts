import { useCallback, useEffect, useState } from 'react';

import {
  WorkflowError, acceptOffer, addWorkerCertificate, advanceJob, declineOffer, pauseJob, proposeScope, readWorkerEarnings, readWorkerJobCards, readWorkerProfile, readWorkerSnapshot,
  removeWorkerCertificate, reportJob, requestResume, saveWorkerCoverage, saveWorkerProfile, setWorkerAccepting, submitWork,
  type WorkerEarningRecord, type WorkerJobCard, type WorkerProfileRecord,
} from '@/features/shared';

import type { WorkerCommand } from './worker-jobs';
import type { WorkerProfileCommand } from './worker-profile';
import type { WorkerSnapshot } from './worker-views';

export type WorkerDataStatus = 'idle' | 'loading' | 'ready' | 'error';

export type WorkerData = { snapshot: WorkerSnapshot; cards: readonly WorkerJobCard[]; profile: WorkerProfileRecord | null; earnings: readonly WorkerEarningRecord[] };

const emptyData: WorkerData = { snapshot: { offers: [], jobs: [], changes: [], reports: [], corrections: [], pauses: [] }, cards: [], profile: null, earnings: [] };

export type WorkerDataController = {
  data: WorkerData;
  status: WorkerDataStatus;
  loaded: boolean;
  refresh: () => void;
  perform: (id: string, command: WorkerCommand) => Promise<string>;
  performProfile: (command: WorkerProfileCommand) => Promise<string>;
};

async function loadAll(userId: string, signal: AbortSignal): Promise<WorkerData> {
  const [snapshot, cards, profile, earnings] = await Promise.all([
    readWorkerSnapshot(userId, signal), readWorkerJobCards(userId, signal), readWorkerProfile(userId, signal), readWorkerEarnings(userId, signal),
  ]);
  return { snapshot, cards, profile, earnings };
}

type Loaded = { owner: string | null; data: WorkerData; loaded: boolean };

const emptyLoaded: Loaded = { owner: null, data: emptyData, loaded: false };

const accepted = 'Đã nhận việc. Xem trong mục Đã nhận.';
const steps = ['Đang đến', 'Đã đến nơi'];

export function useWorkerData(userId: string | null): WorkerDataController {
  const [loaded, setLoaded] = useState<Loaded>(emptyLoaded);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const current = loaded.owner === userId ? loaded : emptyLoaded;
  const status: WorkerDataStatus = userId === null ? 'idle' : failedFor === userId ? 'error' : current.loaded ? 'ready' : 'loading';

  const refresh = useCallback(() => {
    setFailedFor(null);
    setReloadKey(key => key + 1);
  }, []);

  useEffect(() => {
    if (userId === null) return undefined;
    const controller = new AbortController();
    loadAll(userId, controller.signal).then(
      next => {
        if (controller.signal.aborted) return;
        setLoaded({ owner: userId, data: next, loaded: true });
        setFailedFor(null);
      },
      () => {
        if (!controller.signal.aborted) setFailedFor(userId);
      },
    );
    return () => controller.abort();
  }, [userId, reloadKey]);

  const perform = useCallback(async (id: string, command: WorkerCommand): Promise<string> => {
    if (userId === null) throw new WorkflowError('forbidden');
    const { snapshot } = current.data;
    const signal = new AbortController().signal;
    try {
      if (command.type === 'accept' || command.type === 'decline') {
        const offer = snapshot.offers.find(item => item.invitation_id === id);
        if (!offer) throw new WorkflowError('unavailable');
        if (command.type === 'accept') {
          await acceptOffer(userId, offer, signal);
          return accepted;
        }
        await declineOffer(userId, offer, signal);
        return 'Đã từ chối lời mời này.';
      }
      const job = snapshot.jobs.find(item => item.job_id === id);
      if (!job) throw new WorkflowError('unavailable');
      switch (command.type) {
        case 'advance': {
          const next = job.stage === 'assigned' ? 'en_route' : job.stage === 'en_route' ? 'arrived' : job.stage === 'arrived' ? 'working' : null;
          if (next === null) throw new WorkflowError('rejected');
          await advanceJob(userId, job, next, signal);
          return next === 'working' ? 'Đã bắt đầu làm. Xem trong mục Đang làm.' : `Đã cập nhật: ${steps[next === 'en_route' ? 0 : 1]}.`;
        }
        case 'pause':
          await pauseJob(userId, job, command.category, signal);
          return command.category === 'safety_concern'
            ? 'Đã tạm dừng vì lo ngại an toàn. Việc này không thể làm tiếp.'
            : 'Đã tạm dừng việc. Muốn làm tiếp cần khách đồng ý.';
        case 'resume':
          await requestResume(userId, job, signal);
          return 'Đã gửi yêu cầu làm tiếp. Chờ khách đồng ý.';
        case 'submit':
          await submitWork(userId, id, job.version, command.key, command.evidence, signal);
          return 'Đã nộp kết quả. Chờ khách duyệt.';
        case 'propose':
          await proposeScope(userId, id, job.version, command.key, command.scope, command.amount, command.rationale, signal);
          return 'Đã gửi đề xuất đổi phạm vi. Chờ khách quyết định.';
        default:
          await reportJob(userId, id, job.version, command.key, command.kind, command.details, signal);
          return command.kind === 'delay' ? 'Đã ghi nhận báo chậm. Không có khoản phí hay thay đổi lịch tự động.' : 'Đã ghi nhận khách không trả lời.';
      }
    } finally {
      refresh();
    }
  }, [current.data, refresh, userId]);

  const performProfile = useCallback(async (command: WorkerProfileCommand): Promise<string> => {
    if (userId === null) throw new WorkflowError('forbidden');
    const signal = new AbortController().signal;
    try {
      switch (command.type) {
        case 'save': {
          const { draft } = command;
          await saveWorkerProfile(userId, {
            display_name: draft.name, trade: draft.trade, area: draft.area, experience_years: draft.experienceYears, about: draft.about, skills: draft.skills,
          }, signal);
          return 'Đã lưu hồ sơ nghề.';
        }
        case 'coverage':
          await saveWorkerCoverage(userId, command.radiusKm, command.serviceIds, signal);
          return 'Đã lưu khu vực và dịch vụ nhận.';
        case 'accepting':
          await setWorkerAccepting(userId, command.accepting, signal);
          return command.accepting ? 'Đã bật nhận việc.' : 'Đã tắt nhận việc.';
        case 'addCertificate':
          await addWorkerCertificate(userId, command.title, signal);
          return 'Đã thêm chứng chỉ. Khách chỉ thấy chứng chỉ sau khi được xác minh.';
        default:
          await removeWorkerCertificate(userId, command.id, signal);
          return 'Đã xóa chứng chỉ.';
      }
    } finally {
      refresh();
    }
  }, [refresh, userId]);

  return { data: current.data, status, loaded: current.loaded, refresh, perform, performProfile };
}
