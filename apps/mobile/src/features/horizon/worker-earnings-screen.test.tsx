import { fireEvent, render, screen } from '@testing-library/react-native';

import { sampleEarningRecords, toEarningsView } from './worker-earnings';
import { WorkerEarningsScreen } from './worker-earnings-screen';

const now = new Date();
const sampleView = toEarningsView(sampleEarningRecords(now), now);
const emptyView = toEarningsView([], now);

test('the overview opens on today and switches period totals', async () => {
  await render(<WorkerEarningsScreen sample initialMode="overview" earnings={sampleView} onBack={jest.fn()} />);
  expect(screen.getByText('Đã nghiệm thu hôm nay')).toBeTruthy();
  expect(screen.queryByText('Máy lạnh không mát')).toBeNull();
  await fireEvent.press(screen.getByLabelText('7 ngày'));
  expect(screen.getByText('Đã nghiệm thu 7 ngày gần nhất')).toBeTruthy();
  expect(screen.getByText('Máy lạnh không mát')).toBeTruthy();
});

test('accepted work is never presented as money received', async () => {
  await render(<WorkerEarningsScreen sample initialMode="overview" earnings={sampleView} onBack={jest.fn()} />);
  expect(screen.getByText('2 việc khách đã nghiệm thu. Chưa xác nhận thanh toán.')).toBeTruthy();
  expect(screen.getAllByText(/chưa xác nhận thanh toán/)).toHaveLength(2);
  expect(screen.queryByText(/^\+/)).toBeNull();
  expect(screen.getByText('Dữ liệu mẫu. Chưa có thanh toán nào được xác nhận nên đây không phải tiền đã nhận.')).toBeTruthy();
});

test('real data carries no sample label and states what the figures are', async () => {
  await render(<WorkerEarningsScreen initialMode="overview" earnings={emptyView} onBack={jest.fn()} />);
  expect(screen.queryByText(/Dữ liệu mẫu/)).toBeNull();
  expect(screen.getByText(/chưa trừ phí/)).toBeTruthy();
  expect(screen.getByText('Chưa có việc nào được khách nghiệm thu.')).toBeTruthy();
  expect(screen.getByText('0 việc khách đã nghiệm thu. Chưa xác nhận thanh toán.')).toBeTruthy();
});

test('the payout tab is closed: no balance, no amount field, no withdraw button', async () => {
  await render(<WorkerEarningsScreen initialMode="payout" earnings={emptyView} onBack={jest.fn()} />);
  expect(screen.getByText('Chưa mở')).toBeTruthy();
  expect(screen.getByText('Chưa liên kết')).toBeTruthy();
  expect(screen.queryByLabelText('Số tiền muốn rút, đồng')).toBeNull();
  expect(screen.queryByLabelText(/Gửi yêu cầu rút tiền/)).toBeNull();
});

test('the mode tabs switch and back is forwarded', async () => {
  const onBack = jest.fn();
  await render(<WorkerEarningsScreen initialMode="overview" earnings={emptyView} onBack={onBack} />);
  await fireEvent.press(screen.getByLabelText('Rút tiền'));
  expect(screen.getByText('Điều kiện để rút tiền')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('payout tab shows the QR placeholder as Coming Soon and still offers no withdrawal action', async () => {
  await render(<WorkerEarningsScreen initialMode="payout" earnings={emptyView} onBack={jest.fn()} />);
  expect(screen.getByLabelText('Mã QR nhận tiền. Coming Soon')).toBeTruthy();
  expect(screen.queryByLabelText(/Gửi yêu cầu rút tiền/)).toBeNull();
  expect(screen.queryByLabelText(/Sao chép/)).toBeNull();
});
