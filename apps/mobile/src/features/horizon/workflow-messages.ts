import { WorkflowError, type WorkflowFailure } from '@/features/shared';

const definitive: Record<Exclude<WorkflowFailure, 'unknown'>, string> = {
  forbidden: 'Thao tác này không khả dụng cho tài khoản hoặc mục này.',
  stale: 'Mục này đã thay đổi sau khi tải. Đã tải lại, hãy xem lại rồi thử lại.',
  expired: 'Báo giá này đã hết hạn. Hãy chờ báo giá mới.',
  unavailable: 'Mục này không còn khả dụng. Đã tải lại trạng thái mới nhất.',
  invalid: 'Một số thông tin chưa được chấp nhận. Hãy kiểm tra và thử lại.',
  rejected: 'Bước này không còn khả dụng. Đã tải lại trạng thái mới nhất.',
};

export const uncertainMessage = 'Chưa xác định được kết quả. Hãy mở lại mục này để xem trạng thái hiện tại.';

export function workflowMessage(error: unknown): string {
  return error instanceof WorkflowError && error.failure !== 'unknown' ? definitive[error.failure] : uncertainMessage;
}
