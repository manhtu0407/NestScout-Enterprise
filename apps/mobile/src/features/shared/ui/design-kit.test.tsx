import { fireEvent, render, screen } from '@testing-library/react-native';

import { Badge, orderBadges } from './badge';
import { Chip, StatusDot } from './chip';
import { QrFrame } from './qr-frame';

test('chip is a plain label unless it can be pressed', async () => {
  const onPress = jest.fn();
  await render(<><Chip label="Nhãn" hue="lime" /><Chip label="Lọc" variant="bold" hue="cyan" selected onPress={onPress} /></>);
  expect(screen.getByLabelText('Nhãn').props.accessibilityRole).toBeUndefined();
  const filter = screen.getByRole('button', { name: 'Lọc' });
  expect(filter.props.accessibilityState.selected).toBe(true);
  await fireEvent.press(filter);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('status dot is announced only when it has a label', async () => {
  await render(<><StatusDot tone="green" label="Đang online" /><StatusDot tone="red" /></>);
  expect(screen.getByLabelText('Đang online')).toBeTruthy();
});

test('badge keeps the order status labels', async () => {
  await render(<Badge label={orderBadges.done.label} tone={orderBadges.done.tone} dot />);
  expect(screen.getByLabelText(orderBadges.done.label)).toBeTruthy();
});

test('qr frame marks the payment code as Coming Soon without drawing a code or an amount', async () => {
  await render(<QrFrame title="Mã QR nhận tiền" hint="Chỉ hiện khi chi trả được mở." />);
  expect(screen.getByLabelText('Mã QR nhận tiền. Coming Soon')).toBeTruthy();
  expect(screen.getByText('Coming Soon')).toBeTruthy();
  expect(screen.queryByLabelText(/Sao chép/)).toBeNull();
  expect(screen.queryByText(/đ$/)).toBeNull();
});
