import { render, screen } from '@testing-library/react-native';
import { KaelMatrixLoader, matrixDelay, matrixStops } from './kael-matrix-loader';
import type { KaelMatrixVariant } from './kael-matrix-loader';
import { progressForPhase } from './kael-progress';
import { KaelProgressSheet } from './kael-progress-sheet';
import { KaelSpinnerCheck } from './kael-progress-motion';

const variants: readonly KaelMatrixVariant[] = ['scan', 'twinkle', 'orbit', 'pulse'];

test('every matrix variant gives each animated dot a delay inside one cycle', () => {
  for (const variant of variants) {
    for (let index = 0; index < 16; index += 1) {
      const delay = matrixDelay(variant, index);
      if (delay === null) continue;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(1);
    }
  }
});

test('the orbit variant keeps the centre dots still and moves the ring', () => {
  const centre = [5, 6, 9, 10].map(index => matrixDelay('orbit', index));
  expect(centre).toEqual([null, null, null, null]);
  const ring = [1, 2, 7, 11, 14, 13, 8, 4].map(index => matrixDelay('orbit', index));
  expect(new Set(ring).size).toBe(8);
});

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

test('the matrix loader is silent unless it is given a label', async () => {
  await render(<KaelMatrixLoader/>);
  expect(screen.queryByRole('progressbar')).toBeNull();
  await render(<KaelMatrixLoader variant="orbit" label="Kael đang xử lý"/>);
  expect(screen.getByLabelText('Kael đang xử lý').props.accessibilityRole).toBe('progressbar');
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
