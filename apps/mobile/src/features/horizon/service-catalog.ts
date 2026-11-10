import type { IconName } from '@/features/shared';

export const serviceKeys = ['electric', 'plumbing', 'aircon', 'cleaning', 'sofa', 'handyman', 'other'] as const;

export type ServiceKey = typeof serviceKeys[number];

export type IntakeQuestion = {
  id: string;
  label: string;
  hint?: string;
  options?: readonly string[];
  placeholder?: string;
};

export type ServiceCategory = {
  key: ServiceKey;
  title: string;
  icon: IconName;
  blurb: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  questions: readonly IntakeQuestion[];
  safety: string | null;
  kaelOpening: string;
};

export const unknownAnswer = 'Chưa rõ';

export const serviceCatalog: readonly ServiceCategory[] = [
  {
    key: 'electric',
    title: 'Sửa điện',
    icon: 'bolt',
    blurb: 'Ổ cắm, công tắc, đèn, aptomat, dây điện',
    descriptionLabel: 'Bạn cần sửa gì?',
    descriptionPlaceholder: 'Ví dụ: ổ cắm phòng khách không có điện',
    questions: [
      { id: 'device', label: 'Thiết bị hoặc vị trí', placeholder: 'Ví dụ: ổ cắm cạnh tivi, phòng khách' },
      { id: 'symptom', label: 'Hiện tượng', placeholder: 'Ví dụ: mất điện, nhảy aptomat, chập chờn' },
      { id: 'danger', label: 'Có mùi khét, tia lửa hoặc nóng bất thường?', options: ['Không', 'Có', unknownAnswer] },
    ],
    safety: 'Nếu có mùi khét, tia lửa, chập cháy hoặc có người bị điện giật: ngắt nguồn điện nếu an toàn và gọi ngay 114 hoặc 115. NestScout không phải dịch vụ khẩn cấp.',
    kaelOpening: 'Tôi cần sửa điện.',
  },
  {
    key: 'plumbing',
    title: 'Sửa nước',
    icon: 'drop',
    blurb: 'Rò rỉ, tắc nghẽn, vòi, bồn, bình nóng lạnh',
    descriptionLabel: 'Bạn cần sửa gì?',
    descriptionPlaceholder: 'Ví dụ: vòi bồn rửa chén bị rò nước',
    questions: [
      { id: 'area', label: 'Khu vực', placeholder: 'Ví dụ: nhà vệ sinh, bếp, ban công' },
      { id: 'issue', label: 'Vấn đề', options: ['Rò rỉ', 'Tắc nghẽn', 'Nước yếu', 'Khác', unknownAnswer] },
      { id: 'urgency', label: 'Mức khẩn', options: ['Không gấp', 'Trong vài ngày', 'Càng sớm càng tốt'] },
    ],
    safety: 'Nếu nước rò mạnh, hãy khóa van nước tổng nếu an toàn. Tránh chạm vào ổ điện hoặc thiết bị điện đang ướt.',
    kaelOpening: 'Tôi cần sửa nước.',
  },
  {
    key: 'aircon',
    title: 'Máy lạnh',
    icon: 'globe',
    blurb: 'Vệ sinh, kiểm tra, sửa máy lạnh',
    descriptionLabel: 'Máy lạnh đang gặp vấn đề gì?',
    descriptionPlaceholder: 'Ví dụ: máy chạy nhưng không lạnh',
    questions: [
      { id: 'type', label: 'Loại máy', options: ['Treo tường', 'Âm trần', 'Tủ đứng', 'Di động', unknownAnswer] },
      { id: 'symptom', label: 'Hiện tượng', placeholder: 'Ví dụ: không lạnh, chảy nước, kêu to' },
      { id: 'count', label: 'Số máy (nếu biết)', placeholder: 'Ví dụ: 2' },
    ],
    safety: null,
    kaelOpening: 'Tôi cần xử lý máy lạnh.',
  },
  {
    key: 'cleaning',
    title: 'Vệ sinh nhà',
    icon: 'home',
    blurb: 'Dọn dẹp, vệ sinh tổng quát hoặc theo khu vực',
    descriptionLabel: 'Bạn cần vệ sinh gì?',
    descriptionPlaceholder: 'Ví dụ: dọn nhà trước khi dọn vào ở',
    questions: [
      { id: 'size', label: 'Diện tích hoặc số phòng', placeholder: 'Ví dụ: căn hộ 60 m², 2 phòng ngủ' },
      { id: 'type', label: 'Loại vệ sinh', options: ['Vệ sinh tổng quát', 'Sau xây dựng', 'Theo khu vực', 'Khác'] },
      { id: 'special', label: 'Yêu cầu đặc biệt', placeholder: 'Ví dụ: có thú cưng, cần mang dụng cụ' },
    ],
    safety: null,
    kaelOpening: 'Tôi cần vệ sinh nhà.',
  },
  {
    key: 'sofa',
    title: 'Vệ sinh sofa',
    icon: 'sofa',
    blurb: 'Giặt, khử mùi, xử lý vết bẩn',
    descriptionLabel: 'Bạn cần vệ sinh sofa như thế nào?',
    descriptionPlaceholder: 'Ví dụ: bộ sofa vải bị ố sau nhiều năm sử dụng',
    questions: [
      { id: 'seats', label: 'Số chỗ ngồi', placeholder: 'Ví dụ: 5' },
      { id: 'material', label: 'Chất liệu (nếu biết)', options: ['Vải', 'Da', 'Nỉ / nhung', unknownAnswer] },
      { id: 'stain', label: 'Loại vết bẩn', placeholder: 'Ví dụ: cà phê, dầu mỡ, mùi ẩm' },
    ],
    safety: null,
    kaelOpening: 'Tôi cần vệ sinh sofa.',
  },
  {
    key: 'handyman',
    title: 'Lắp đặt & sửa chữa nhỏ',
    icon: 'wrench',
    blurb: 'Lắp kệ, treo đồ, sửa khóa, việc vặt trong nhà',
    descriptionLabel: 'Bạn cần làm gì?',
    descriptionPlaceholder: 'Ví dụ: lắp kệ sách lên tường',
    questions: [
      { id: 'item', label: 'Loại hạng mục', placeholder: 'Ví dụ: lắp kệ, thay khóa, treo rèm' },
      { id: 'materials', label: 'Vật tư đã có (nếu biết)', options: ['Đã có đủ', 'Cần thợ mang theo', unknownAnswer] },
    ],
    safety: null,
    kaelOpening: 'Tôi cần lắp đặt hoặc sửa chữa nhỏ.',
  },
  {
    key: 'other',
    title: 'Dịch vụ khác',
    icon: 'grid',
    blurb: 'Mô tả việc bạn cần; NestScout chưa hứa hỗ trợ mọi loại việc',
    descriptionLabel: 'Bạn cần gì?',
    descriptionPlaceholder: 'Mô tả việc bạn cần làm',
    questions: [],
    safety: 'Yêu cầu thuộc nhóm này chỉ được ghi nhận. NestScout chưa đảm bảo có thợ hỗ trợ mọi loại dịch vụ.',
    kaelOpening: 'Tôi có một việc khác cần hỗ trợ.',
  },
];

const byKey = new Map(serviceCatalog.map(category => [category.key, category] as const));

export function isServiceKey(value: unknown): value is ServiceKey {
  return typeof value === 'string' && (serviceKeys as readonly string[]).includes(value);
}

export function categoryFor(key: ServiceKey): ServiceCategory {
  return byKey.get(key) as ServiceCategory;
}
