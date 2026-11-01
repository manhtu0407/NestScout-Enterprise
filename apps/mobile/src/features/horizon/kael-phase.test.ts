import { expressionForPhase, findKaelPhaseEntry, kaelPhaseEntries, kaelPhaseLabels, kaelPhases } from './kael-phase';

test('the booking phases keep the approved order and each phase has one expression', () => {
  expect(kaelPhases).toEqual(['clarifying', 'matching', 'quotes', 'approval', 'booked', 'enroute', 'working', 'completed']);
  expect(kaelPhaseEntries.map(entry => [entry.id, entry.expression, entry.tone])).toEqual([
    ['clarifying', 'thinking', 'busy'],
    ['matching', 'focus', 'busy'],
    ['quotes', 'alert', 'alert'],
    ['approval', 'calm', 'alert'],
    ['booked', 'happy', 'done'],
    ['enroute', 'calm', 'normal'],
    ['working', 'focus', 'normal'],
    ['completed', 'happy', 'done'],
  ]);
});

test('approval waits for the user while booked and completed are distinct confirmed states', () => {
  expect(findKaelPhaseEntry('approval').short).toBe('Đang chờ cậu xác nhận');
  expect(findKaelPhaseEntry('booked').short).toBe('Đã xác nhận lịch hẹn');
  expect(findKaelPhaseEntry('completed').short).toBe('Dịch vụ đã hoàn tất');
  expect(findKaelPhaseEntry('approval').tone).not.toBe(findKaelPhaseEntry('booked').tone);
});

test('without an active booking Kael shows the base figure rather than a phase expression', () => {
  expect(expressionForPhase(null)).toBeNull();
  expect(expressionForPhase('quotes')).toBe('alert');
});

test('labels cover every phase', () => {
  for (const phase of kaelPhases) expect(kaelPhaseLabels[phase]).toBe(findKaelPhaseEntry(phase).short);
});
