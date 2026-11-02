import { useMemo, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { useAccess } from '@/features/access';
import { PressScale } from '@/features/shared';

import { SupportEmpty, SupportShell, supportStyles } from './support-shell';
import { useWorkerData } from './use-worker-data';
import { workerJobStageForSidebarId } from './worker-jobs';
import { WorkerJobsScreen } from './worker-jobs-screen';
import { toWorkerJobs } from './worker-views';

export function isWorkerSection(id: string | undefined): id is string {
  return id !== undefined && workerJobStageForSidebarId(id) !== null;
}

type Props = { id: string; onBack: () => void };

function StateShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return <SupportShell title="Công việc" onBack={onBack}>{children}</SupportShell>;
}

export function WorkerSection({ id, onBack }: Props) {
  const access = useAccess();
  const userId = access.phase === 'worker' && access.identity === 'verified' ? access.userId : null;
  const worker = useWorkerData(userId);
  const [now] = useState(() => new Date());
  const { data } = worker;
  const jobs = useMemo(() => toWorkerJobs(data.snapshot, data.cards, now), [data, now]);
  const stage = workerJobStageForSidebarId(id);

  if (userId === null || stage === null) {
    return <StateShell onBack={onBack}>
      <SupportEmpty icon="user" title="Chỉ dành cho Thợ" body="Đăng nhập bằng tài khoản Thợ đã được cấp quyền để xem mục này." />
    </StateShell>;
  }

  if (worker.status === 'error' && !worker.loaded) {
    return <StateShell onBack={onBack}>
      <SupportEmpty icon="clock" title="Không tải được dữ liệu" body="Kiểm tra kết nối rồi thử lại." />
      <PressScale accessibilityRole="button" accessibilityLabel="Tải lại" onPress={worker.refresh} style={supportStyles.primary}>
        <Text style={supportStyles.primaryLabel}>Tải lại</Text>
      </PressScale>
    </StateShell>;
  }

  if (!worker.loaded) {
    return <StateShell onBack={onBack}>
      <SupportEmpty icon="clock" title="Đang tải" body="Vui lòng chờ trong giây lát." />
    </StateShell>;
  }

  return <WorkerJobsScreen key={stage} initialStage={stage} jobs={jobs} perform={worker.perform} onBack={onBack} />;
}
