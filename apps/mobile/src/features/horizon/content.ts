export type ServiceIcon = 'wrench' | 'drop' | 'sofa' | 'grid';
export type Service = {
  id: string;
  title: string;
  subtitle: string;
  icon: ServiceIcon;
  suggestedMessage: string;
};

export const services: Service[] = [
  {
    id: 'aircon',
    title: 'Sửa máy lạnh',
    subtitle: 'Kiểm tra, vệ sinh, sửa chữa',
    icon: 'wrench',
    suggestedMessage: 'Máy lạnh nhà mình đang gặp vấn đề, Kael giúp mình nhé.'
  },
  {
    id: 'plumbing',
    title: 'Xử lý rò nước',
    subtitle: 'Kiểm tra, sửa chữa đường ống',
    icon: 'drop',
    suggestedMessage: 'Nhà mình đang bị rò nước, Kael tư vấn giúp mình.'
  },
  {
    id: 'sofa',
    title: 'Vệ sinh sofa',
    subtitle: 'Làm sạch, khử mùi, diệt khuẩn',
    icon: 'sofa',
    suggestedMessage: 'Mình muốn vệ sinh sofa tại nhà.'
  },
  {
    id: 'other',
    title: 'Công việc khác',
    subtitle: 'Mô tả chi tiết nhu cầu của cậu',
    icon: 'grid',
    suggestedMessage: 'Mình có một vấn đề tại nhà cần Kael hỗ trợ.'
  }
];

export const quickServices = [
  { title: 'Sửa điện', icon: 'bolt' },
  { title: 'Sửa nước', icon: 'drop' },
  { title: 'Vệ sinh nhà', icon: 'home' },
  { title: 'Vệ sinh sofa', icon: 'sofa' },
  { title: 'Lắp đặt & sửa chữa nhỏ', icon: 'wrench' },
  { title: 'Dịch vụ khác', icon: 'grid' }
] as const;

export const menuEntries = [
  { title: 'Trò chuyện mới', icon: 'chat', id: 'new' },
  { title: 'Trang chủ', icon: 'home', id: 'home' },
  { title: 'Công việc đang xử lý', icon: 'briefcase', id: 'tasks' },
  { title: 'Lịch sử', icon: 'clock', id: 'history' },
  { title: 'Yêu thích', icon: 'heart', id: 'favorites' }
] as const;
