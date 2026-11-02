import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ChatComposer } from './chat-composer';
import { formatElapsed } from './voice-hold';

test('elapsed time is shown as minutes and zero-padded seconds', () => {
  expect(formatElapsed(0)).toBe('0:00');
  expect(formatElapsed(9400)).toBe('0:09');
  expect(formatElapsed(65000)).toBe('1:05');
});

test('holding the mic shows the listening pill and releasing says recording is not available', async () => {
  jest.useFakeTimers();
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  const mic = screen.getByLabelText('Nói với Kael');
  await fireEvent(mic, 'pressIn');
  await act(async () => { jest.advanceTimersByTime(300); });
  await fireEvent(mic, 'longPress');
  expect(screen.getByText('Đang nghe')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(screen.getByText('0:01')).toBeTruthy();
  await fireEvent(mic, 'pressOut');
  expect(screen.queryByText('Đang nghe')).toBeNull();
  expect(screen.getByText('Ghi âm chưa khả dụng nên Kael chưa nhận được lời nói.')).toBeTruthy();
  jest.useRealTimers();
});

test('a short tap explains how to hold the mic', async () => {
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  expect(screen.getByText('Giữ nút mic để nói với Kael.')).toBeTruthy();
  expect(screen.queryByText('Đang nghe')).toBeNull();
});
