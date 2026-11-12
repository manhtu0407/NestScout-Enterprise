import { fireEvent, render, screen } from '@testing-library/react-native';

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
