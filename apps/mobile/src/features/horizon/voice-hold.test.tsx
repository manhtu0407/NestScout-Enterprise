import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ChatComposer } from './chat-composer';
import { formatElapsed } from './voice-hold';

test('elapsed time is shown as minutes and zero-padded seconds', () => {
  expect(formatElapsed(0)).toBe('0:00');
  expect(formatElapsed(9400)).toBe('0:09');
  expect(formatElapsed(65000)).toBe('1:05');
});

test('tapping the mic shows the listening pill and tapping again says recording is not available', async () => {
  jest.useFakeTimers();
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  const mic = screen.getByLabelText('Nói với Kael');
  await fireEvent.press(mic);
  expect(screen.getByText('Đang nghe')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(1200); });
  expect(screen.getByText('0:01')).toBeTruthy();
  await fireEvent.press(mic);
  expect(screen.queryByText('Đang nghe')).toBeNull();
  expect(screen.getByText('Ghi âm chưa khả dụng nên Kael chưa nhận được lời nói.')).toBeTruthy();
  jest.useRealTimers();
});
