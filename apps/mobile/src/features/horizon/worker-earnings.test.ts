import type { WorkerEarningRecord } from '@/features/shared';

import { earningsTodayMinor, sampleEarningRecords, toEarningsView, vietnamDayKey } from './worker-earnings';

const now = new Date('2026-11-03T03:00:00Z');

function row(id: string, completedOn: string, amount: number, currency = 'VND'): WorkerEarningRecord {
  return { job_id: id, title: `Việc ${id}`, amount_minor: amount, currency, accepted_at: `${completedOn}T03:00:00Z`, completed_on: completedOn };
}

test('the day follows Vietnam time even when UTC is still the previous day', () => {
  expect(vietnamDayKey(new Date('2026-11-02T17:30:00Z'))).toBe('2026-11-03');
  expect(vietnamDayKey(new Date('2026-11-02T16:59:00Z'))).toBe('2026-11-02');
});

test('periods sum today, the last seven days and the month', () => {
  const view = toEarningsView([row('a', '2026-11-03', 100), row('b', '2026-11-03', 50), row('c', '2026-10-28', 200), row('d', '2026-10-27', 400), row('e', '2026-11-01', 300)], now);
  expect(view.periods.map(item => [item.period, item.totalMinor, item.jobCount])).toEqual([
    ['today', 150, 2],
    ['week', 650, 4],
    ['month', 450, 3],
  ]);
});

test('the seven day window includes six days ago and excludes seven', () => {
  const view = toEarningsView([row('in', '2026-10-28', 10), row('out', '2026-10-27', 20)], now);
  expect(view.periods[1]?.totalMinor).toBe(10);
  expect(view.entries.week.map(entry => entry.id)).toEqual(['in']);
});

test('future days and other currencies are ignored', () => {
  const view = toEarningsView([row('f', '2026-11-04', 10), row('u', '2026-11-03', 20, 'USD')], now);
  expect(view.periods.map(item => item.totalMinor)).toEqual([0, 0, 0]);
});

test('the chart ends today, labels weekdays and puts amounts on their own day', () => {
  const view = toEarningsView([row('a', '2026-11-03', 100), row('b', '2026-11-01', 40)], now);
  expect(view.days.map(day => day.label)).toEqual(['T4', 'T5', 'T6', 'T7', 'CN', 'T2', 'T3']);
  expect(view.days.map(day => day.amountMinor)).toEqual([0, 0, 0, 0, 40, 0, 100]);
  expect(view.days.filter(day => day.today)).toHaveLength(1);
  expect(view.days[6]?.today).toBe(true);
});

test('entries describe when the job was accepted', () => {
  const view = toEarningsView([row('a', '2026-11-03', 1), row('b', '2026-11-02', 1), row('c', '2026-11-01', 1)], now);
  expect(view.entries.month.map(entry => entry.dayLabel)).toEqual(['Hôm nay', 'Hôm qua', 'Chủ nhật']);
});

test('older entries fall back to a date', () => {
  const later = new Date('2026-11-20T03:00:00Z');
  expect(toEarningsView([row('d', '2026-11-05', 1)], later).entries.month[0]?.dayLabel).toBe('05/11');
});

test('an empty history gives zero totals and an empty chart', () => {
  const view = toEarningsView([], now);
  expect(view.periods.every(item => item.totalMinor === 0 && item.jobCount === 0)).toBe(true);
  expect(view.days.every(day => day.amountMinor === 0)).toBe(true);
  expect(earningsTodayMinor([], now)).toBe(0);
});

test('the sidebar total is today only', () => {
  expect(earningsTodayMinor([row('a', '2026-11-03', 100), row('b', '2026-11-02', 900)], now)).toBe(100);
});

test('the preview sample adds up across periods, chart and list', () => {
  const view = toEarningsView(sampleEarningRecords(now), now);
  expect(view.periods[0]?.totalMinor).toBe(1250000);
  expect(view.days.reduce((sum, day) => sum + day.amountMinor, 0)).toBe(view.periods[1]?.totalMinor);
});
