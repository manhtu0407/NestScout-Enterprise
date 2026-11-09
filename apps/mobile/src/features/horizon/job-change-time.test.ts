import { parseProposedTime } from './job-change-time';

const now = new Date(2026, 10, 9, 10, 0);

test('parses a future local date and time into an ISO instant', () => {
  expect(parseProposedTime('20/11/2026 09:30', now)).toBe(new Date(2026, 10, 20, 9, 30).toISOString());
  expect(parseProposedTime(' 1/12/2026   7:05 ', now)).toBe(new Date(2026, 11, 1, 7, 5).toISOString());
});

test('rejects past, impossible or malformed times', () => {
  expect(parseProposedTime('09/11/2026 09:30', now)).toBeNull();
  expect(parseProposedTime('31/02/2026 09:30', now)).toBeNull();
  expect(parseProposedTime('20/13/2026 09:30', now)).toBeNull();
  expect(parseProposedTime('20/11/2026 24:00', now)).toBeNull();
  expect(parseProposedTime('2026-11-20 09:30', now)).toBeNull();
  expect(parseProposedTime('', now)).toBeNull();
});
