import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { RequestsScreen, type ServiceRequest } from './requests-screen';

const awaiting: ServiceRequest = {
  id: 'request-1', icon: 'bolt', meta: 'Gửi 7 phút trước', title: 'Kiểm tra bình nóng lạnh', status: 'Chờ bạn nghiệm thu', stage: 'waiting', step: 5, nextAction: 'Xem kết quả thợ gửi và quyết định nghiệm thu.',
  description: 'Bình nóng lạnh rò điện', createdLabel: '7 phút trước', pendingSubmission: { id: 'submission-1', evidence: 'Đã thay gioăng và dây tiếp địa', jobVersion: 3 },
};

test('a request awaiting acceptance offers a direct way to its result and the decision panel', async () => {
  const onDecideSubmission = jest.fn().mockResolvedValue(undefined);
  await render(<RequestsScreen onBack={jest.fn()} requests={[awaiting]} onDecideSubmission={onDecideSubmission} onAskKael={jest.fn()} />);
  expect(screen.queryByLabelText('Nghiệm thu công việc')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Xem kết quả và nghiệm thu Kiểm tra bình nóng lạnh'));
  expect(screen.getByText('Đã thay gioăng và dây tiếp địa')).toBeTruthy();
  expect(screen.getByLabelText('Nghiệm thu công việc')).toBeTruthy();
  expect(screen.queryByLabelText('Xem kết quả và nghiệm thu Kiểm tra bình nóng lạnh')).toBeNull();
});

test('a request without submitted work has no acceptance shortcut', async () => {
  const plain: ServiceRequest = { ...awaiting, pendingSubmission: undefined };
  await render(<RequestsScreen onBack={jest.fn()} requests={[plain]} onDecideSubmission={jest.fn()} onAskKael={jest.fn()} />);
  expect(screen.queryByLabelText(/Xem kết quả và nghiệm thu/)).toBeNull();
});

const stuck: ServiceRequest = {
  id: 'request-2', icon: 'bolt', meta: 'Gửi 1 giờ trước', title: 'Thay ổ cắm', status: 'Chưa có thợ phù hợp', stage: 'waiting', step: 3, nextAction: 'Chưa có thợ phù hợp với yêu cầu này.',
  description: 'Ổ cắm bị cháy', createdLabel: '1 giờ trước', dispatch: { canRetry: true, canCancel: true },
};
const activate = { nativeEvent: { actionName: 'activate' } };

test('a stuck request offers to invite workers again and to cancel', async () => {
  await render(<RequestsScreen onBack={jest.fn()} requests={[stuck]} onRetryDispatch={jest.fn()} onCancelRequest={jest.fn()} />);
  expect(screen.getByLabelText('Mời thợ lại cho Thay ổ cắm')).toBeTruthy();
  expect(screen.getByLabelText('Hủy yêu cầu Thay ổ cắm')).toBeTruthy();
});

test('a request in its cooldown offers only to cancel', async () => {
  await render(<RequestsScreen onBack={jest.fn()} requests={[{ ...stuck, dispatch: { canRetry: false, canCancel: true } }]} onRetryDispatch={jest.fn()} onCancelRequest={jest.fn()} />);
  expect(screen.queryByLabelText('Mời thợ lại cho Thay ổ cắm')).toBeNull();
  expect(screen.getByLabelText('Hủy yêu cầu Thay ổ cắm')).toBeTruthy();
});

test('a request with no open action and a request without handlers show no dispatch controls', async () => {
  await render(<RequestsScreen onBack={jest.fn()} requests={[{ ...stuck, dispatch: { canRetry: false, canCancel: false } }]} onRetryDispatch={jest.fn()} onCancelRequest={jest.fn()} />);
  expect(screen.queryByLabelText(/Mời thợ lại|Hủy yêu cầu/)).toBeNull();
  await screen.unmount();
  await render(<RequestsScreen onBack={jest.fn()} requests={[stuck]} />);
  expect(screen.queryByLabelText(/Mời thợ lại|Hủy yêu cầu/)).toBeNull();
});

test('keeping the request after opening the cancel confirmation never cancels', async () => {
  const onCancelRequest = jest.fn().mockResolvedValue(undefined);
  await render(<RequestsScreen onBack={jest.fn()} requests={[stuck]} onRetryDispatch={jest.fn()} onCancelRequest={onCancelRequest} />);
  await fireEvent.press(screen.getByLabelText('Hủy yêu cầu Thay ổ cắm'));
  expect(screen.getByText('Trượt để hủy yêu cầu')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Giữ yêu cầu, không hủy'));
  expect(screen.queryByText('Trượt để hủy yêu cầu')).toBeNull();
  expect(screen.getByLabelText('Hủy yêu cầu Thay ổ cắm')).toBeTruthy();
  expect(onCancelRequest).not.toHaveBeenCalled();
});

test('a failed cancellation shows the reason and offers the slide again', async () => {
  const onCancelRequest = jest.fn().mockRejectedValueOnce(new Error('Thao tác này không khả dụng.')).mockResolvedValue(undefined);
  await render(<RequestsScreen onBack={jest.fn()} requests={[stuck]} onRetryDispatch={jest.fn()} onCancelRequest={onCancelRequest} />);
  await fireEvent.press(screen.getByLabelText('Hủy yêu cầu Thay ổ cắm'));
  await fireEvent(screen.getByLabelText('Xác nhận hủy yêu cầu Thay ổ cắm'), 'accessibilityAction', activate);
  await fireEvent(screen.getByLabelText('Xác nhận hủy yêu cầu Thay ổ cắm'), 'accessibilityAction', activate);
  expect(await screen.findByText('Thao tác này không khả dụng.')).toBeTruthy();
  await fireEvent(screen.getByLabelText('Xác nhận hủy yêu cầu Thay ổ cắm'), 'accessibilityAction', activate);
  await fireEvent(screen.getByLabelText('Xác nhận hủy yêu cầu Thay ổ cắm'), 'accessibilityAction', activate);
  await waitFor(() => expect(onCancelRequest).toHaveBeenCalledTimes(2));
});

test('a retry in flight cannot be sent twice', async () => {
  let finish: () => void = () => undefined;
  const onRetryDispatch = jest.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(<RequestsScreen onBack={jest.fn()} requests={[stuck]} onRetryDispatch={onRetryDispatch} onCancelRequest={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Mời thợ lại cho Thay ổ cắm'));
  await fireEvent.press(screen.getByLabelText('Mời thợ lại cho Thay ổ cắm'));
  expect(onRetryDispatch).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Đang mời…')).toBeTruthy();
  finish();
  await waitFor(() => expect(screen.queryByText('Đang mời…')).toBeNull());
});

test('a cancelled request reads as closed and offers no progress timeline', async () => {
  const cancelled: ServiceRequest = { ...stuck, status: 'Đã hủy yêu cầu', stage: 'done', step: 0, closed: 'cancelled', dispatch: undefined, nextAction: 'Bạn đã hủy yêu cầu này.' };
  await render(<RequestsScreen onBack={jest.fn()} requests={[cancelled]} focusId="request-2" onRetryDispatch={jest.fn()} onCancelRequest={jest.fn()} />);
  expect(screen.getByText('Đã hủy')).toBeTruthy();
  expect(screen.queryByText('Tiến trình')).toBeNull();
  expect(screen.queryByLabelText(/Mời thợ lại|Hủy yêu cầu/)).toBeNull();
});
