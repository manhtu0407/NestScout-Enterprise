import { fireEvent, render, screen } from '@testing-library/react-native';
import { progressForPhase, progressForRequest } from './kael-progress';
import { KaelProgressSheet } from './kael-progress-sheet';

test('the sheet is hidden while closed', async () => {
  await render(<KaelProgressSheet open={false} progress={null} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.queryByText('Tiến độ')).toBeNull();
});

test('the sheet marks finished steps, the current step and upcoming steps', async () => {
  await render(<KaelProgressSheet open progress={progressForPhase('quotes')} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.getByText('Bước 3 / 8')).toBeTruthy();
  expect(screen.getByLabelText('Làm rõ nhu cầu. Đã hoàn thành')).toBeTruthy();
  expect(screen.getByLabelText('Có báo giá. Bạn đang ở bước này').props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText('Chờ xác nhận. Chưa đến bước')).toBeTruthy();
});

test('without an active request the sheet says nothing is in progress and closes on demand', async () => {
  const onClose = jest.fn();
  await render(<KaelProgressSheet open progress={null} bottomOffset={0} onClose={onClose}/>);
  expect(screen.getByText('Chưa có yêu cầu đặt dịch vụ nào đang diễn ra')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Đóng tiến độ'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a real request shows its title and status with the workflow steps', async () => {
  const progress = progressForRequest({ title: 'Sửa vòi nước', status: 'Có báo giá mới', step: 1 });
  await render(<KaelProgressSheet open progress={progress} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.getByText('Sửa vòi nước · Có báo giá mới')).toBeTruthy();
  expect(screen.getByLabelText('Đã gửi. Đã hoàn thành')).toBeTruthy();
  expect(screen.getByLabelText('Có báo giá. Bạn đang ở bước này')).toBeTruthy();
  expect(screen.getByLabelText('Nghiệm thu. Chưa đến bước')).toBeTruthy();
});

test('a finished request marks every step done and none as current', async () => {
  const progress = progressForRequest({ title: 'Thay ổ khoá', status: 'Đã hoàn tất', step: 6 });
  await render(<KaelProgressSheet open progress={progress} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.getByLabelText('Nghiệm thu. Đã hoàn thành')).toBeTruthy();
  expect(screen.queryByText('Bạn đang ở bước này')).toBeNull();
});
