import type { IconName, WorkerCertificateStatus } from '@/features/shared';

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

export type WorkerCertificate = { id: string; title: string; status: WorkerCertificateStatus; statusLabel: string };

export type WorkerProfileView = {
  name: string;
  trade: string;
  area: string;
  experienceYears: number;
  about: string;
  skills: readonly string[];
  radiusKm: number;
  accepting: boolean;
  serviceIds: readonly string[];
  listed: boolean;
  certificates: readonly WorkerCertificate[];
  reviewCount: number;
  ratingAverage: number;
  strengths: readonly WorkerStrength[];
  reviews: readonly WorkerReview[];
};

export type WorkerProfileDraft = {
  name: string;
  trade: string;
  area: string;
  experienceYears: number;
  about: string;
  skills: readonly string[];
};

export type WorkerProfileCommand =
  | { type: 'save'; draft: WorkerProfileDraft }
  | { type: 'coverage'; radiusKm: number; serviceIds: readonly string[] }
  | { type: 'accepting'; accepting: boolean }
  | { type: 'addCertificate'; title: string }
  | { type: 'removeCertificate'; id: string };

export type WorkerProfilePerform = (command: WorkerProfileCommand) => Promise<string>;

export const certificateStatusLabels: Readonly<Record<WorkerCertificateStatus, string>> = {
  pending: 'Đang chờ xác minh',
  verified: 'Đã xác minh',
  rejected: 'Chưa được chấp nhận',
};

export const radiusOptionsKm: readonly number[] = [3, 5, 10];

export const maxCertificates = 10;

export const maxSkills = 12;

export type WorkerServiceOption = { id: string; label: string; icon: IconName };

export const workerServiceOptions: readonly WorkerServiceOption[] = [
  { id: 'electric', label: 'Sửa điện', icon: 'bolt' },
  { id: 'water', label: 'Sửa nước', icon: 'drop' },
  { id: 'aircon', label: 'Vệ sinh máy lạnh', icon: 'wrench' },
  { id: 'paint', label: 'Sơn và chống thấm', icon: 'sofa' },
  { id: 'sofa', label: 'Vệ sinh sofa', icon: 'sofa' },
];

export function parseSkills(text: string): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const skill = part.trim();
    if (skill && !seen.has(skill)) {
      seen.add(skill);
      skills.push(skill);
    }
  }
  return skills;
}

export type WorkerProfileFields = { name: string; trade: string; area: string; experience: string; about: string; skills: string };

export function toWorkerProfileFields(profile: WorkerProfileView | null, fallbackName: string): WorkerProfileFields {
  return {
    name: profile?.name ?? fallbackName,
    trade: profile?.trade ?? '',
    area: profile?.area ?? '',
    experience: profile ? String(profile.experienceYears) : '',
    about: profile?.about ?? '',
    skills: profile?.skills.join(', ') ?? '',
  };
}

export type WorkerProfileValidation = { draft: WorkerProfileDraft; error: null } | { draft: null; error: string };

export function validateWorkerProfileFields(fields: WorkerProfileFields): WorkerProfileValidation {
  const name = fields.name.trim();
  const trade = fields.trade.trim();
  const area = fields.area.trim();
  const about = fields.about.trim();
  const skills = parseSkills(fields.skills);
  if (!name || !trade || !area) return { draft: null, error: 'Nhập tên hiển thị, nghề và khu vực chính.' };
  if (name.length > 80 || trade.length > 80 || area.length > 80) return { draft: null, error: 'Tên, nghề và khu vực tối đa 80 ký tự.' };
  if (!/^\d{1,2}$/.test(fields.experience.trim()) || Number(fields.experience) > 80) return { draft: null, error: 'Số năm kinh nghiệm là số từ 0 đến 80.' };
  if (about.length > 600) return { draft: null, error: 'Phần giới thiệu tối đa 600 ký tự.' };
  if (skills.length > maxSkills || skills.some(skill => skill.length > 40)) return { draft: null, error: `Tối đa ${maxSkills} kỹ năng, mỗi kỹ năng không quá 40 ký tự.` };
  return { draft: { name, trade, area, experienceYears: Number(fields.experience), about, skills }, error: null };
}

export const sampleWorkerProfileView: WorkerProfileView = {
  name: 'Minh Anh',
  trade: 'Thợ điện nước',
  area: 'Quận 7',
  experienceYears: 6,
  about: 'Nhận sửa điện nước, lắp thiết bị và vệ sinh máy lạnh tại Quận 7 và khu vực lân cận.',
  skills: ['Thay vòi và van nước', 'Sửa ống nước bị rò', 'Lắp đèn và công tắc', 'Vệ sinh máy lạnh'],
  radiusKm: 5,
  accepting: true,
  serviceIds: ['electric', 'water', 'aircon'],
  listed: false,
  certificates: [
    { id: 'c1', title: 'Chứng chỉ an toàn điện', status: 'pending', statusLabel: certificateStatusLabels.pending },
    { id: 'c2', title: 'Chứng nhận nghề điện dân dụng', status: 'rejected', statusLabel: certificateStatusLabels.rejected },
  ],
  reviewCount: 4,
  ratingAverage: 4.8,
  strengths: [
    { label: 'Đúng giờ', count: 4 },
    { label: 'Giải thích rõ ràng', count: 3 },
    { label: 'Làm gọn gàng', count: 3 },
  ],
  reviews: [
    { id: 'r1', author: 'Chị Ngọc', time: 'Hôm qua', service: 'Vệ sinh sofa 3 chỗ', text: 'Thợ đến đúng hẹn, làm gọn và báo giá không phát sinh thêm.' },
    { id: 'r2', author: 'Anh Dũng', time: 'Thứ Hai', service: 'Máy lạnh không mát', text: 'Giải thích rõ nguyên nhân trước khi làm, máy chạy mát lại ngay.' },
    { id: 'r3', author: 'Chị Vy', time: 'Tuần trước', service: 'Thông cống nhà bếp', text: 'Làm nhanh, dọn sạch sau khi xong.' },
    { id: 'r4', author: 'Anh Phát', time: 'Tuần trước', service: 'Thay ổ khoá cửa chính', text: 'Lắp chắc chắn, thử khoá kỹ trước khi về.' },
  ],
};
