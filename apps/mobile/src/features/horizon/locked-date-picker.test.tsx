import { render, screen } from '@testing-library/react-native';

import { LockedDatePicker } from './locked-date-picker';

test('the date picker is shown for the design but marked Coming Soon and hidden from assistive input', async () => {
  await render(<LockedDatePicker />);
  expect(screen.getByText('Chọn ngày thợ đến')).toBeTruthy();
  expect(screen.getByText('Coming Soon')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Tháng sau' })).toBeNull();
});
