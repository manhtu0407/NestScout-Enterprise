import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PreferredVisitPicker, visitAllowed, visitInstant } from './preferred-visit-picker';

const now = new Date('2026-11-10T03:00:00.000Z');

test('a chosen day and slot is stored as that time in Vietnam', () => {
  expect(visitInstant(new Date(2026, 10, 11), 15).toISOString()).toBe('2026-11-11T08:00:00.000Z');
  expect(visitAllowed(new Date('2026-11-10T03:30:00.000Z'), now)).toBe(false);
  expect(visitAllowed(new Date('2026-11-11T08:00:00.000Z'), now)).toBe(true);
  expect(visitAllowed(new Date('2027-02-01T08:00:00.000Z'), now)).toBe(false);
});

test('saving requires a day and a slot and says the time is not a confirmed appointment', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  await render(<PreferredVisitPicker value={null} onSave={onSave} now={now} />);
  expect(screen.getByText(/chưa phải lịch hẹn đã được thợ xác nhận/)).toBeTruthy();
  expect(screen.getByLabelText('Lưu thời gian mong muốn').props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(screen.getByLabelText(/, 11 tháng 11$/));
  await fireEvent.press(screen.getByText('Chiều · 15:00'));
  await fireEvent.press(screen.getByLabelText('Lưu thời gian mong muốn'));
  await waitFor(() => expect(screen.getByText('Đã lưu thời gian mong muốn.')).toBeTruthy());
  expect(onSave).toHaveBeenCalledWith(new Date('2026-11-11T08:00:00.000Z'));
});

test('a refused save shows the reason and a stored time can be cleared', async () => {
  const onSave = jest.fn().mockRejectedValueOnce(new Error('Bước này không còn khả dụng.')).mockResolvedValueOnce(undefined);
  await render(<PreferredVisitPicker value="2026-11-11T08:00:00.000Z" onSave={onSave} now={now} />);
  expect(screen.getByText(/^Đã lưu: /)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Bỏ thời gian mong muốn'));
  await waitFor(() => expect(screen.getByText('Bước này không còn khả dụng.')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Bỏ thời gian mong muốn'));
  await waitFor(() => expect(onSave).toHaveBeenLastCalledWith(null));
});
