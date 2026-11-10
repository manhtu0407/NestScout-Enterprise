import { consumeKaelHandoff, handOffToKael, takeKaelHandoff, quotePrompt, requestPrompt, savedWorkerPrompt, workerJobPrompt } from './kael-handoff';

test('a prompt handed to Kael is delivered once and a blank prompt is ignored', () => {
  handOffToKael('  Hỏi về yêu cầu  ');
  expect(consumeKaelHandoff()).toBe('Hỏi về yêu cầu');
  expect(consumeKaelHandoff()).toBeNull();
  handOffToKael('   ');
  expect(consumeKaelHandoff()).toBeNull();
});

test('prompts carry the visible context and never claim a booking', () => {
  expect(requestPrompt({ title: 'Sửa máy lạnh', status: 'Có báo giá mới', nextAction: 'Xem báo giá và quyết định.' })).toContain('"Sửa máy lạnh"');
  expect(quotePrompt({ requestTitle: 'Sửa máy lạnh', version: 2, expired: true })).toContain('đã hết hạn');
  expect(quotePrompt({ requestTitle: 'Sửa máy lạnh', version: 2, expired: false })).toContain('trước khi mình quyết định');
  expect(savedWorkerPrompt({ name: 'Thợ Minh', trade: 'Điện lạnh', area: 'Quận 7' })).toContain('Thợ Minh');
  expect(workerJobPrompt({ title: 'Vệ sinh máy lạnh', stageLabel: 'Đang đi tới' })).toContain('Đang đi tới');
  for (const prompt of [requestPrompt({ title: 'x', status: 'y', nextAction: 'z' }), workerJobPrompt({ title: 'x' })]) expect(prompt).not.toMatch(/đã đặt|đã xác nhận lịch/);
});

test('a handoff says whether it needs a fresh session and defaults to the open one', () => {
  handOffToKael('Hỏi trong phiên hiện tại');
  expect(takeKaelHandoff()).toEqual({ prompt: 'Hỏi trong phiên hiện tại', fresh: false });
  handOffToKael('Trao đổi về dịch vụ', { fresh: true });
  expect(takeKaelHandoff()).toEqual({ prompt: 'Trao đổi về dịch vụ', fresh: true });
  expect(takeKaelHandoff()).toBeNull();
});
