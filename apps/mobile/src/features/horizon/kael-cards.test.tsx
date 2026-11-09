import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { CaseApprovalCard, missingCount, summarize } from './case-approval-card';
import type { ApprovalStep } from './case-approval-card';
import { RecommendationCard, confidenceLevel, filledSegments } from './recommendation-card';
import type { Recommendation } from './recommendation-card';
import { SelectionActions, selectedText, selectionPrompt } from './selection-actions';

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const steps: readonly ApprovalStep[] = [
  { id: 'area', question: 'Khu vực nào?', options: [{ id: 'q1', label: 'Quận 1' }, { id: 'q7', label: 'Quận 7' }] },
  { id: 'issue', question: 'Tình trạng?', options: [{ id: 'leak', label: 'Rò nước' }] },
];

test('summarize keeps every question and marks skipped or unanswered ones as missing', () => {
  const lines = summarize(steps, { area: 'Quận 7', issue: null });
  expect(lines).toEqual([{ id: 'area', question: 'Khu vực nào?', answer: 'Quận 7' }, { id: 'issue', question: 'Tình trạng?', answer: null }]);
  expect(missingCount(lines)).toBe(1);
  expect(missingCount(summarize(steps, {}))).toBe(2);
});

test('the approval card walks the steps, lets a skipped answer be fixed, and confirms only once', async () => {
  const onConfirm = jest.fn();
  await render(<CaseApprovalCard steps={steps} onConfirm={onConfirm} />);
  expect(screen.getByText('1 / 2')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tiếp tục' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByRole('radio', { name: 'Quận 7' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Tiếp tục' }));
  expect(screen.getByText('2 / 2')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Bỏ qua' }));
  expect(screen.getByText('Tóm tắt yêu cầu')).toBeTruthy();
  expect(screen.getByText('Còn thiếu 1 mục')).toBeTruthy();
  expect(screen.getByText('Chưa cung cấp')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Sửa: Tình trạng?'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Rò nước' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Xem tóm tắt' }));
  expect(screen.getByText('Đầy đủ thông tin')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Xác nhận yêu cầu' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith({ area: 'Quận 7', issue: 'Rò nước' });
  expect(screen.getByText('Đã xác nhận yêu cầu. Chưa có thợ nào được đặt.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Xác nhận yêu cầu' })).toBeNull();
});

test('an Other answer needs text before the card can continue', async () => {
  await render(<CaseApprovalCard steps={steps} onConfirm={jest.fn()} />);
  await fireEvent.press(screen.getByRole('radio', { name: 'Khác…' }));
  expect(screen.getByRole('button', { name: 'Tiếp tục' }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('Câu trả lời khác'), 'Quận Gò Vấp');
  expect(screen.getByRole('button', { name: 'Tiếp tục' }).props.accessibilityState.disabled).toBe(false);
});

const recommendation: Recommendation = {
  id: 'r',
  topic: 'Điều hòa',
  prompt: 'Bạn muốn làm gì?',
  options: [
    { id: 'a', title: 'Vệ sinh máy', detail: 'Phổ biến nhất.', confidence: 0.9 },
    { id: 'b', title: 'Nạp gas', detail: 'Cần kiểm tra trước.', confidence: 0.5 },
    { id: 'c', title: 'Thay máy', detail: 'Chưa đủ dữ kiện.', confidence: 0.2 },
  ],
};

test('confidence maps to three levels and a five-segment meter at the boundaries', () => {
  expect(confidenceLevel(0.75)).toBe('high');
  expect(confidenceLevel(0.74)).toBe('medium');
  expect(confidenceLevel(0.45)).toBe('medium');
  expect(confidenceLevel(0.44)).toBe('low');
  expect(filledSegments(0)).toBe(0);
  expect(filledSegments(1)).toBe(5);
  expect(filledSegments(2)).toBe(5);
  expect(filledSegments(0.5)).toBe(3);
});

test('the recommendation card swaps to another option and reports the accepted one', async () => {
  const onAccept = jest.fn();
  await render(<RecommendationCard recommendation={recommendation} onAccept={onAccept} />);
  expect(screen.getByText('Vệ sinh máy')).toBeTruthy();
  expect(screen.queryByLabelText('Phương án khác')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Phương án khác' }));
  await fireEvent.press(screen.getByLabelText('Chọn phương án: Nạp gas'));
  expect(screen.getByText('Nạp gas')).toBeTruthy();
  expect(screen.getByText('Độ tin cậy trung bình')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Chấp nhận' }));
  expect(onAccept).toHaveBeenCalledWith(recommendation.options[1]);
  expect(screen.getByText('Đã chọn: Nạp gas')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Chấp nhận' })).toBeNull();
});

test('selection helpers trim the chosen range in either direction and phrase the request', () => {
  expect(selectedText('Xin chào Kael', { start: 4, end: 9 })).toBe('chào');
  expect(selectedText('Xin chào Kael', { start: 9, end: 4 })).toBe('chào');
  expect(selectedText('Xin chào', { start: 3, end: 3 })).toBe('');
  expect(selectionPrompt('shorten', 'câu dài')).toBe('Rút gọn đoạn: “câu dài”');
});

test('the action bar appears only for a selection and sends that selection to Kael', async () => {
  const onAction = jest.fn();
  await render(<SelectionActions text="Máy lạnh không mát thường do thiếu gas." onAction={onAction} />);
  expect(screen.queryByRole('button', { name: 'Rút gọn' })).toBeNull();
  const field = screen.getByLabelText('Đoạn văn có thể bôi đen');
  await act(async () => field.props.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 12 } } }));
  for (const label of ['Giải thích', 'Cải thiện', 'Rút gọn', 'Giọng điệu', 'Ngữ pháp']) expect(screen.getByRole('button', { name: label })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Rút gọn' }));
  expect(onAction).toHaveBeenCalledWith('shorten', 'Máy lạnh khô');
  expect(screen.getByText('Đã gửi cho Kael: Rút gọn đoạn: “Máy lạnh khô”')).toBeTruthy();
  await act(async () => field.props.onSelectionChange({ nativeEvent: { selection: { start: 5, end: 5 } } }));
  expect(screen.queryByRole('button', { name: 'Rút gọn' })).toBeNull();
});
