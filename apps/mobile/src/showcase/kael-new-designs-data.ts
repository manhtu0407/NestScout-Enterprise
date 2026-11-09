import type { ApprovalStep, Recommendation } from '@/features/horizon';

export const sampleToday = new Date(2026, 10, 9);

export function sundayBusy(date: Date): boolean {
  return date.getDay() === 0;
}

export const approvalSteps: readonly ApprovalStep[] = [
  {
    id: 'area',
    question: 'Thợ cần đến khu vực nào?',
    hint: 'Kael dùng khu vực để tìm thợ gần bạn nhất.',
    options: [{ id: 'q1', label: 'Quận 1' }, { id: 'q7', label: 'Quận 7' }, { id: 'td', label: 'TP. Thủ Đức' }],
  },
  {
    id: 'day',
    question: 'Bạn muốn thợ đến vào ngày nào?',
    date: { today: sampleToday, isUnavailable: sundayBusy },
  },
  {
    id: 'issue',
    question: 'Tình trạng hiện tại của thiết bị?',
    options: [{ id: 'leak', label: 'Rò nước nhẹ' }, { id: 'burst', label: 'Chảy mạnh, cần xử lý gấp' }, { id: 'noise', label: 'Phát ra tiếng ồn lạ' }],
  },
];

export const recommendations: readonly Recommendation[] = [
  {
    id: 'rec-aircon',
    topic: 'Điều hòa',
    prompt: 'Kael gợi ý bước tiếp theo cho máy lạnh không mát. Bạn muốn làm gì?',
    options: [
      { id: 'clean', title: 'Vệ sinh và kiểm tra gas', detail: 'Phổ biến nhất khi máy lạnh yếu dần. Thợ kiểm tra dàn lạnh, đo áp suất gas.', confidence: 0.86 },
      { id: 'refill', title: 'Nạp thêm gas ngay', detail: 'Chỉ nên làm sau khi kiểm tra rò rỉ. Chi phí cao hơn nếu gas không thiếu.', confidence: 0.52 },
      { id: 'replace', title: 'Thay máy mới', detail: 'Cân nhắc nếu máy đã dùng trên 10 năm. Chưa đủ dữ kiện để khuyên.', confidence: 0.22 },
    ],
  },
  {
    id: 'rec-faucet',
    topic: 'Vòi nước',
    prompt: 'Kael gợi ý cách xử lý vòi nước bị rò. Bạn chọn phương án nào?',
    options: [
      { id: 'seal', title: 'Thay gioăng và siết lại chân vòi', detail: 'Cách sửa nhanh, thường dưới một giờ, không cần thay cả vòi.', confidence: 0.78 },
      { id: 'tap', title: 'Thay cả vòi mới', detail: 'Phù hợp khi thân vòi nứt hoặc gỉ sét.', confidence: 0.48 },
    ],
  },
  {
    id: 'rec-power',
    topic: 'Điện',
    prompt: 'Kael gợi ý cho ổ cắm bị chập chờn. Bạn muốn làm gì?',
    options: [
      { id: 'inspect', title: 'Nhờ thợ điện kiểm tra dây và ổ cắm', detail: 'An toàn nhất. Ngắt cầu dao khu vực đó trước khi thợ đến.', confidence: 0.91 },
      { id: 'swap', title: 'Thay riêng ổ cắm', detail: 'Chỉ nên khi dây còn tốt. Cần thợ xác nhận.', confidence: 0.4 },
    ],
  },
];

export const selectionSample = 'Máy lạnh không mát thường do dàn lạnh bám bụi hoặc thiếu gas. Nên vệ sinh định kỳ mỗi sáu tháng để máy chạy bền và tiết kiệm điện. Nếu sau khi vệ sinh vẫn không mát, hãy nhờ thợ đo áp suất gas trước khi quyết định nạp thêm.';

export const chatQuestion = 'Máy lạnh phòng ngủ nhà mình chạy mà không mát, cần xử lý sao?';
