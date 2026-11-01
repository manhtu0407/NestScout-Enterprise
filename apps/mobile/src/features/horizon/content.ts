import { type IconName } from '@/features/shared';

export const quickServices = [
  { title: 'Sửa điện', icon: 'bolt' },
  { title: 'Sửa nước', icon: 'drop' },
  { title: 'Vệ sinh nhà', icon: 'home' },
  { title: 'Vệ sinh sofa', icon: 'sofa' },
  { title: 'Lắp đặt & sửa chữa nhỏ', icon: 'wrench' },
  { title: 'Dịch vụ khác', icon: 'grid' }
] as const;

export type SidebarItem = { id: string; title: string; icon: IconName };

export const sidebarGroups: readonly { title: string; items: readonly SidebarItem[] }[] = [
  {
    title: 'Việc của tôi',
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
      { id: 'worker-nearby', title: 'Việc mới', icon: 'bolt' },
      { id: 'worker-quotes', title: 'Báo giá', icon: 'receipt' },
      { id: 'worker-today', title: 'Lịch hẹn', icon: 'calendar' },
      { id: 'worker-active', title: 'Đang thực hiện', icon: 'briefcase' },
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

export const workerPreviewSummary = { area: 'Quận 7 · bán kính 5 km', earningsToday: '1.250.000đ', nextAppointment: '14:00 · Sửa vòi nước, Quận 3' } as const;

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
