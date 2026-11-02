export type EarningsPeriod = 'today' | 'week' | 'month';

export type EarningsPeriodInfo = { period: EarningsPeriod; label: string; caption: string; totalMinor: number; jobCount: number };

export type EarningsDay = { label: string; amountMinor: number; today: boolean };

export type EarningsEntry = { id: string; title: string; dayLabel: string; amountMinor: number; today: boolean };

export const earningsPeriods: readonly EarningsPeriodInfo[] = [
  { period: 'today', label: 'Hôm nay', caption: 'Đã nghiệm thu hôm nay', totalMinor: 1250000, jobCount: 2 },
  { period: 'week', label: '7 ngày', caption: 'Đã nghiệm thu 7 ngày gần nhất', totalMinor: 3330000, jobCount: 6 },
  { period: 'month', label: 'Tháng này', caption: 'Đã nghiệm thu tháng này', totalMinor: 12480000, jobCount: 19 },
];

export const earningsDays: readonly EarningsDay[] = [
  { label: 'T3', amountMinor: 450000, today: false },
  { label: 'T4', amountMinor: 0, today: false },
  { label: 'T5', amountMinor: 650000, today: false },
  { label: 'T6', amountMinor: 380000, today: false },
  { label: 'T7', amountMinor: 600000, today: false },
  { label: 'CN', amountMinor: 0, today: false },
  { label: 'T2', amountMinor: 1250000, today: true },
];

export const earningsEntries: readonly EarningsEntry[] = [
  { id: 'e1', title: 'Lắp hệ đèn phòng khách', dayLabel: 'Hôm nay', amountMinor: 800000, today: true },
  { id: 'e2', title: 'Sửa vòi nước bồn rửa', dayLabel: 'Hôm nay', amountMinor: 450000, today: true },
  { id: 'e3', title: 'Máy lạnh không mát', dayLabel: 'Thứ Bảy', amountMinor: 600000, today: false },
  { id: 'e4', title: 'Thông cống nhà bếp', dayLabel: 'Thứ Sáu', amountMinor: 380000, today: false },
  { id: 'e5', title: 'Thay ổ khoá cửa chính', dayLabel: 'Thứ Năm', amountMinor: 650000, today: false },
  { id: 'e6', title: 'Vệ sinh sofa 3 chỗ', dayLabel: 'Thứ Ba', amountMinor: 450000, today: false },
];
