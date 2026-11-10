import { dayKey, dayNumber, weekdayOf } from './worker-earnings';

export type ActivityCell = { key: string; count: number; future: boolean };

export type ActivityColumn = { cells: readonly ActivityCell[]; monthLabel: string | null };

export type ActivityRange = 'month' | 'quarter' | 'year';

export const activityRanges: readonly { range: ActivityRange; label: string; weeks: number }[] = [
  { range: 'month', label: 'Tháng', weeks: 5 },
  { range: 'quarter', label: '3 tháng', weeks: 13 },
  { range: 'year', label: 'Năm', weeks: 53 },
];

const weekdayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function weekdayLabelOf(key: string): string {
  const index = (weekdayOf(dayNumber(key)) + 6) % 7;
  return weekdayLabels[index] ?? key;
}

export function formatDayKey(key: string): string {
  return `${weekdayLabelOf(key)}, ${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

export function activityGrid(activity: Readonly<Record<string, number>>, todayKey: string, weeks: number): ActivityColumn[] {
  const today = dayNumber(todayKey);
  const todayIndex = (weekdayOf(today) + 6) % 7;
  const start = today - todayIndex - 7 * (weeks - 1);
  let previousMonth = '';
  return Array.from({ length: weeks }, (_, column) => {
    const cells: ActivityCell[] = Array.from({ length: 7 }, (_, row) => {
      const number = start + column * 7 + row;
      const key = dayKey(number);
      return { key, count: activity[key] ?? 0, future: number > today };
    });
    const month = cells[0]?.key.slice(0, 7) ?? '';
    const monthLabel = month !== previousMonth ? (monthNames[Number(month.slice(5, 7)) - 1] ?? null) : null;
    previousMonth = month;
    return { cells, monthLabel };
  });
}

export function spacedMonthLabels(columns: readonly ActivityColumn[], trailing: number, minGap: number): (string | null)[] {
  const labels = columns.map(column => column.monthLabel);
  let nextKept = Number.POSITIVE_INFINITY;
  for (let index = labels.length - 1; index >= 0; index -= 1) {
    if (labels[index] === null) continue;
    const tooClose = nextKept - index < minGap;
    const tooLate = index > labels.length - 1 - trailing;
    if (tooClose || tooLate) labels[index] = null;
    else nextKept = index;
  }
  return labels;
}

export function activityTotal(columns: readonly ActivityColumn[]): number {
  return columns.reduce((sum, column) => sum + column.cells.reduce((inner, cell) => inner + (cell.future ? 0 : cell.count), 0), 0);
}

export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

export type ActivityStats = { total: number; today: number; busiestKey: string | null; busiestCount: number; longestStreak: number };

export function activityStats(activity: Readonly<Record<string, number>>, todayKey: string): ActivityStats {
  const days = Object.keys(activity).filter(key => (activity[key] ?? 0) > 0).sort();
  let total = 0;
  let busiestKey: string | null = null;
  let busiestCount = 0;
  let longestStreak = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const key of days) {
    const count = activity[key] ?? 0;
    total += count;
    if (count > busiestCount) {
      busiestCount = count;
      busiestKey = key;
    }
    const number = dayNumber(key);
    run = number - previous === 1 ? run + 1 : 1;
    previous = number;
    longestStreak = Math.max(longestStreak, run);
  }
  return { total, today: activity[todayKey] ?? 0, busiestKey, busiestCount, longestStreak };
}
