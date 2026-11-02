import { type IconName } from '@/features/shared';

export const quickServices = [
  { title: 'Sửa điện', icon: 'bolt', prompt: 'Tôi cần sửa điện: ' },
  { title: 'Sửa nước', icon: 'drop', prompt: 'Tôi cần sửa nước: ' },
  { title: 'Vệ sinh nhà', icon: 'home', prompt: 'Tôi cần vệ sinh nhà: ' },
  { title: 'Vệ sinh sofa', icon: 'sofa', prompt: 'Tôi cần vệ sinh sofa: ' },
  { title: 'Lắp đặt & sửa chữa nhỏ', icon: 'wrench', prompt: 'Tôi cần lắp đặt hoặc sửa chữa nhỏ: ' },
  { title: 'Dịch vụ khác', icon: 'grid', prompt: 'Tôi có một việc khác: ' }
] as const;

export type SidebarItem = { id: string; title: string; icon: IconName };

export const sidebarGroups: readonly { title: string; items: readonly SidebarItem[] }[] = [
  {
    title: 'Hoạt động',
    items: [
      { id: 'requests', title: 'Yêu cầu của tôi', icon: 'requests' },
      { id: 'quotes', title: 'Báo giá', icon: 'receipt' },
      { id: 'saved', title: 'Thợ đã lưu', icon: 'heart' },
    ],
  },
  {
    title: 'Hỗ trợ',
    items: [
      { id: 'notifications', title: 'Thông báo', icon: 'bell' },
      { id: 'help', title: 'Trợ giúp', icon: 'help' },
      { id: 'settings', title: 'Cài đặt', icon: 'gear' },
    ],
  },
];

export const workerSidebarGroups: readonly { title: string; items: readonly SidebarItem[] }[] = [
  {
    title: 'Công việc',
    items: [
      { id: 'worker-offers', title: 'Việc mới', icon: 'bolt' },
      { id: 'worker-assigned', title: 'Đã nhận việc', icon: 'pin' },
      { id: 'worker-active', title: 'Đang thực hiện', icon: 'briefcase' },
      { id: 'worker-review', title: 'Chờ khách duyệt', icon: 'check' },
      { id: 'worker-history', title: 'Lịch sử công việc', icon: 'history' },
    ],
  },
  {
    title: 'Thu nhập',
    items: [
      { id: 'worker-earnings', title: 'Thu nhập', icon: 'wallet' },
      { id: 'worker-payout', title: 'Rút tiền', icon: 'send' },
    ],
  },
  {
    title: 'Hồ sơ nghề',
    items: [
      { id: 'worker-profile', title: 'Hồ sơ và chứng chỉ', icon: 'user' },
      { id: 'worker-areas', title: 'Khu vực và dịch vụ nhận', icon: 'grid' },
      { id: 'worker-reviews', title: 'Đánh giá của khách', icon: 'star' },
    ],
  },
  {
    title: 'Hỗ trợ',
    items: [
      { id: 'worker-kael', title: 'Trợ lý Kael', icon: 'chat' },
      { id: 'help', title: 'Trợ giúp', icon: 'help' },
      { id: 'settings', title: 'Cài đặt', icon: 'gear' },
    ],
  },
];

export type NotificationItem = { id: string; icon: IconName; title: string; body: string; time: string; unread: boolean; today: boolean; requestId?: string };

export const sampleNotifications: readonly NotificationItem[] = [
  { id: 'n-1', icon: 'receipt', title: 'Báo giá mới', body: 'Yêu cầu “Sửa vòi nước bồn rửa” có báo giá mới đang chờ bạn quyết định.', time: '10 phút trước', unread: true, today: true },
  { id: 'n-2', icon: 'chat', title: 'Kael có cập nhật', body: 'Kael cần thêm thông tin để hoàn thiện yêu cầu mới nhất của bạn.', time: '1 giờ trước', unread: true, today: true },
  { id: 'n-3', icon: 'calendar', title: 'Nhắc lịch hẹn', body: 'Lịch hẹn sơn tường phòng ngủ bắt đầu lúc 14:00 hôm nay.', time: '3 giờ trước', unread: false, today: true },
  { id: 'n-4', icon: 'check', title: 'Việc đã hoàn tất', body: 'Yêu cầu “Thay ổ khoá cửa chính” đã hoàn tất. Hãy để lại đánh giá cho thợ.', time: 'Hôm qua', unread: false, today: false },
  { id: 'n-5', icon: 'requests', title: 'Yêu cầu đã được gửi', body: 'Yêu cầu “Lắp bóng đèn phòng khách” đã được gửi. Kael sẽ báo khi có báo giá.', time: 'Thứ Hai', unread: false, today: false },
];

export const helpContacts: readonly { id: string; icon: IconName; label: string; detail: string }[] = [
  { id: 'kael', icon: 'chat', label: 'Hỏi Kael', detail: 'Trò chuyện' },
  { id: 'call', icon: 'phone', label: 'Gọi trực tiếp', detail: 'Sắp có' },
  { id: 'email', icon: 'send', label: 'Gửi email', detail: 'Sắp có' },
];

export const helpTopics: readonly { id: string; question: string; answer: string }[] = [
  { id: 'create', question: 'Làm sao để tạo yêu cầu sửa chữa?', answer: 'Mở cuộc trò chuyện với Kael, mô tả việc cần làm và gửi kèm ảnh nếu có. Kael sẽ giúp bạn hoàn thiện yêu cầu và gửi tới thợ phù hợp.' },
  { id: 'quote', question: 'Báo giá được tính như thế nào?', answer: 'Báo giá ghi rõ phạm vi công việc, số tiền và thời hạn hiệu lực. Bạn xem kỹ rồi mới chấp nhận hoặc từ chối trong mục Báo giá. Chấp nhận báo giá chưa phải là thanh toán.' },
  { id: 'role', question: 'Tôi có thể dùng cả hai vai trò không?', answer: 'Có. Bạn có thể đổi giữa Khách hàng và Thợ trong mục Đổi vai trò. Vai trò Thợ cần được xác minh trước khi nhận việc.' },
  { id: 'otp', question: 'Tôi không nhận được mã xác thực', answer: 'Kiểm tra lại số điện thoại, chờ hết thời gian đếm ngược rồi bấm Gửi lại mã. Nếu vẫn chưa nhận được, hãy thử số khác hoặc liên hệ hỗ trợ.' },
  { id: 'privacy', question: 'Thông tin của tôi được bảo vệ ra sao?', answer: 'Chi tiết về cách NestScout thu thập và sử dụng thông tin của bạn có trong Chính sách quyền riêng tư, mục Cài đặt.' },
];

export const workerPreviewSummary = { area: 'Quận 7 · bán kính 5 km', acceptedToday: '1.250.000đ', nextJob: 'Sửa ống thoát nước · Quận 3' } as const;

const groupTitles = Object.fromEntries([...sidebarGroups, ...workerSidebarGroups].flatMap(group => group.items.map(item => [item.id, item.title])));

export const screenTitles: Record<string, string> = {
  ...groupTitles,
  search: 'Tìm kiếm',
  requests: 'Yêu cầu của tôi',
  quotes: 'Báo giá',
  saved: 'Thợ đã lưu',
  notifications: 'Thông báo',
  settings: 'Cài đặt',
  help: 'Trợ giúp',
};

export type UserProfile = { name: string; phone: string; email: string; address: string; avatarUri?: string; avatarHeaders?: Readonly<Record<string, string>>; avatarMimeType?: string };

export const sampleProfile: UserProfile = { name: 'Minh Anh', phone: '+84 912 345 678', email: '', address: '' };

export type QuoteStatus = 'pending' | 'accepted' | 'rejected';

export type QuoteItem = {
  id: string;
  requestId: string;
  requestTitle: string;
  version: number;
  scope: string;
  amountMinor: number;
  currency: 'VND';
  expiresLabel: string;
  expired: boolean;
  basis: string;
  status: QuoteStatus;
  time: string;
};

export const sampleQuotes: readonly QuoteItem[] = [
  { id: 'q-1a', requestId: 'req-1', requestTitle: 'Sửa vòi nước bồn rửa', version: 1, scope: 'Công kiểm tra và thay vòi bồn rửa.', amountMinor: 380000, currency: 'VND', expiresLabel: 'Đã được thay bằng phiên bản 2', expired: false, basis: 'local_fixture', status: 'pending', time: '1 giờ trước' },
  { id: 'q-1b', requestId: 'req-1', requestTitle: 'Sửa vòi nước bồn rửa', version: 2, scope: 'Công kiểm tra, thay vòi và vật tư nhỏ. Linh kiện thay thế ngoài danh sách chưa tính.', amountMinor: 450000, currency: 'VND', expiresLabel: 'Hiệu lực đến 16:00 hôm nay', expired: false, basis: 'local_fixture', status: 'pending', time: '10 phút trước' },
  { id: 'q-2', requestId: 'req-2', requestTitle: 'Lắp bóng đèn phòng khách', version: 1, scope: 'Công lắp tối đa 3 bóng đèn. Bóng đèn do bạn chuẩn bị.', amountMinor: 280000, currency: 'VND', expiresLabel: 'Hiệu lực đến 09:00 ngày mai', expired: false, basis: 'local_fixture', status: 'pending', time: 'Hôm qua' },
  { id: 'q-3', requestId: 'req-3', requestTitle: 'Sơn lại tường phòng ngủ', version: 1, scope: 'Công sơn hai lớp cho bốn bức tường. Sơn do đơn vị thi công cung cấp.', amountMinor: 1200000, currency: 'VND', expiresLabel: 'Đã chấp nhận', expired: false, basis: 'local_fixture', status: 'accepted', time: 'Thứ Hai' },
  { id: 'q-4', requestId: 'req-4', requestTitle: 'Thay ổ khoá cửa chính', version: 1, scope: 'Công tháo và lắp ổ khoá mới. Ổ khoá do bạn chuẩn bị.', amountMinor: 650000, currency: 'VND', expiresLabel: 'Đã hết hạn', expired: true, basis: 'local_fixture', status: 'pending', time: 'Tuần trước' },
];

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency }).format(amountMinor);
}

export type WorkerStrength = { label: string; count: number };

export type WorkerReview = { id: string; author: string; time: string; service: string; text: string };

export type SavedWorker = {
  id: string;
  name: string;
  trade: string;
  area: string;
  savedLabel: string;
  experienceYears: number;
  skills: readonly string[];
  serviceAreas: readonly string[];
  reviewCount: number;
  ratingAverage: number;
  completedJobs: number;
  strengths: readonly WorkerStrength[];
  reviews: readonly WorkerReview[];
  basis?: string;
};

export const minReviewsToShowRating = 3;

export function formatRating(value: number): string {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}

export const sampleSavedWorkers: readonly SavedWorker[] = [
  {
    id: 'w-1', name: 'Thợ Minh', trade: 'Thợ nước', area: 'Quận 7', savedLabel: 'Đã lưu hôm qua', experienceYears: 8,
    skills: ['Thay vòi và van nước', 'Sửa ống nước bị rò', 'Lắp thiết bị vệ sinh', 'Chống thấm nhỏ'],
    serviceAreas: ['Quận 7', 'Quận 4', 'Nhà Bè'], reviewCount: 28, ratingAverage: 4.9, completedJobs: 41,
    strengths: [{ label: 'Đúng giờ', count: 24 }, { label: 'Giải thích rõ ràng', count: 21 }, { label: 'Làm xong dọn gọn', count: 19 }, { label: 'Giá đúng như báo', count: 17 }],
    reviews: [
      { id: 'r-1', author: 'Chị L.', time: 'Tuần trước', service: 'Sửa vòi bồn rửa', text: 'Thợ đến đúng giờ, giải thích nguyên nhân rõ ràng và dọn sạch sau khi làm.' },
      { id: 'r-2', author: 'Anh H.', time: '2 tuần trước', service: 'Lắp vòi sen', text: 'Làm nhanh, giá đúng như đã báo.' },
    ],
  },
  {
    id: 'w-2', name: 'Thợ Tuấn', trade: 'Sơn và sửa nhà', area: 'Thủ Đức', savedLabel: 'Đã lưu thứ Hai', experienceYears: 12,
    skills: ['Sơn tường trong nhà', 'Xử lý tường ẩm mốc', 'Trám vá tường', 'Lắp kệ treo tường'],
    serviceAreas: ['Thủ Đức', 'Quận 9', 'Bình Thạnh'], reviewCount: 63, ratingAverage: 4.8, completedJobs: 97,
    strengths: [{ label: 'Làm kỹ, đường sơn đẹp', count: 51 }, { label: 'Đúng giờ', count: 44 }, { label: 'Bảo vệ đồ đạc khi thi công', count: 38 }],
    reviews: [{ id: 'r-3', author: 'Chị T.', time: 'Tháng trước', service: 'Sơn phòng ngủ', text: 'Đường sơn đều, che chắn đồ đạc cẩn thận.' }],
  },
  {
    id: 'w-3', name: 'Thợ Hạnh', trade: 'Vệ sinh sofa', area: 'Quận 3', savedLabel: 'Đã lưu tuần trước', experienceYears: 3,
    skills: ['Giặt sofa vải', 'Vệ sinh nệm'], serviceAreas: ['Quận 3', 'Quận 1'], reviewCount: 2, ratingAverage: 5, completedJobs: 6,
    strengths: [{ label: 'Nhẹ nhàng với đồ đạc', count: 2 }], reviews: [],
  },
];
