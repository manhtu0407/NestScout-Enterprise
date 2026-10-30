import type { IconName } from './icon';

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
      { id: 'tasks', title: 'Công việc đang xử lý', icon: 'briefcase' },
      { id: 'history', title: 'Lịch sử', icon: 'history' },
      { id: 'favorites', title: 'Yêu thích', icon: 'heart' },
    ],
  },
  {
    title: 'Hỗ trợ',
    items: [
      { id: 'notifications', title: 'Thông báo', icon: 'bell' },
      { id: 'settings', title: 'Cài đặt', icon: 'gear' },
      { id: 'help', title: 'Trợ giúp', icon: 'help' },
    ],
  },
];

export const screenTitles: Record<string, string> = {
  search: 'Tìm kiếm',
  requests: 'Yêu cầu của tôi',
  quotes: 'Báo giá',
  tasks: 'Công việc đang xử lý',
  history: 'Lịch sử',
  favorites: 'Yêu thích',
  notifications: 'Thông báo',
  settings: 'Cài đặt',
  help: 'Trợ giúp',
};
