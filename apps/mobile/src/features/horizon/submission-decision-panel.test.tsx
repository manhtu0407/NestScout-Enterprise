import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SubmissionDecisionPanel } from './submission-decision-panel';

test('accepting needs a second confirmation that states acceptance is not payment', async () => {
  const onDecide = jest.fn().mockResolvedValue(undefined);
  await render(<SubmissionDecisionPanel evidence="Đã vệ sinh dàn lạnh" onDecide={onDecide} />);
  expect(screen.getByText('Đã vệ sinh dàn lạnh')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Nghiệm thu công việc'));
  expect(onDecide).not.toHaveBeenCalled();
  expect(screen.getByText(/Đây không phải là thanh toán/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Xác nhận nghiệm thu'));
  await waitFor(() => expect(onDecide).toHaveBeenCalledWith('accepted', null));
});

test('a correction or dispute requires a reason and sends it trimmed', async () => {
  const onDecide = jest.fn().mockResolvedValue(undefined);
  await render(<SubmissionDecisionPanel evidence="Xong" onDecide={onDecide} />);
  await fireEvent.press(screen.getByLabelText('Yêu cầu thợ sửa lại'));
  expect(screen.getByLabelText('Gửi yêu cầu sửa lại').props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.changeText(screen.getByLabelText('Thợ cần sửa lại điều gì?'), '  Phòng vẫn chưa mát  ');
  await fireEvent.press(screen.getByLabelText('Gửi yêu cầu sửa lại'));
  await waitFor(() => expect(onDecide).toHaveBeenCalledWith('revision_requested', 'Phòng vẫn chưa mát'));
  await fireEvent.press(screen.getByLabelText('Khiếu nại kết quả'));
  expect(screen.getByText(/không có hoàn tiền hay phí tự động/)).toBeTruthy();
});

test('a refused decision keeps the form open and shows the reason', async () => {
  const onDecide = jest.fn().mockRejectedValue(new Error('Công việc đã thay đổi. Tải lại rồi thử lại.'));
  await render(<SubmissionDecisionPanel evidence="Xong" onDecide={onDecide} />);
  await fireEvent.press(screen.getByLabelText('Nghiệm thu công việc'));
  await fireEvent.press(screen.getByLabelText('Xác nhận nghiệm thu'));
  await waitFor(() => expect(screen.getByText('Công việc đã thay đổi. Tải lại rồi thử lại.')).toBeTruthy());
  expect(screen.getByLabelText('Xác nhận nghiệm thu')).toBeTruthy();
});
