import type { IconName, MediaFile, WorkerCertificateStatus, WorkerDocumentKind, WorkerMissingItem } from '@/features/shared';

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

export type WorkerDocument = { id: string; kind: WorkerDocumentKind; title: string; status: WorkerCertificateStatus; statusLabel: string };

export type WorkerDocumentSlot = { kind: WorkerDocumentKind; title: string; body: string; icon: IconName; required: boolean; limit: number; action: string };

export const workerDocumentSlots: readonly WorkerDocumentSlot[] = [
  { kind: 'identity', title: 'Giấy tờ tùy thân', body: 'Ảnh CCCD hoặc CMND, rõ cả 4 góc. Chỉ nhân viên xác minh xem được, khách không thấy. Cần có để niêm yết hồ sơ công khai.', icon: 'user', required: true, limit: 2, action: 'Tải ảnh giấy tờ' },
  { kind: 'qualification', title: 'Chứng chỉ và giấy xác nhận tay nghề', body: 'Chứng chỉ nghề, giấy xác nhận từ đơn vị cũ hoặc thẻ an toàn lao động.', icon: 'receipt', required: false, limit: 10, action: 'Tải chứng chỉ' },
  { kind: 'portfolio', title: 'Ảnh công việc đã làm', body: 'Ảnh trước và sau khi làm giúp khách tin tưởng hồ sơ của bạn.', icon: 'image', required: false, limit: 6, action: 'Tải ảnh công việc' },
];

export const documentKindLabels: Readonly<Record<WorkerDocumentKind, string>> = {
  identity: 'Giấy tờ tùy thân',
  qualification: 'Chứng chỉ',
  portfolio: 'Ảnh công việc',
};

export type ReadinessStep = { key: WorkerMissingItem; label: string; hint: string; target: 'edit' | 'areas' | 'documents' };

export const readinessSteps: readonly ReadinessStep[] = [
  { key: 'about', label: 'Giới thiệu bản thân', hint: 'Viết vài câu về nghề và cách làm việc', target: 'edit' },
  { key: 'skills', label: 'Kỹ năng', hint: 'Thêm ít nhất 1 kỹ năng', target: 'edit' },
  { key: 'services', label: 'Dịch vụ nhận', hint: 'Chọn ít nhất 1 dịch vụ ở tab Khu vực', target: 'areas' },
  { key: 'identity', label: 'Giấy tờ tùy thân', hint: 'Tải ảnh CCCD hoặc CMND để niêm yết hồ sơ công khai', target: 'documents' },
];

export type WorkerReadiness = { total: number; done: number; pending: readonly ReadinessStep[]; ready: boolean };

export function missingItemsOf(profile: Pick<WorkerProfileView, 'about' | 'skills' | 'serviceIds' | 'documents'>): WorkerMissingItem[] {
  const missing: WorkerMissingItem[] = [];
  if (profile.about.trim() === '') missing.push('about');
  if (profile.skills.length === 0) missing.push('skills');
  if (profile.serviceIds.length === 0) missing.push('services');
  if (!profile.documents.some(item => item.kind === 'identity' && item.status !== 'rejected')) missing.push('identity');
  return missing;
}

export function workerReadiness(missing: readonly WorkerMissingItem[]): WorkerReadiness {
  const pending = readinessSteps.filter(step => missing.includes(step.key));
  return { total: readinessSteps.length, done: readinessSteps.length - pending.length, pending, ready: missing.length === 0 };
}

export function readinessSummary(missing: readonly WorkerMissingItem[]): string {
  const { pending } = workerReadiness(missing);
  return pending.length === 0 ? 'Hồ sơ công khai đã hoàn thiện' : `Cần bổ sung ${pending.length} mục để niêm yết hồ sơ công khai`;
}

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
  documents: readonly WorkerDocument[];
  missing: readonly WorkerMissingItem[];
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
  | { type: 'removeCertificate'; id: string }
  | { type: 'addDocument'; kind: WorkerDocumentKind; file: MediaFile; title: string }
  | { type: 'removeDocument'; id: string };

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
  documents: [
    { id: 'd1', kind: 'identity', title: 'CCCD mặt trước', status: 'pending', statusLabel: certificateStatusLabels.pending },
  ],
  missing: [],
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
