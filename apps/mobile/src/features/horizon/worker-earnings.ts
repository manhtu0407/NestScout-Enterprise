import type { WorkerEarningRecord } from '@/features/shared';

export type EarningsPeriod = 'today' | 'week' | 'month';

export type EarningsPeriodInfo = { period: EarningsPeriod; label: string; caption: string; totalMinor: number; jobCount: number };

export type EarningsDay = { label: string; amountMinor: number; today: boolean };

export type EarningsEntry = { id: string; title: string; dayLabel: string; amountMinor: number };

export type EarningsView = {
  periods: readonly EarningsPeriodInfo[];
  days: readonly EarningsDay[];
  entries: Readonly<Record<EarningsPeriod, readonly EarningsEntry[]>>;
};

const vietnamOffsetMs = 7 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const weekDays = 7;
const shortWeekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
const longWeekdays = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'] as const;

function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / dayMs;
}

function dayKey(number: number): string {
  return new Date(number * dayMs).toISOString().slice(0, 10);
}

export function vietnamDayKey(now: Date): string {
  return new Date(now.getTime() + vietnamOffsetMs).toISOString().slice(0, 10);
}

function weekdayOf(number: number): number {
  return new Date(number * dayMs).getUTCDay();
}

function dayLabelFor(age: number, number: number, key: string): string {
  if (age === 0) return 'Hôm nay';
  if (age === 1) return 'Hôm qua';
  if (age < weekDays) return longWeekdays[weekdayOf(number)] ?? key;
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

export function toEarningsView(records: readonly WorkerEarningRecord[], now: Date): EarningsView {
  const todayKey = vietnamDayKey(now);
  const today = dayNumber(todayKey);
  const month = todayKey.slice(0, 7);
  const dated = records
    .filter(record => record.currency === 'VND')
    .map(record => ({ record, number: dayNumber(record.completed_on) }))
    .filter(item => item.number <= today);
  const inWeek = (number: number) => today - number < weekDays;
  const inMonth = (item: { record: WorkerEarningRecord }) => item.record.completed_on.slice(0, 7) === month;
  const selections: Readonly<Record<EarningsPeriod, typeof dated>> = {
    today: dated.filter(item => item.number === today),
    week: dated.filter(item => inWeek(item.number)),
    month: dated.filter(inMonth),
  };
  const total = (items: typeof dated) => items.reduce((sum, item) => sum + item.record.amount_minor, 0);
  const info = (period: EarningsPeriod, label: string, caption: string): EarningsPeriodInfo => ({
    period, label, caption, totalMinor: total(selections[period]), jobCount: selections[period].length,
  });
  const days: EarningsDay[] = Array.from({ length: weekDays }, (_, index) => {
    const number = today - (weekDays - 1 - index);
    return {
      label: shortWeekdays[weekdayOf(number)] ?? dayKey(number),
      amountMinor: total(dated.filter(item => item.number === number)),
      today: number === today,
    };
  });
  const entriesOf = (items: typeof dated): EarningsEntry[] => items.map(item => ({
    id: item.record.job_id,
    title: item.record.title,
    dayLabel: dayLabelFor(today - item.number, item.number, item.record.completed_on),
    amountMinor: item.record.amount_minor,
  }));
  return {
    periods: [
      info('today', 'Hôm nay', 'Đã nghiệm thu hôm nay'),
      info('week', '7 ngày', 'Đã nghiệm thu 7 ngày gần nhất'),
      info('month', 'Tháng này', 'Đã nghiệm thu tháng này'),
    ],
    days,
    entries: { today: entriesOf(selections.today), week: entriesOf(selections.week), month: entriesOf(selections.month) },
  };
}

export function earningsTodayMinor(records: readonly WorkerEarningRecord[], now: Date): number {
  return toEarningsView(records, now).periods[0]?.totalMinor ?? 0;
}

const sampleRows: readonly { title: string; amountMinor: number; age: number }[] = [
  { title: 'Lắp hệ đèn phòng khách', amountMinor: 800000, age: 0 },
  { title: 'Sửa vòi nước bồn rửa', amountMinor: 450000, age: 0 },
  { title: 'Máy lạnh không mát', amountMinor: 600000, age: 2 },
  { title: 'Thông cống nhà bếp', amountMinor: 380000, age: 3 },
  { title: 'Thay ổ khoá cửa chính', amountMinor: 650000, age: 4 },
  { title: 'Vệ sinh sofa 3 chỗ', amountMinor: 450000, age: 5 },
];

export function sampleEarningRecords(now: Date): WorkerEarningRecord[] {
  const today = dayNumber(vietnamDayKey(now));
  return sampleRows.map((row, index) => ({
    job_id: `sample-${index + 1}`,
    title: row.title,
    amount_minor: row.amountMinor,
    currency: 'VND',
    accepted_at: now.toISOString(),
    completed_on: dayKey(today - row.age),
  }));
}
