import { render, screen } from '@testing-library/react-native';
import { matrixStops } from './kael-orb-stops';
import { progressForPhase } from './kael-progress';
import { KaelProgressSheet } from './kael-progress-sheet';
import { KaelSpinnerCheck } from './kael-progress-motion';

test('a dot pulse is a seamless loop that lights up once per cycle', () => {
  for (const delay of [0, 0.1, 0.3, 0.7, 0.93]) {
    const { inputRange, outputRange } = matrixStops(delay);
    expect(inputRange[0]).toBe(0);
    expect(inputRange[inputRange.length - 1]).toBe(1);
    expect(outputRange[0]).toBeCloseTo(outputRange[outputRange.length - 1] ?? NaN);
    expect(inputRange).toEqual([...inputRange].sort((a, b) => a - b));
    expect(new Set(inputRange).size).toBe(inputRange.length);
    expect(Math.max(...outputRange)).toBe(1);
    expect(Math.min(...outputRange)).toBe(0);
  }
});

test('the spinner reports whether the request is still moving or finished', async () => {
  const view = await render(<KaelSpinnerCheck done={false} label="Đang tiến hành"/>);
  expect(screen.getByLabelText('Đang tiến hành')).toBeTruthy();
  await view.rerender(<KaelSpinnerCheck done label="Công việc đã hoàn tất, chưa xác nhận thanh toán"/>);
  expect(screen.getByLabelText('Công việc đã hoàn tất, chưa xác nhận thanh toán')).toBeTruthy();
});

test('the progress sheet shows a spinner while a request is in progress and none without one', async () => {
  const view = await render(<KaelProgressSheet open progress={progressForPhase('matching')} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.getByLabelText('Đang tiến hành')).toBeTruthy();
  await view.rerender(<KaelProgressSheet open progress={progressForPhase('completed')} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.getByLabelText('Công việc đã hoàn tất, chưa xác nhận thanh toán')).toBeTruthy();
  expect(screen.getByText('Bước 8 / 8 · Chưa xác nhận thanh toán')).toBeTruthy();
  await view.rerender(<KaelProgressSheet open progress={null} bottomOffset={0} onClose={jest.fn()}/>);
  expect(screen.queryByLabelText('Đang tiến hành')).toBeNull();
});
