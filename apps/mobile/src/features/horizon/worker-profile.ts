import type { IconName } from '@/features/shared';

import type { WorkerReview, WorkerStrength } from './content';

export type WorkerProfileTab = 'profile' | 'areas' | 'reviews';

export const workerProfileTabs: readonly { tab: WorkerProfileTab; sidebarId: string; label: string }[] = [
  { tab: 'profile', sidebarId: 'worker-profile', label: 'Hồ sơ' },
  { tab: 'areas', sidebarId: 'worker-areas', label: 'Khu vực' },
  { tab: 'reviews', sidebarId: 'worker-reviews', label: 'Đánh giá' },
];

export function workerProfileTabForSidebarId(id: string): WorkerProfileTab | null {
  return workerProfileTabs.find(item => item.sidebarId === id)?.tab ?? null;
}

export type WorkerCertificate = { id: string; title: string; statusLabel: string };

export const sampleWorkerProfile = {
  trade: 'Thợ điện nước',
  experienceYears: 6,
  about: 'Nhận sửa điện nước, lắp thiết bị và vệ sinh máy lạnh tại Quận 7 và khu vực lân cận.',
  skills: ['Thay vòi và van nước', 'Sửa ống nước bị rò', 'Lắp đèn và công tắc', 'Vệ sinh máy lạnh'],
} as const;

export const sampleWorkerCertificates: readonly WorkerCertificate[] = [
  { id: 'c1', title: 'Chứng chỉ an toàn điện', statusLabel: 'Đang chờ xác minh' },
  { id: 'c2', title: 'Chứng nhận nghề điện dân dụng', statusLabel: 'Chưa xác minh' },
];

export const radiusOptionsKm: readonly number[] = [3, 5, 10];

export const defaultRadiusKm = 5;

export const homeAreaLabel = 'Quận 7';

export type WorkerServiceOption = { id: string; label: string; icon: IconName; defaultOn: boolean };

export const workerServiceOptions: readonly WorkerServiceOption[] = [
  { id: 'electric', label: 'Sửa điện', icon: 'bolt', defaultOn: true },
  { id: 'water', label: 'Sửa nước', icon: 'drop', defaultOn: true },
  { id: 'aircon', label: 'Vệ sinh máy lạnh', icon: 'wrench', defaultOn: true },
  { id: 'paint', label: 'Sơn và chống thấm', icon: 'sofa', defaultOn: false },
  { id: 'sofa', label: 'Vệ sinh sofa', icon: 'sofa', defaultOn: false },
];

export const sampleWorkerReviews: readonly WorkerReview[] = [
  { id: 'r1', author: 'Chị Ngọc', time: 'Hôm qua', service: 'Vệ sinh sofa 3 chỗ', text: 'Thợ đến đúng hẹn, làm gọn và báo giá không phát sinh thêm.' },
  { id: 'r2', author: 'Anh Dũng', time: 'Thứ Hai', service: 'Máy lạnh không mát', text: 'Giải thích rõ nguyên nhân trước khi làm, máy chạy mát lại ngay.' },
  { id: 'r3', author: 'Chị Vy', time: 'Tuần trước', service: 'Thông cống nhà bếp', text: 'Làm nhanh, dọn sạch sau khi xong.' },
  { id: 'r4', author: 'Anh Phát', time: 'Tuần trước', service: 'Thay ổ khoá cửa chính', text: 'Lắp chắc chắn, thử khoá kỹ trước khi về.' },
];

export const sampleWorkerStrengths: readonly WorkerStrength[] = [
  { label: 'Đúng giờ', count: 4 },
  { label: 'Giải thích rõ ràng', count: 3 },
  { label: 'Làm gọn gàng', count: 3 },
];

export const sampleRatingAverage = 4.8;
