import type { KaelApproval, KaelTask } from '@/features/shared';

export type KaelAttentionKind = 'verify' | 'confirm' | 'expired' | 'receipt';
export type KaelAttentionTone = 'wait' | 'warn' | 'ok';

export type KaelAttention = { kind: KaelAttentionKind; tone: KaelAttentionTone; title: string; body: string; actionLabel: string | null; receiptId: string | null };

export type KaelAttentionInput = {
  approvals: readonly KaelApproval[];
  tasks: readonly KaelTask[];
  running: boolean;
  notice: string | null;
  receipt: string | null;
  dismissedReceipt: string | null;
  now: number;
};

export function formatCountdown(expiresAt: string, now: number): string {
  const remaining = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

export function deriveKaelAttention({ approvals, tasks, running, notice, receipt, dismissedReceipt, now }: KaelAttentionInput): KaelAttention | null {
  if (running) return null;
  if (approvals.some(approval => approval.kind === 'reconcile')) {
    return { kind: 'verify', tone: 'warn', title: 'Cần kiểm tra lại', body: 'Chưa rõ hệ thống đã nhận yêu cầu bạn xác nhận nên Kael chưa báo đã gửi. Kiểm tra dùng lại đúng lần gửi đó, không tạo yêu cầu mới.', actionLabel: null, receiptId: null };
  }
  const confirm = approvals.find(approval => approval.kind === 'confirm');
  if (confirm) {
    const remaining = confirm.expires_at === null ? '' : ` Còn ${formatCountdown(confirm.expires_at, now)}.`;
    return { kind: 'confirm', tone: 'wait', title: 'Chờ bạn xác nhận', body: `Chưa có gì được gửi cho đến khi bạn trượt để xác nhận.${remaining}`, actionLabel: null, receiptId: null };
  }
  if (notice === null && tasks.some(task => task.status === 'waiting_for_approval')) {
    return { kind: 'expired', tone: 'warn', title: 'Chưa có xác nhận còn hiệu lực', body: 'Chưa có gì được gửi. Nhờ Kael chuẩn bị lại bước xác nhận.', actionLabel: null, receiptId: null };
  }
  if (receipt !== null && receipt !== dismissedReceipt) {
    return { kind: 'receipt', tone: 'ok', title: 'Đã gửi yêu cầu', body: 'Đây mới là bước gửi: chưa có thợ, báo giá hay lịch hẹn nào được xác nhận. Theo dõi trong mục Yêu cầu.', actionLabel: 'Đóng', receiptId: receipt };
  }
  return null;
}
