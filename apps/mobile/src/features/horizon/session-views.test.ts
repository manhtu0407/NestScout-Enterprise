import type { KaelSession } from '@/features/shared';

import { toSessionRows, untitledSession } from './session-views';

const now = new Date('2026-11-10T10:00:00.000Z');
const session = (overrides: Partial<KaelSession>): KaelSession => ({ id: 's1', title: 'Sửa vòi nước', preview: 'Đã ghi nhận', updatedAt: '2026-11-10T07:00:00.000Z', pinned: false, archived: false, ...overrides });

test('rows come from conversations: identifier, title, latest message and pin state', () => {
  const rows = toSessionRows([session({}), session({ id: 's2', title: 'Vệ sinh sofa', pinned: true, updatedAt: '2026-11-09T07:00:00.000Z' })], now);
  expect(rows).toEqual([
    { id: 's1', title: 'Sửa vòi nước', preview: 'Đã ghi nhận', timeLabel: '3 giờ trước', phase: null, pinned: false },
    { id: 's2', title: 'Vệ sinh sofa', preview: 'Đã ghi nhận', timeLabel: 'Hôm qua', phase: null, pinned: true },
  ]);
});

test('a conversation without a readable title still gets a row title', () => {
  expect(toSessionRows([session({ title: '' })], now)[0]?.title).toBe(untitledSession);
});
