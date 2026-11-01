import { fireEvent, render, screen } from '@testing-library/react-native';
import { KaelProgressSheet } from './kael-progress-sheet';

test('the sheet is hidden while closed', async () => {
  await render(<KaelProgressSheet open={false} phase={null} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.queryByText('Tiến độ')).toBeNull();
});

test('the sheet marks finished steps, the current step and upcoming steps', async () => {
  await render(<KaelProgressSheet open phase="quotes" bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.getByText('Bước 3 / 8')).toBeTruthy();
  expect(screen.getByLabelText('Làm rõ nhu cầu. Đã hoàn thành')).toBeTruthy();
  expect(screen.getByLabelText('Có báo giá. Bạn đang ở bước này').props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText('Chờ xác nhận. Chưa đến bước')).toBeTruthy();
});

test('without an active request the sheet says nothing is in progress and closes on demand', async () => {
  const onClose = jest.fn();
  await render(<KaelProgressSheet open phase={null} bottomOffset={0} onClose={onClose}/>);
  expect(screen.getByText('Chưa có yêu cầu đặt dịch vụ nào đang diễn ra')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Đóng tiến độ'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
