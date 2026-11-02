export const kaelPhases = ['clarifying', 'matching', 'quotes', 'approval', 'booked', 'enroute', 'working', 'completed'] as const;

export type KaelPhase = typeof kaelPhases[number];

export const kaelPhaseIssues = ['needs_information', 'unmatched', 'unavailable'] as const;

export type KaelPhaseIssue = typeof kaelPhaseIssues[number];

export const kaelPhaseIssueNotes: Readonly<Record<KaelPhaseIssue, { short: string; description: string }>> = {
  needs_information: { short: 'Kael cần thêm thông tin', description: 'Yêu cầu còn thiếu thông tin để tiếp tục. Chưa có thợ nào được xác nhận.' },
  unmatched: { short: 'Chưa tìm được thợ phù hợp', description: 'Chưa có phương án nào khớp với yêu cầu. Chưa có thợ nào được xác nhận.' },
  unavailable: { short: 'Chưa thể ghép thợ lúc này', description: 'Việc ghép thợ tạm thời chưa khả dụng. Chưa có thợ nào được xác nhận.' },
};

export type KaelExpression = 'idle' | 'thinking' | 'focus' | 'alert' | 'calm' | 'happy' | 'heart';

export type KaelPhaseTone = 'busy' | 'alert' | 'normal' | 'done';

export type KaelPhaseEntry = Readonly<{
  id: KaelPhase;
  control: string;
  title: string;
  short: string;
  description: string;
  next: string;
  symbol: string;
  tone: KaelPhaseTone;
  expression: KaelExpression;
  emotion: string;
}>;

export const kaelPhaseEntries: readonly KaelPhaseEntry[] = [
  {
    id: 'clarifying',
    control: 'Làm rõ nhu cầu',
    title: 'Làm rõ nhu cầu',
    short: 'Kael đang làm rõ nhu cầu',
    description: 'Đang xác định tình trạng máy lạnh, địa điểm và thời gian mong muốn trước khi tìm phương án.',
    next: 'Cung cấp thông tin còn thiếu',
    symbol: '?',
    tone: 'busy',
    expression: 'thinking',
    emotion: 'Suy nghĩ',
  },
  {
    id: 'matching',
    control: 'Tìm thợ phù hợp',
    title: 'Đang tìm thợ phù hợp',
    short: 'Đang tìm thợ phù hợp…',
    description: 'Hệ thống đang đối chiếu yêu cầu với những phương án có thể phù hợp. Chưa có thợ nào được xác nhận.',
    next: 'Chờ kết quả đối chiếu',
    symbol: '⌕',
    tone: 'busy',
    expression: 'focus',
    emotion: 'Tập trung',
  },
  {
    id: 'quotes',
    control: 'Có báo giá',
    title: 'Có báo giá để xem',
    short: 'Có báo giá cần xem',
    description: 'Một phương án có báo giá minh họa. Cậu cần kiểm tra phạm vi, điều kiện và chi phí trước khi tiếp tục.',
    next: 'Xem chi tiết báo giá',
    symbol: '≡',
    tone: 'alert',
    expression: 'alert',
    emotion: 'Chú ý',
  },
  {
    id: 'approval',
    control: 'Chờ xác nhận',
    title: 'Chờ cậu xác nhận',
    short: 'Đang chờ cậu xác nhận',
    description: 'Chưa có thao tác đặt lịch nào được thực hiện. Chỉ tiếp tục sau khi cậu đồng ý với phương án.',
    next: 'Xem điều khoản và xác nhận',
    symbol: '!',
    tone: 'alert',
    expression: 'calm',
    emotion: 'Bình tĩnh',
  },
  {
    id: 'booked',
    control: 'Đặt lịch thành công',
    title: 'Lịch hẹn đã được xác nhận',
    short: 'Đã xác nhận lịch hẹn',
    description: 'Trong tình huống mô phỏng này, một lịch hẹn đã được hệ thống và người cung cấp dịch vụ xác nhận.',
    next: 'Xem thời gian hẹn',
    symbol: '✓',
    tone: 'done',
    expression: 'happy',
    emotion: 'Hào hứng',
  },
  {
    id: 'enroute',
    control: 'Thợ đang đến',
    title: 'Thợ đang trên đường',
    short: 'Thợ đang trên đường',
    description: 'Tiến độ di chuyển thuộc về người cung cấp dịch vụ; Kael chỉ tóm tắt thông tin đã được hệ thống ghi nhận.',
    next: 'Xem thông tin chuyến đi',
    symbol: '↗',
    tone: 'normal',
    expression: 'calm',
    emotion: 'Thư giãn',
  },
  {
    id: 'working',
    control: 'Đang thực hiện',
    title: 'Dịch vụ đang thực hiện',
    short: 'Công việc đang thực hiện',
    description: 'Người thợ đang thực hiện công việc tại nhà. Kael sẵn sàng hỗ trợ nếu có thay đổi cần xác nhận.',
    next: 'Xem tiến độ công việc',
    symbol: '•',
    tone: 'normal',
    expression: 'focus',
    emotion: 'Tập trung',
  },
  {
    id: 'completed',
    control: 'Hoàn tất',
    title: 'Công việc đã hoàn tất',
    short: 'Dịch vụ đã hoàn tất',
    description: 'Mô phỏng dịch vụ đã được xác nhận hoàn tất. Cậu có thể xem tóm tắt và phản hồi trải nghiệm.',
    next: 'Xem biên bản hoàn tất',
    symbol: '✓',
    tone: 'done',
    expression: 'happy',
    emotion: 'Vui vẻ',
  },
];

export const kaelPhaseLabels: Record<KaelPhase, string> = Object.fromEntries(
  kaelPhaseEntries.map(entry => [entry.id, entry.short]),
) as Record<KaelPhase, string>;

export function findKaelPhaseEntry(phase: KaelPhase): KaelPhaseEntry {
  const entry = kaelPhaseEntries.find(candidate => candidate.id === phase);
  if (!entry) throw new Error(`Unknown Kael phase: ${phase}`);
  return entry;
}

export function expressionForPhase(phase: KaelPhase | null): KaelExpression | null {
  return phase === null ? null : findKaelPhaseEntry(phase).expression;
}
