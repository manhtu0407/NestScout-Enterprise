import type { DispatchServiceId, EscalationResolution, EscalationStatus, RetryResult } from '@/features/shared';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

export function clockLabel(iso: string): string {
  const at = new Date(iso);
  return `${twoDigits(at.getHours())}:${twoDigits(at.getMinutes())}`;
}

export const serviceLabels: Record<DispatchServiceId, string> = {
  electric: 'Điện',
  water: 'Nước',
  aircon: 'Máy lạnh',
  paint: 'Sơn, chống thấm',
  sofa: 'Vệ sinh sofa',
  other: 'Khác',
};

export function retryMessage(result: RetryResult): string {
  switch (result.outcome) {
    case 'invited':
      return 'Đã mời thêm thợ. Chưa có thợ nhận việc; yêu cầu chỉ được giao khi một thợ xác nhận.';
    case 'no_eligible_worker':
      return result.retriesLeft > 0
        ? 'Hiện chưa có thợ phù hợp để mời. Bạn có thể thử lại sau ít phút hoặc hủy yêu cầu.'
        : 'Hiện chưa có thợ phù hợp để mời và đã hết lượt mời lại. Bạn có thể hủy yêu cầu.';
    case 'limit_reached':
      return 'Đã hết lượt mời lại cho yêu cầu này. Bạn có thể hủy yêu cầu.';
    case 'cooldown':
      return result.nextRetryAt === null ? 'Vừa mời thợ gần đây, hãy thử lại sau ít phút.' : `Vừa mời thợ gần đây, bạn có thể thử lại sau ${clockLabel(result.nextRetryAt)}.`;
    case 'already_searching':
      return 'Yêu cầu đang được gửi tới thợ. Hãy chờ thợ nhận việc.';
    case 'already_assigned':
      return 'Đã có thợ nhận việc cho yêu cầu này.';
    case 'cancelled':
      return 'Yêu cầu này đã được hủy.';
    case 'needs_service':
      return 'Hãy chọn loại dịch vụ trước khi mời thợ.';
    case 'dispatch_disabled':
      return 'Việc ghép thợ đang tạm dừng. Yêu cầu của bạn vẫn được giữ.';
    case 'invalid_request':
      return 'Yêu cầu này chưa sẵn sàng để mời thợ.';
  }
}

export function escalationCopy(status: EscalationStatus | null, resolution: EscalationResolution | null): string {
  if (status === 'reviewing') return 'Bạn đã báo sự cố cho việc này. Đội hỗ trợ đang xem xét.';
  if (status === 'resolved') {
    if (resolution === 'proceed') return 'Sự cố đã được xem xét. Thợ sẽ tiếp tục công việc.';
    if (resolution === 'replace_worker') return 'Sự cố đã được xem xét và việc được giao cho thợ khác.';
    return 'Sự cố đã được xem xét và đóng, chưa cần xử lý thêm.';
  }
  return 'Bạn đã báo sự cố cho việc này. Thợ đã được báo và yêu cầu đang chờ xử lý.';
}
