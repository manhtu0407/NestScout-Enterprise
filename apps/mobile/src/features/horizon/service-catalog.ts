import type { IconName } from '@/features/shared';

export type IntakeFieldKind = 'text' | 'multiline' | 'choice' | 'count';

export type IntakeField = {
  id: string;
  label: string;
  kind: IntakeFieldKind;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  maxLength: number;
};

export type ServiceCategoryId = 'electric' | 'plumbing' | 'aircon' | 'house-cleaning' | 'sofa-cleaning' | 'minor-repair' | 'other';

export type SafetyNotice = { when: { field: string; values: readonly string[] }; text: string };

export type ServiceCategory = {
  id: ServiceCategoryId;
  title: string;
  icon: IconName;
  intro: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  fields: readonly IntakeField[];
  safety?: SafetyNotice;
  kaelOpening: string;
};

export const unknownChoice = 'Chưa rõ';

export const descriptionField = 'description';
export const locationField = 'location';
export const preferredField = 'preferred';
export const maxDescriptionLength = 1500;
export const minDescriptionLength = 5;
export const maxLocationLength = 200;

export const preferredOptions: readonly string[] = ['Càng sớm càng tốt', 'Trong hôm nay', 'Ngày mai', 'Cuối tuần', 'Linh hoạt'];

const choice = (id: string, label: string, options: readonly string[], required = false): IntakeField => ({ id, label, kind: 'choice', options, required, maxLength: 80 });
const text = (id: string, label: string, placeholder: string, maxLength = 120): IntakeField => ({ id, label, kind: 'text', placeholder, maxLength });

export const serviceCategories: readonly ServiceCategory[] = [
  {
    id: 'electric',
    title: 'Sửa điện',
    icon: 'bolt',
    intro: 'Cho Kael và thợ biết thiết bị nào gặp vấn đề và có dấu hiệu nguy hiểm hay không.',
    descriptionLabel: 'Mô tả sự cố',
    descriptionPlaceholder: 'Ví dụ: ổ cắm phòng khách không có điện từ sáng nay',
    fields: [
      text('device', 'Thiết bị hoặc vị trí', 'Ví dụ: ổ cắm, công tắc, bóng đèn, aptomat'),
      choice('symptom', 'Hiện tượng', ['Mất điện cục bộ', 'Nhảy aptomat', 'Chập chờn', 'Ổ cắm hoặc công tắc hỏng', 'Khác', unknownChoice]),
      choice('danger', 'Dấu hiệu nguy hiểm', ['Không có', 'Mùi khét hoặc tia lửa', 'Bị giật điện', 'Nóng bất thường', unknownChoice]),
    ],
    safety: {
      when: { field: 'danger', values: ['Mùi khét hoặc tia lửa', 'Bị giật điện', 'Nóng bất thường'] },
      text: 'Nếu có cháy, khói hoặc người bị giật điện: ngắt nguồn điện nếu an toàn và gọi 114 ngay. NestScout không phải dịch vụ cấp cứu và chưa cam kết thời gian có thợ.',
    },
    kaelOpening: 'Kael ơi, mình đang gặp vấn đề về điện ở nhà. Bạn giúp mình nhé.',
  },
  {
    id: 'plumbing',
    title: 'Sửa nước',
    icon: 'drop',
    intro: 'Cho biết khu vực, kiểu sự cố và mức độ khẩn để yêu cầu rõ ràng hơn.',
    descriptionLabel: 'Mô tả sự cố',
    descriptionPlaceholder: 'Ví dụ: vòi bồn rửa bếp bị rò nước ở chân vòi',
    fields: [
      choice('area', 'Khu vực', ['Nhà vệ sinh', 'Bếp', 'Sân hoặc ban công', 'Toàn nhà', 'Khác']),
      choice('issue', 'Sự cố', ['Rò rỉ', 'Tắc nghẽn', 'Vòi hoặc van hỏng', 'Áp lực nước yếu', 'Khác', unknownChoice]),
      choice('urgency', 'Mức độ khẩn', ['Nước đang chảy mạnh', 'Trong hôm nay', 'Vài ngày tới', 'Không gấp']),
    ],
    safety: {
      when: { field: 'urgency', values: ['Nước đang chảy mạnh'] },
      text: 'Nếu nước đang chảy mạnh, hãy khóa van tổng và tránh xa ổ cắm điện nếu an toàn. Việc gửi yêu cầu không đảm bảo thợ đến ngay.',
    },
    kaelOpening: 'Kael ơi, mình đang gặp vấn đề về nước ở nhà. Bạn giúp mình nhé.',
  },
  {
    id: 'aircon',
    title: 'Máy lạnh',
    icon: 'grid',
    intro: 'Cho biết loại máy và hiện tượng. Số máy chỉ cần nhập nếu bạn biết.',
    descriptionLabel: 'Mô tả sự cố hoặc nhu cầu',
    descriptionPlaceholder: 'Ví dụ: máy lạnh phòng ngủ chạy nhưng không mát',
    fields: [
      choice('type', 'Loại máy', ['Treo tường', 'Âm trần', 'Tủ đứng', 'Di động', unknownChoice]),
      choice('symptom', 'Hiện tượng', ['Không lạnh', 'Chảy nước', 'Kêu to', 'Không bật được', 'Cần vệ sinh hoặc bảo dưỡng', 'Khác']),
      { id: 'count', label: 'Số máy (nếu biết)', kind: 'count', placeholder: 'Ví dụ: 2', maxLength: 2 },
    ],
    kaelOpening: 'Kael ơi, mình cần hỗ trợ về máy lạnh. Bạn tư vấn giúp mình nhé.',
  },
  {
    id: 'house-cleaning',
    title: 'Vệ sinh nhà',
    icon: 'home',
    intro: 'Cho biết quy mô và loại vệ sinh. Bạn có thể bỏ qua phần chưa biết.',
    descriptionLabel: 'Mô tả nhu cầu',
    descriptionPlaceholder: 'Ví dụ: vệ sinh căn hộ sau khi sửa nhà',
    fields: [
      text('size', 'Diện tích hoặc số phòng', 'Ví dụ: 60 m² hoặc 2 phòng ngủ'),
      choice('kind', 'Loại vệ sinh', ['Vệ sinh định kỳ', 'Tổng vệ sinh', 'Sau xây dựng hoặc sửa chữa', 'Chuyển nhà', 'Khác']),
      { id: 'special', label: 'Yêu cầu đặc biệt', kind: 'multiline', placeholder: 'Ví dụ: có thú cưng, cần tránh hóa chất mạnh', maxLength: 300 },
    ],
    kaelOpening: 'Kael ơi, mình muốn tìm dịch vụ vệ sinh nhà. Bạn giúp mình nhé.',
  },
  {
    id: 'sofa-cleaning',
    title: 'Vệ sinh sofa',
    icon: 'sofa',
    intro: 'Cho biết số chỗ ngồi và loại vết bẩn. Chất liệu chỉ cần chọn nếu bạn biết.',
    descriptionLabel: 'Mô tả nhu cầu',
    descriptionPlaceholder: 'Ví dụ: giặt sofa phòng khách bị ố vết cà phê',
    fields: [
      text('seats', 'Số chỗ ngồi', 'Ví dụ: sofa 3 chỗ', 60),
      choice('material', 'Chất liệu (nếu biết)', ['Vải', 'Da', 'Nỉ hoặc nhung', unknownChoice]),
      choice('stain', 'Loại vết bẩn', ['Bụi bẩn thường', 'Vết ố hoặc thức ăn', 'Dấu vết thú cưng', 'Mùi hôi', 'Khác']),
    ],
    kaelOpening: 'Kael ơi, mình muốn tìm dịch vụ vệ sinh sofa. Bạn tư vấn giúp mình nhé.',
  },
  {
    id: 'minor-repair',
    title: 'Lắp đặt & sửa chữa nhỏ',
    icon: 'wrench',
    intro: 'Cho biết hạng mục và vật tư đang có để mô tả đủ việc cần làm.',
    descriptionLabel: 'Chi tiết công việc',
    descriptionPlaceholder: 'Ví dụ: lắp kệ treo tường phòng khách, đã có kệ và ốc vít',
    fields: [
      choice('item', 'Loại hạng mục', ['Lắp đặt đồ nội thất', 'Treo hoặc gắn đồ lên tường', 'Sửa khóa hoặc cửa', 'Sửa đồ gia dụng nhỏ', 'Khác']),
      choice('materials', 'Vật tư (nếu biết)', ['Đã có sẵn vật tư', 'Cần thợ mang theo', unknownChoice]),
    ],
    kaelOpening: 'Kael ơi, mình cần lắp đặt hoặc sửa vài đồ trong nhà. Bạn giúp mình nhé.',
  },
  {
    id: 'other',
    title: 'Dịch vụ khác',
    icon: 'grid',
    intro: 'Tự mô tả việc bạn cần. NestScout ghi nhận đúng nội dung này; chưa đảm bảo có thợ phù hợp với loại việc ngoài sáu nhóm chính.',
    descriptionLabel: 'Bạn cần giúp việc gì?',
    descriptionPlaceholder: 'Mô tả việc cần làm, kích thước hoặc số lượng nếu có',
    fields: [],
    kaelOpening: 'Kael ơi, mình cần hỗ trợ một việc tại nhà nhưng chưa biết chọn dịch vụ nào. Bạn giúp mình nhé.',
  },
];

export function serviceCategoryFor(id: string | undefined): ServiceCategory | undefined {
  return serviceCategories.find(category => category.id === id);
}
