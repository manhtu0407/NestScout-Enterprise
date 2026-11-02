import type { IconName } from '@/features/shared';

export type WorkerKaelPrompt = { id: string; icon: IconName; title: string; detail: string; prompt: string };

export const workerKaelPrompts: readonly WorkerKaelPrompt[] = [
  { id: 'quote', icon: 'receipt', title: 'Soạn nội dung báo giá', detail: 'Mô tả công việc và vật tư rõ ràng cho khách', prompt: 'Giúp tôi soạn nội dung báo giá cho việc sửa vòi nước bồn rửa' },
  { id: 'today', icon: 'calendar', title: 'Tóm tắt lịch hôm nay', detail: 'Các lịch hẹn và việc đang làm', prompt: 'Tóm tắt lịch hẹn và việc đang làm của tôi hôm nay' },
  { id: 'earnings', icon: 'wallet', title: 'Giải thích thu nhập', detail: 'Các khoản đã hoàn tất và số dư', prompt: 'Giải thích thu nhập của tôi trong 7 ngày gần nhất' },
  { id: 'safety', icon: 'help', title: 'Hỏi cách xử lý tại chỗ', detail: 'Gợi ý an toàn và cách làm đúng', prompt: 'Cần lưu ý gì khi thay vòi nước bồn rửa để tránh rò lại' },
];

export const workerKaelBoundaries: readonly { id: string; icon: IconName; title: string; detail: string }[] = [
  { id: 'decide', icon: 'user', title: 'Bạn quyết định', detail: 'Kael chỉ gợi ý. Giá, việc nhận và lịch hẹn do bạn chọn.' },
  { id: 'send', icon: 'send', title: 'Không tự gửi thay bạn', detail: 'Kael không tự gửi báo giá hay nhắn khách khi bạn chưa xác nhận.' },
  { id: 'mistake', icon: 'bell', title: 'Có thể sai sót', detail: 'Hãy kiểm tra lại thông tin quan trọng trước khi dùng.' },
];
