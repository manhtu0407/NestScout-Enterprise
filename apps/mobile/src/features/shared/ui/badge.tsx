import type { LucideIcon } from 'lucide-react-native';
import { Chip } from './chip';
import type { ChipColor, StatusDotColor } from './chip';
export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'solid';
export type BadgeSize = 'sm' | 'md';

type Props = {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: LucideIcon;
  dot?: boolean;
};

export type OrderStatus = 'draft' | 'matching' | 'quoted' | 'booked' | 'working' | 'done' | 'cancelled';
export type WorkerProfileStatus = 'incomplete' | 'pending' | 'verified' | 'rejected' | 'suspended';
export type HighlightKind = 'new' | 'suggested' | 'best-price' | 'top-rated' | 'urgent';

export const orderBadges: Readonly<Record<OrderStatus, { label: string; tone: BadgeTone }>> = {
  draft: { label: 'Nháp', tone: 'neutral' },
  matching: { label: 'Đang tìm thợ', tone: 'info' },
  quoted: { label: 'Có báo giá', tone: 'warning' },
  booked: { label: 'Đã chốt', tone: 'info' },
  working: { label: 'Đang làm', tone: 'info' },
  done: { label: 'Hoàn tất', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'danger' },
};

export const workerProfileBadges: Readonly<Record<WorkerProfileStatus, { label: string; tone: BadgeTone }>> = {
  incomplete: { label: 'Chưa hoàn thiện', tone: 'neutral' },
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  verified: { label: 'Đã xác minh', tone: 'success' },
  rejected: { label: 'Cần bổ sung', tone: 'danger' },
  suspended: { label: 'Tạm khóa', tone: 'danger' },
};

export const highlightBadges: Readonly<Record<HighlightKind, { label: string; tone: BadgeTone }>> = {
  new: { label: 'Mới', tone: 'solid' },
  suggested: { label: 'Kael gợi ý', tone: 'info' },
  'best-price': { label: 'Giá tốt', tone: 'success' },
  'top-rated': { label: 'Đánh giá cao', tone: 'warning' },
  urgent: { label: 'Gấp', tone: 'danger' },
};

const toneDot: Readonly<Record<BadgeTone, StatusDotColor>> = { neutral: 'gray', info: 'indigo', success: 'green', warning: 'yellow', danger: 'red', solid: 'gray' };
const toneChip: Readonly<Record<BadgeTone, ChipColor>> = { neutral: 'neutral', info: 'cyan', success: 'lime', warning: 'yellow', danger: 'rose', solid: 'ink' };

export function Badge({ label, tone = 'neutral', size = 'md', icon, dot = false }: Props) {
  return <Chip label={label} hue={toneChip[tone]} variant={size === 'sm' ? 'caption' : 'subtle'} icon={icon} dot={dot ? toneDot[tone] : undefined}/>;
}
