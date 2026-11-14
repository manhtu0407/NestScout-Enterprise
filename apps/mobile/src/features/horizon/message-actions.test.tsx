import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { MessageActions } from './message-actions';

test('only connected actions are shown and nothing is labelled Coming Soon', async () => {
  await render(<MessageActions text="Xin chào" onCopy={jest.fn()} />);
  expect(screen.getByLabelText('Sao chép')).toBeTruthy();
  expect(screen.queryByLabelText('Tạo lại câu trả lời')).toBeNull();
  expect(screen.queryByLabelText('Câu trả lời tốt')).toBeNull();
  expect(screen.queryByLabelText('Đọc to')).toBeNull();
  expect(screen.queryByText('Coming Soon')).toBeNull();
});

test('a negative rating saves the chosen reason and a failed save is reported and reverted', async () => {
  const onFeedback = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await render(<MessageActions text="Xin chào" onFeedback={onFeedback} />);
  await fireEvent.press(screen.getByLabelText('Câu trả lời chưa tốt'));
  await fireEvent.press(screen.getByText('Quá dài'));
  await waitFor(() => expect(onFeedback).toHaveBeenLastCalledWith('down', 'too_long'));
  await fireEvent.press(screen.getByLabelText('Câu trả lời tốt'));
  await waitFor(() => expect(screen.getByText('Chưa lưu được phản hồi. Bạn có thể thử lại.')).toBeTruthy());
  expect(screen.getByLabelText('Câu trả lời tốt').props.accessibilityState).toMatchObject({ selected: false });
});

test('regenerate and read-aloud run their handlers', async () => {
  const onRegenerate = jest.fn();
  const onSpeak = jest.fn();
  await render(<MessageActions text="Xin chào" onRegenerate={onRegenerate} onSpeak={onSpeak} speechFailed />);
  await fireEvent.press(screen.getByLabelText('Tạo lại câu trả lời'));
  await fireEvent.press(screen.getByLabelText('Đọc to'));
  expect(onRegenerate).toHaveBeenCalledTimes(1);
  expect(onSpeak).toHaveBeenCalledWith(true);
  expect(screen.getByText('Thiết bị chưa đọc được câu trả lời này.')).toBeTruthy();
});

test('the select-passage action appears only when it can be handled and reports its state', async () => {
  const onSelect = jest.fn();
  const view = await render(<MessageActions text="Trả lời" onSelect={onSelect}/>);
  await fireEvent.press(screen.getByLabelText('Chọn đoạn để hỏi tiếp'));
  expect(onSelect).toHaveBeenCalledTimes(1);
  await view.rerender(<MessageActions text="Trả lời" onSelect={onSelect} selecting/>);
  expect(screen.getByLabelText('Đóng chọn đoạn')).toBeTruthy();
  await view.rerender(<MessageActions text="Trả lời"/>);
  expect(screen.queryByLabelText('Chọn đoạn để hỏi tiếp')).toBeNull();
});
