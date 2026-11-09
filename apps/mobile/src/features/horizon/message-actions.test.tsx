import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { MessageActions } from './message-actions';

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('copy works while regenerate, feedback and read-aloud stay locked as Coming Soon', async () => {
  const onCopy = jest.fn();
  const onRegenerate = jest.fn();
  const onFeedback = jest.fn();
  await render(<MessageActions text="Xin chào" onCopy={onCopy} onRegenerate={onRegenerate} onFeedback={onFeedback} soon />);
  expect(screen.getByText('Coming Soon')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Sao chép'));
  expect(onCopy).toHaveBeenCalledWith('Xin chào');
  for (const label of ['Tạo lại câu trả lời', 'Câu trả lời tốt', 'Câu trả lời chưa tốt', 'Đọc to']) {
    expect(screen.getByLabelText(label).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText(label));
  }
  expect(onRegenerate).not.toHaveBeenCalled();
  expect(onFeedback).not.toHaveBeenCalled();
});
