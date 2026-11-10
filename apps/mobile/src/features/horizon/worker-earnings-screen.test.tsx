import { fireEvent, render, screen } from '@testing-library/react-native';

import { sampleEarningRecords, toEarningsView } from './worker-earnings';
import { WorkerEarningsScreen } from './worker-earnings-screen';

const now = new Date();
const sampleView = toEarningsView(sampleEarningRecords(now), now);
const emptyView = toEarningsView([], now);

const noPayout = jest.fn();

test('the overview lists accepted work of the month without presenting it as money received', async () => {
  await render(<WorkerEarningsScreen initialMode="overview" earnings={sampleView} payout={null} performPayout={noPayout} onBack={jest.fn()} />);
  expect(screen.getByText('Việc khách đã nghiệm thu trong tháng')).toBeTruthy();
  const entries = sampleView.entries.month;
  expect(entries.length).toBeGreaterThan(0);
  expect(screen.getAllByText(/chưa xác nhận thanh toán$/)).toHaveLength(entries.length);
  expect(screen.queryByText(/^\+/)).toBeNull();
  expect(screen.queryByText(/Số dư có thể rút/)).toBeNull();
});

test('without accepted work the overview shows no entry list and no balance', async () => {
  await render(<WorkerEarningsScreen initialMode="overview" earnings={emptyView} payout={null} performPayout={noPayout} onBack={jest.fn()} />);
  expect(screen.queryByText('Việc khách đã nghiệm thu trong tháng')).toBeNull();
  expect(screen.queryByText(/chưa xác nhận thanh toán/)).toBeNull();
  expect(screen.queryByText(/Số dư có thể rút/)).toBeNull();
});

test('the payout view is closed: zero balance, no amount field and a disabled withdraw button', async () => {
  await render(<WorkerEarningsScreen initialMode="payout" earnings={sampleView} payout={null} performPayout={noPayout} onBack={jest.fn()} />);
  expect(screen.getByLabelText('Số dư có thể rút 0 ₫')).toBeTruthy();
  expect(screen.getByText('Việc được khách nghiệm thu chưa tạo ra số dư. Số dư chỉ có khi thanh toán được xác nhận.')).toBeTruthy();
  expect(screen.getByLabelText('Rút về ngân hàng, chưa mở').props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.queryByLabelText('Số tiền muốn rút, đồng')).toBeNull();
  expect(screen.getByText('Chưa kết nối')).toBeTruthy();
  expect(screen.getByText('Chưa liên kết')).toBeTruthy();
  expect(noPayout).not.toHaveBeenCalled();
});

test('back is forwarded', async () => {
  const onBack = jest.fn();
  await render(<WorkerEarningsScreen initialMode="overview" earnings={emptyView} payout={null} performPayout={noPayout} onBack={onBack} />);
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
});
