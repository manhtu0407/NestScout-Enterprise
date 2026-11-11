import { serviceCategories } from './service-catalog';
import { isServiceOpening, planServiceEntry, serviceEntryKeptNotice } from './service-entry';

const openings = {
  electric: 'Kael ơi, mình đang gặp vấn đề về điện ở nhà. Bạn giúp mình nhé.',
  plumbing: 'Kael ơi, mình đang gặp vấn đề về nước ở nhà. Bạn giúp mình nhé.',
  aircon: 'Kael ơi, mình cần hỗ trợ về máy lạnh. Bạn tư vấn giúp mình nhé.',
  'house-cleaning': 'Kael ơi, mình muốn tìm dịch vụ vệ sinh nhà. Bạn giúp mình nhé.',
  'sofa-cleaning': 'Kael ơi, mình muốn tìm dịch vụ vệ sinh sofa. Bạn tư vấn giúp mình nhé.',
  'minor-repair': 'Kael ơi, mình cần lắp đặt hoặc sửa vài đồ trong nhà. Bạn giúp mình nhé.',
  other: 'Kael ơi, mình cần hỗ trợ một việc tại nhà nhưng chưa biết chọn dịch vụ nào. Bạn giúp mình nhé.',
} as const;

const empty = { text: '', hasConversation: false, canParkDraft: false };

test('every category has its own friendly first-person opening with no instructions to the assistant', () => {
  expect(Object.fromEntries(serviceCategories.map(category => [category.id, category.kaelOpening]))).toEqual(openings);
  expect(new Set(Object.values(openings)).size).toBe(7);
  for (const text of Object.values(openings)) {
    expect(text).toMatch(/^Kael ơi, mình /);
    expect(text).not.toMatch(/Hãy hỏi|từng câu|khách hàng này|địa chỉ và thời gian/i);
  }
});

test('an empty composer receives the opening for the chosen category without starting a conversation', () => {
  for (const category of serviceCategories) {
    expect(planServiceEntry(category.id, empty)).toEqual({ kind: 'prefill', text: category.kaelOpening, fresh: false });
  }
});

test('choosing the same category again is idempotent and choosing another replaces an untouched opening', () => {
  expect(planServiceEntry('plumbing', { ...empty, text: openings.plumbing })).toEqual({ kind: 'prefill', text: openings.plumbing, fresh: false });
  expect(planServiceEntry('aircon', { ...empty, text: `${openings.plumbing}  ` })).toEqual({ kind: 'prefill', text: openings.aircon, fresh: false });
});

test('a message the user typed is never overwritten or merged when it cannot be parked', () => {
  const typed = { ...empty, text: 'Mình muốn hỏi về hoá đơn' };
  expect(planServiceEntry('plumbing', typed)).toEqual({ kind: 'keep', notice: serviceEntryKeptNotice });
  expect(planServiceEntry('plumbing', { ...typed, hasConversation: true, canParkDraft: false })).toEqual({ kind: 'keep', notice: serviceEntryKeptNotice });
  expect(planServiceEntry('plumbing', { ...empty, text: `${openings.plumbing} Vòi bếp bị rò.` })).toEqual({ kind: 'keep', notice: serviceEntryKeptNotice });
});

test('an existing conversation is left intact and the service starts a separate chat', () => {
  expect(planServiceEntry('sofa-cleaning', { text: '', hasConversation: true, canParkDraft: true })).toEqual({ kind: 'prefill', text: openings['sofa-cleaning'], fresh: true });
  expect(planServiceEntry('sofa-cleaning', { text: 'Nháp của phiên cũ', hasConversation: true, canParkDraft: true })).toEqual({ kind: 'prefill', text: openings['sofa-cleaning'], fresh: true });
});

test('an unknown category changes nothing', () => {
  expect(planServiceEntry('pest-control', empty)).toBeNull();
  expect(isServiceOpening('Kael ơi')).toBe(false);
  expect(isServiceOpening(` ${openings.other} `)).toBe(true);
});
