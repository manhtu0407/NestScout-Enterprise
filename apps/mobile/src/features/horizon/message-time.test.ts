import { formatSentAt } from './message-time';

const now = new Date(2026, 10, 12, 15, 30).getTime();

test('a message sent today shows only the clock time', () => {
  expect(formatSentAt(new Date(2026, 10, 12, 9, 5).getTime(), now)).toBe('09:05');
});

test('a message from an earlier day this year adds the day and month', () => {
  expect(formatSentAt(new Date(2026, 10, 3, 21, 40).getTime(), now)).toBe('21:40, 03/11');
});

test('a message from another year adds the year', () => {
  expect(formatSentAt(new Date(2025, 11, 31, 23, 59).getTime(), now)).toBe('23:59, 31/12/2025');
});
