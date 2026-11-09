const pattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;

export function parseProposedTime(text: string, now: Date): string | null {
  const match = pattern.exec(text.trim());
  if (match === null) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute);
  const sameDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!sameDate || date.getTime() <= now.getTime()) return null;
  return date.toISOString();
}
