import { fireEvent, render, screen } from '@testing-library/react-native';

import { earningsDays, earningsEntries, earningsPeriods } from './worker-earnings';
import { WorkerEarningsScreen } from './worker-earnings-screen';

test('the sample figures add up across periods, chart and list', () => {
  const today = earningsEntries.filter(entry => entry.today).reduce((total, entry) => total + entry.amountMinor, 0);
  expect(today).toBe(earningsPeriods[0]?.totalMinor);
  const week = earningsDays.reduce((total, day) => total + day.amountMinor, 0);
  expect(week).toBe(earningsPeriods[1]?.totalMinor);
  expect(earningsEntries.reduce((total, entry) => total + entry.amountMinor, 0)).toBe(week);
});

test('the overview opens on today and switches period totals', async () => {
  await render(<WorkerEarningsScreen initialMode="overview" onBack={jest.fn()} />);
  expect(screen.getByText('Đã nghiệm thu hôm nay')).toBeTruthy();
  expect(screen.queryByText('Máy lạnh không mát')).toBeNull();
  await fireEvent.press(screen.getByLabelText('7 ngày'));
  expect(screen.getByText('Đã nghiệm thu 7 ngày gần nhất')).toBeTruthy();
  expect(screen.getByText('Máy lạnh không mát')).toBeTruthy();
});

test('accepted work is never presented as money received', async () => {
  await render(<WorkerEarningsScreen initialMode="overview" onBack={jest.fn()} />);
  expect(screen.getByText('2 việc khách đã nghiệm thu. Chưa xác nhận thanh toán.')).toBeTruthy();
  expect(screen.getAllByText(/chưa xác nhận thanh toán/)).toHaveLength(2);
  expect(screen.queryByText(/^\+/)).toBeNull();
  expect(screen.getByText('Dữ liệu mẫu. Chưa có thanh toán nào được xác nhận nên đây không phải tiền đã nhận.')).toBeTruthy();
});

test('the payout tab has no balance, no amount field and a disabled request', async () => {
  await render(<WorkerEarningsScreen initialMode="payout" onBack={jest.fn()} />);
  expect(screen.getByText('Chưa có')).toBeTruthy();
  expect(screen.getByText('Chưa liên kết')).toBeTruthy();
  expect(screen.queryByLabelText('Số tiền muốn rút, đồng')).toBeNull();
  expect(screen.queryByLabelText('Rút toàn bộ số dư')).toBeNull();
  expect(screen.getByLabelText('Gửi yêu cầu rút tiền, chưa khả dụng').props.accessibilityState.disabled).toBe(true);
});

test('the mode tabs switch and back is forwarded', async () => {
  const onBack = jest.fn();
  await render(<WorkerEarningsScreen initialMode="overview" onBack={onBack} />);
  await fireEvent.press(screen.getByLabelText('Rút tiền'));
  expect(screen.getByText('Số dư có thể rút')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
});
