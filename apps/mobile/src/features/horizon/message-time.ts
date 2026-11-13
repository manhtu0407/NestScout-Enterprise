const pad = (value: number) => String(value).padStart(2, '0');

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function formatSentAt(sentAt: number, now: number = Date.now()): string {
  const sent = new Date(sentAt);
  const clock = `${pad(sent.getHours())}:${pad(sent.getMinutes())}`;
  if (sameDay(sent, new Date(now))) return clock;
  const date = `${pad(sent.getDate())}/${pad(sent.getMonth() + 1)}`;
  return sent.getFullYear() === new Date(now).getFullYear() ? `${clock}, ${date}` : `${clock}, ${date}/${sent.getFullYear()}`;
}
