import type { KaelApproval, KaelTask } from '@/features/shared';

import { deriveKaelAttention, formatCountdown } from './kael-attention';
import type { KaelAttentionInput } from './kael-attention';

const now = Date.parse('2026-11-04T10:00:00Z');
const confirm: KaelApproval = { id: '66666666-6666-4666-8666-666666666666', task_id: '55555555-5555-4555-8555-555555555555', tool: 'service_request_submit', summary: 'Gửi yêu cầu dịch vụ', details: {}, fingerprint: 'a'.repeat(64), kind: 'confirm', expires_at: '2026-11-04T10:01:05Z' };
const reconcile: KaelApproval = { ...confirm, kind: 'reconcile', expires_at: null };
const waiting: KaelTask = { id: confirm.task_id, title: 'Sửa vòi nước', kind: 'service_request', status: 'waiting_for_approval', version: 2, summary: '' };

const input = (overrides: Partial<KaelAttentionInput> = {}): KaelAttentionInput => ({ approvals: [], tasks: [], running: false, notice: null, receipt: null, dismissedReceipt: null, now, ...overrides });

test('a countdown never goes below zero and pads seconds', () => {
  expect(formatCountdown('2026-11-04T10:01:05Z', now)).toBe('1:05');
  expect(formatCountdown('2026-11-04T09:00:00Z', now)).toBe('0:00');
});

test('nothing is shown while a run is processing or when there is no evidence', () => {
  expect(deriveKaelAttention(input())).toBeNull();
  expect(deriveKaelAttention(input({ approvals: [confirm], running: true }))).toBeNull();
  expect(deriveKaelAttention(input({ receipt: 'call-1', running: true }))).toBeNull();
});

test('a pending confirmation is gray and scopes its unsent status to that request', () => {
  const attention = deriveKaelAttention(input({ approvals: [confirm], tasks: [waiting] }));
  expect(attention).toMatchObject({ kind: 'confirm', tone: 'wait', title: 'Chờ bạn xác nhận', actionLabel: null });
  expect(attention?.body).toContain('Yêu cầu này chưa được gửi');
  expect(attention?.body).toContain('Còn 1:05');
});

test('an uncertain submission asks for the check of the same request and outranks everything else', () => {
  const attention = deriveKaelAttention(input({ approvals: [confirm, reconcile], receipt: 'call-1' }));
  expect(attention).toMatchObject({ kind: 'verify', tone: 'warn', actionLabel: null });
  expect(attention?.body).toContain('không tạo yêu cầu mới');
});

test('a task still waiting for approval without a live approval is reported without claiming why it lapsed', () => {
  const attention = deriveKaelAttention(input({ tasks: [waiting] }));
  expect(attention).toMatchObject({ kind: 'expired', tone: 'warn' });
  expect(attention?.title).not.toMatch(/hết hạn/);
  expect(deriveKaelAttention(input({ tasks: [waiting], notice: 'Kết nối bị gián đoạn' }))).toBeNull();
});

test('a receipt appears only for verified evidence, says it is not a booking, and stays dismissed', () => {
  const attention = deriveKaelAttention(input({ receipt: 'call-1' }));
  expect(attention).toMatchObject({ kind: 'receipt', tone: 'ok', title: 'Đã gửi yêu cầu', actionLabel: 'Đóng', receiptId: 'call-1' });
  expect(attention?.body).toContain('Chưa có thợ hay lịch hẹn nào được xác nhận');
  expect(deriveKaelAttention(input({ receipt: 'call-1', dismissedReceipt: 'call-1' }))).toBeNull();
  expect(deriveKaelAttention(input({ receipt: 'call-2', dismissedReceipt: 'call-1' }))).toMatchObject({ kind: 'receipt', receiptId: 'call-2' });
});

test('a completed task or a notice alone is never turned into a success banner', () => {
  const completed: KaelTask = { ...waiting, status: 'completed' };
  expect(deriveKaelAttention(input({ tasks: [completed], notice: null }))).toBeNull();
  expect(deriveKaelAttention(input({ tasks: [completed], notice: 'Đã xong' }))).toBeNull();
});

test.each([{ approvals: [confirm] }, { approvals: [] }])('a different pending task cannot hide a verified receipt', ({ approvals }) => {
  const attention = deriveKaelAttention(input({ approvals, tasks: [waiting], receipt: 'verified-other-task' }));
  expect(attention).toMatchObject({ kind: 'receipt', receiptId: 'verified-other-task' });
  const remaining = deriveKaelAttention(input({ approvals, tasks: [waiting], receipt: 'verified-other-task', dismissedReceipt: 'verified-other-task' }));
  expect(remaining?.body).toContain('Yêu cầu');
  expect(remaining?.body).not.toContain('Chưa có gì được gửi');
});
