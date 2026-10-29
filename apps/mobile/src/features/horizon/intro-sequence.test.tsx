import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import { IntroSequence } from './intro-sequence';

const originalReduceMotion = AccessibilityInfo.isReduceMotionEnabled;

afterEach(() => {
  AccessibilityInfo.isReduceMotionEnabled = originalReduceMotion;
  jest.restoreAllMocks();
});

test('the passive Welcome and Transition render without a composer or quick actions and complete automatically', async () => {
  AccessibilityInfo.isReduceMotionEnabled = jest.fn(async () => false);
  let finish: ((result: { finished: boolean }) => void) | undefined;
  const stop = jest.fn();
  const timing = jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => {
    expect(config.duration).toBe(4900);
    expect(config.useNativeDriver).toBe(true);
    return { start: callback => { finish = callback; }, stop, reset: jest.fn() };
  });
  await render(<IntroSequence onComplete={complete} />);
  expect(await screen.findByText('Kael đang sẵn sàng')).toBeTruthy();
  expect(screen.queryByLabelText('Nhắn Kael')).toBeNull();
  expect(screen.queryByText('Dự án mới')).toBeNull();
  await waitFor(() => expect(timing).toHaveBeenCalled());
  await act(async () => finish?.({ finished: true }));
  expect(complete).toHaveBeenCalledTimes(1);
});

const complete = jest.fn();

test('Reduce Motion completes the intro without starting the animation', async () => {
  complete.mockClear();
  AccessibilityInfo.isReduceMotionEnabled = jest.fn(async () => true);
  const start = jest.fn();
  jest.spyOn(Animated, 'timing').mockReturnValue({ start, stop: jest.fn(), reset: jest.fn() });
  await render(<IntroSequence onComplete={complete} />);
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
  expect(start).not.toHaveBeenCalled();
});
