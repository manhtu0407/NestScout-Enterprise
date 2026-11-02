import type { IconName } from '@/features/shared';

export type WorkerJobStage = 'offer' | 'assigned' | 'active' | 'review' | 'done';

export type WorkerJobPause = 'paused' | 'resume';

export type WorkerJob = {
  id: string;
  stage: WorkerJobStage;
  title: string;
  icon: IconName;
  area: string;
  distanceLabel: string;
  description: string;
  clientName: string;
  photoCount: number;
  address: string;
  amountMinor: number;
  expiresLabel?: string;
  stageLabel?: string;
  step?: number;
  pause?: WorkerJobPause;
  delayReported?: boolean;
  correctionNote?: string;
};

export type WorkerJobStageInfo = {
  stage: WorkerJobStage;
  sidebarId: string;
  label: string;
  emptyIcon: IconName;
  emptyTitle: string;
  emptyBody: string;
};

export const workerJobStages: readonly WorkerJobStageInfo[] = [
  { stage: 'offer', sidebarId: 'worker-offers', label: 'Việc mới', emptyIcon: 'bolt', emptyTitle: 'Chưa có lời mời nhận việc', emptyBody: 'Khi hệ thống mời bạn một việc phù hợp với khu vực và dịch vụ bạn nhận, lời mời sẽ hiện ở đây.' },
  { stage: 'assigned', sidebarId: 'worker-assigned', label: 'Đã nhận', emptyIcon: 'pin', emptyTitle: 'Chưa có việc đã nhận', emptyBody: 'Việc bạn nhận sẽ hiện ở đây cho đến khi bạn bắt đầu làm.' },
  { stage: 'active', sidebarId: 'worker-active', label: 'Đang làm', emptyIcon: 'briefcase', emptyTitle: 'Chưa có việc đang làm', emptyBody: 'Việc bạn đã bắt đầu sẽ hiện ở đây cho đến khi bạn nộp kết quả.' },
  { stage: 'review', sidebarId: 'worker-review', label: 'Chờ duyệt', emptyIcon: 'check', emptyTitle: 'Chưa có việc chờ khách duyệt', emptyBody: 'Kết quả bạn đã nộp sẽ hiện ở đây cho đến khi khách nghiệm thu hoặc yêu cầu chỉnh sửa.' },
  { stage: 'done', sidebarId: 'worker-history', label: 'Lịch sử', emptyIcon: 'history', emptyTitle: 'Chưa có việc hoàn tất', emptyBody: 'Các việc khách đã nghiệm thu sẽ được lưu lại ở đây.' },
];

export const workerJobSteps: readonly string[] = ['Đã nhận việc', 'Đang đến', 'Đã đến nơi'];

export const workerJobStepActions: readonly string[] = ['Đang đến', 'Đã đến nơi', 'Bắt đầu làm'];

export function workerJobStageForSidebarId(id: string): WorkerJobStage | null {
  return workerJobStages.find(info => info.sidebarId === id)?.stage ?? null;
}

export const sampleWorkerJobs: readonly WorkerJob[] = [
  { id: 'job-o1', stage: 'offer', title: 'Sửa vòi nước bồn rửa', icon: 'drop', area: 'Quận 7', distanceLabel: '1,2 km', expiresLabel: 'Hết hạn sau 25 phút', description: 'Vòi bồn rửa bếp bị rò ở chân vòi, nhỏ giọt cả ngày. Cần xem và thay nếu hỏng.', clientName: 'Chị Lan', photoCount: 2, address: 'Quận 7, TP. Hồ Chí Minh', amountMinor: 450000 },
  { id: 'job-o2', stage: 'offer', title: 'Lắp bóng đèn phòng khách', icon: 'bolt', area: 'Quận 7', distanceLabel: '2,4 km', expiresLabel: 'Hết hạn sau 40 phút', description: 'Thay 3 bóng đèn âm trần phòng khách, trần cao khoảng 3 m. Bóng đèn khách tự chuẩn bị.', clientName: 'Anh Hùng', photoCount: 0, address: 'Quận 7, TP. Hồ Chí Minh', amountMinor: 280000 },
  { id: 'job-o3', stage: 'offer', title: 'Vệ sinh máy lạnh', icon: 'wrench', area: 'Quận 4', distanceLabel: '3,1 km', expiresLabel: 'Hết hạn sau 1 giờ', description: 'Vệ sinh 2 máy lạnh treo tường, máy chạy yếu và có mùi ẩm.', clientName: 'Chị Thu', photoCount: 1, address: 'Quận 4, TP. Hồ Chí Minh', amountMinor: 500000 },
  { id: 'job-o4', stage: 'offer', title: 'Vệ sinh sofa 3 chỗ', icon: 'sofa', area: 'Quận 4', distanceLabel: '3,9 km', expiresLabel: 'Hết hạn sau 2 giờ', description: 'Sofa vải 3 chỗ có vết ố ở tay vịn, cần giặt khô.', clientName: 'Anh Khoa', photoCount: 3, address: 'Quận 4, TP. Hồ Chí Minh', amountMinor: 450000 },
  { id: 'job-o5', stage: 'offer', title: 'Thay ổ khoá cửa chính', icon: 'wrench', area: 'Quận 7', distanceLabel: '4,6 km', expiresLabel: 'Hết hạn sau 3 giờ', description: 'Ổ khoá cũ bị kẹt chìa, cần tháo và lắp ổ mới khách đã mua.', clientName: 'Chị Mai', photoCount: 1, address: 'Quận 7, TP. Hồ Chí Minh', amountMinor: 350000 },
  { id: 'job-s1', stage: 'assigned', title: 'Sửa ống thoát nước nhà tắm', icon: 'drop', area: 'Quận 3', distanceLabel: '5,0 km', step: 1, description: 'Ống thoát sàn nhà tắm thoát chậm, có mùi.', clientName: 'Anh Tuấn', photoCount: 2, address: 'Quận 3, TP. Hồ Chí Minh', amountMinor: 520000 },
  { id: 'job-s2', stage: 'assigned', title: 'Lắp quạt trần phòng ngủ', icon: 'bolt', area: 'Quận 4', distanceLabel: '3,3 km', step: 0, description: 'Lắp quạt trần có sẵn, đã có chân đế và dây điện.', clientName: 'Chị Hà', photoCount: 0, address: 'Quận 4, TP. Hồ Chí Minh', amountMinor: 350000 },
  { id: 'job-a1', stage: 'active', title: 'Thay ổ khoá cửa chính', icon: 'wrench', area: 'Quận 1', distanceLabel: '6,2 km', stageLabel: 'Bắt đầu 10:20', description: 'Thay ổ khoá cửa chính, khoá cũ bị kẹt chìa.', clientName: 'Anh Phát', photoCount: 1, address: 'Quận 1, TP. Hồ Chí Minh', amountMinor: 650000 },
  { id: 'job-a2', stage: 'active', title: 'Sơn lại tường phòng ngủ', icon: 'sofa', area: 'Thủ Đức', distanceLabel: '4,8 km', stageLabel: 'Bắt đầu hôm qua', pause: 'paused', description: 'Sơn lại 4 bức tường phòng ngủ 14 m², tường có vài vết ẩm nhẹ.', clientName: 'Anh Long', photoCount: 3, address: 'Thủ Đức, TP. Hồ Chí Minh', amountMinor: 1200000 },
  { id: 'job-r1', stage: 'review', title: 'Thông cống nhà bếp', icon: 'drop', area: 'Quận 3', distanceLabel: '5,4 km', stageLabel: 'Đã nộp 1 giờ trước', description: 'Thông cống thoát nước bồn rửa bị nghẹt.', clientName: 'Chị Vy', photoCount: 1, address: 'Quận 3, TP. Hồ Chí Minh', amountMinor: 380000 },
  { id: 'job-r2', stage: 'review', title: 'Máy lạnh không mát', icon: 'wrench', area: 'Quận 7', distanceLabel: '1,8 km', stageLabel: 'Khách yêu cầu chỉnh sửa', correctionNote: 'Khách nhờ chụp thêm ảnh dàn lạnh sau khi vệ sinh để đối chiếu.', description: 'Kiểm tra và nạp gas máy lạnh phòng ngủ.', clientName: 'Anh Dũng', photoCount: 0, address: 'Quận 7, TP. Hồ Chí Minh', amountMinor: 600000 },
  { id: 'job-d1', stage: 'done', title: 'Vệ sinh sofa 3 chỗ', icon: 'sofa', area: 'Quận 4', distanceLabel: '3,9 km', stageLabel: 'Hôm qua', description: 'Giặt khô sofa vải 3 chỗ.', clientName: 'Chị Ngọc', photoCount: 2, address: 'Quận 4, TP. Hồ Chí Minh', amountMinor: 450000 },
  { id: 'job-d2', stage: 'done', title: 'Sửa vòi nước bồn rửa', icon: 'drop', area: 'Quận 7', distanceLabel: '1,8 km', stageLabel: 'Thứ Hai', description: 'Thay vòi bồn rửa bếp bị rò.', clientName: 'Anh Dũng', photoCount: 0, address: 'Quận 7, TP. Hồ Chí Minh', amountMinor: 420000 },
  { id: 'job-d3', stage: 'done', title: 'Lắp bóng đèn phòng khách', icon: 'bolt', area: 'Quận 3', distanceLabel: '5,4 km', stageLabel: 'Tuần trước', description: 'Thay 3 bóng đèn âm trần phòng khách.', clientName: 'Chị Vy', photoCount: 1, address: 'Quận 3, TP. Hồ Chí Minh', amountMinor: 280000 },
];

export const workerSidebarBadges: Readonly<Record<string, number>> = {
  'worker-offers': sampleWorkerJobs.filter(job => job.stage === 'offer').length,
  'worker-assigned': sampleWorkerJobs.filter(job => job.stage === 'assigned').length,
  'worker-review': sampleWorkerJobs.filter(job => job.correctionNote !== undefined).length,
};
