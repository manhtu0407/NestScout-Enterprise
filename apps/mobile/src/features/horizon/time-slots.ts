export type TimeFormat = '12h' | '24h';

export type MinuteStep = 5 | 10 | 15 | 30;

const pattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function isTimeValue(value: string): boolean {
  return pattern.test(value);
}

export function timeSlots(step: MinuteStep): readonly string[] {
  const slots: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    slots.push(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`);
  }
  return slots;
}

export function formatTime(value: string, format: TimeFormat): string {
  const match = pattern.exec(value);
  if (match === null) return value;
  if (format === '24h') return value;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? 'CH' : 'SA';
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${shown}:${match[2]} ${suffix}`;
}

export function nearestSlot(value: string | null, step: MinuteStep): string | null {
  if (value === null || !isTimeValue(value)) return null;
  const minutes = Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const rounded = Math.round(minutes / step) * step;
  const clamped = Math.min(rounded, 24 * 60 - step);
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
}

export function combineDateAndTime(date: Date, value: string): Date | null {
  if (!isTimeValue(value)) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Number(value.slice(0, 2)), Number(value.slice(3, 5)));
}
