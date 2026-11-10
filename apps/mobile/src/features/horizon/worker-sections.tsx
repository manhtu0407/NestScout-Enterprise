import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Text } from 'react-native';

import { useAccess } from '@/features/access';
import { PressScale, readPayoutQrSource } from '@/features/shared';

import { NotificationsScreen } from './notifications-screen';
import { SupportEmpty, SupportShell, supportStyles } from './support-shell';
import { useWorkerData } from './use-worker-data';
import { toEarningsView } from './worker-earnings';
import { WorkerEarningsScreen } from './worker-earnings-screen';
import { workerJobStageForSidebarId } from './worker-jobs';
import { WorkerJobsScreen } from './worker-jobs-screen';
import { jobChangesApiFor } from './job-changes-api';
import { toWorkerPayoutView } from './worker-payout';
import { workerJobPrompt } from './kael-handoff';
import { workerProfileTabForSidebarId } from './worker-profile';
import { WorkerProfileScreen } from './worker-profile-screen';
import { toWorkerJobs, toWorkerNotificationItems, toWorkerProfileView } from './worker-views';

export function isWorkerSection(id: string | undefined): id is string {
  return id !== undefined && (workerJobStageForSidebarId(id) !== null || workerProfileTabForSidebarId(id) !== null || id === 'worker-earnings' || id === 'worker-payout' || id === 'worker-notifications');
}

type Props = { id: string; onBack: () => void; onNavigate?: (id: string) => void; onAskKael?: (prompt: string) => void };

function StateShell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <SupportShell title={title} onBack={onBack}>{children}</SupportShell>;
}

export function WorkerSection({ id, onBack, onNavigate, onAskKael }: Props) {
  const access = useAccess();
  const userId = access.phase === 'worker' && access.identity === 'verified' ? access.userId : null;
  const worker = useWorkerData(userId);
  const [now] = useState(() => new Date());
  const { data } = worker;
  const jobs = useMemo(() => toWorkerJobs(data.snapshot, data.cards, now), [data, now]);
  const stage = workerJobStageForSidebarId(id);
  const profileTab = workerProfileTabForSidebarId(id);
  const profile = useMemo(() => toWorkerProfileView(data.profile, now), [data.profile, now]);
  const earningsMode = id === 'worker-earnings' ? 'overview' : id === 'worker-payout' ? 'payout' : null;
  const earnings = useMemo(() => toEarningsView(data.earnings, now), [data.earnings, now]);
  const payout = useMemo(() => toWorkerPayoutView(data.payout), [data.payout]);
  const loadQr = useCallback((path: string, version: string, signal: AbortSignal) => readPayoutQrSource(userId ?? '', path, version, signal), [userId]);
  const notices = id === 'worker-notifications';
  const notificationItems = useMemo(() => toWorkerNotificationItems(data.notifications, now), [data.notifications, now]);
  const title = notices ? 'Thông báo' : earningsMode === 'payout' ? 'Rút tiền' : earningsMode !== null ? 'Thu nhập' : profileTab === null ? 'Công việc' : 'Hồ sơ nghề';

  if (userId === null || (stage === null && profileTab === null && earningsMode === null && !notices)) {
    return <StateShell title={title} onBack={onBack}>
      <SupportEmpty icon="user" title="Chỉ dành cho Thợ" body="Đăng nhập bằng tài khoản Thợ đã được cấp quyền để xem mục này." />
    </StateShell>;
  }

  if (worker.status === 'error' && !worker.loaded) {
    return <StateShell title={title} onBack={onBack}>
      <SupportEmpty icon="clock" title="Không tải được dữ liệu" body="Kiểm tra kết nối rồi thử lại." />
      <PressScale accessibilityRole="button" accessibilityLabel="Tải lại" onPress={worker.refresh} style={supportStyles.primary}>
        <Text style={supportStyles.primaryLabel}>Tải lại</Text>
      </PressScale>
    </StateShell>;
  }

  if (!worker.loaded) {
    return <StateShell title={title} onBack={onBack}>
      <SupportEmpty icon="clock" title="Đang tải" body="Vui lòng chờ trong giây lát." />
    </StateShell>;
  }

  if (notices) return <NotificationsScreen items={notificationItems} onBack={onBack} onMarkRead={worker.markRead} onOpenTarget={onNavigate} />;
  if (earningsMode !== null) return <WorkerEarningsScreen key={earningsMode} initialMode={earningsMode} earnings={earnings} payout={payout} performPayout={worker.performPayout} loadQr={loadQr} onBack={onBack} />;
  if (profileTab !== null) return <WorkerProfileScreen key={profileTab} initialTab={profileTab} profile={profile} fallbackName="" perform={worker.performProfile} onBack={onBack} />;
  if (stage === null) return null;
  return <WorkerJobsScreen key={stage} initialStage={stage} jobs={jobs} perform={worker.perform} jobChanges={{ userId, api: jobChangesApiFor(userId) }} onBack={onBack} onAskKael={onAskKael ? job => onAskKael(workerJobPrompt(job)) : undefined} />;
}
