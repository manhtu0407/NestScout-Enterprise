import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { horizonLayout } from '@/theme/layout';

import { NotificationGlyph } from './notification-glyph';
import { lookFor } from './notification-look';

const delay = horizonLayout.notificationGlyph.delay;
const completed = lookFor('job_completed', 'Việc đã hoàn tất.');

function runner() {
  const run = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
  jest.spyOn(Animated, 'parallel').mockReturnValue(run as unknown as Animated.CompositeAnimation);
  return run;
}

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('the glyph is decoration and stays out of the accessibility tree', async () => {
  await render(<NotificationGlyph look={completed} />);
  expect(screen.toJSON()).toMatchObject({ props: { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } });
});

test('the motion starts after the arrival delay and is cancelled when the glyph goes away', async () => {
  const run = runner();
  const view = await render(<NotificationGlyph look={completed} />);
  expect(run.start).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(delay); });
  expect(run.start).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(run.stop).toHaveBeenCalled();
});

test('leaving before the arrival delay never starts the motion', async () => {
  const run = runner();
  const view = await render(<NotificationGlyph look={completed} />);
  await view.unmount();
  await act(async () => { jest.advanceTimersByTime(delay * 2); });
  expect(run.start).not.toHaveBeenCalled();
});

test('with Reduce Motion on the glyph fades in place without any spring', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const run = runner();
  const timing = jest.spyOn(Animated, 'timing');
  await render(<NotificationGlyph look={completed} />);
  await act(async () => { jest.advanceTimersByTime(delay * 2); });
  expect(run.start).not.toHaveBeenCalled();
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ duration: horizonLayout.notificationGlyph.reducedDuration }));
});
