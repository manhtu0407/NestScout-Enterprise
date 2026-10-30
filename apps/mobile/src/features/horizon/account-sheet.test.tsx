import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountSheet } from './account-sheet';

afterEach(() => jest.restoreAllMocks());

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
const props = { name: 'Khách', initial: 'K', modeLabel: 'Khách', preview: false, closeRequest: 0 };

test('opens and dismisses with motion, then navigates exactly once after exit', async () => {
  const chooseMode = jest.fn();
  let finishExit: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => ({
    start: callback => { if (config.toValue === 0) finishExit = callback; },
    stop: jest.fn(), reset: jest.fn(),
  }));
  const component = await render(<SafeAreaProvider initialMetrics={initialMetrics}><AccountSheet {...props} reduceMotion={false} onClose={jest.fn()} onChooseMode={chooseMode} onAccount={jest.fn()}/></SafeAreaProvider>);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 1, duration: 360, useNativeDriver: true }));
  await fireEvent.press(screen.getByRole('button', { name: 'Chuyển chế độ' }));
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0, duration: 220, useNativeDriver: true }));
  expect(chooseMode).not.toHaveBeenCalled();
  await component.rerender(<SafeAreaProvider initialMetrics={initialMetrics}><AccountSheet {...props} closeRequest={1} reduceMotion={false} onClose={jest.fn()} onChooseMode={chooseMode} onAccount={jest.fn()}/></SafeAreaProvider>);
  expect(timing).toHaveBeenCalledTimes(2);
  await act(async () => finishExit?.({ finished: true }));
  expect(chooseMode).toHaveBeenCalledTimes(1);
});

test('Reduce Motion opens and switches without an animated delay', async () => {
  const chooseMode = jest.fn();
  const timing = jest.spyOn(Animated, 'timing');
  await render(<SafeAreaProvider initialMetrics={initialMetrics}><AccountSheet {...props} reduceMotion onClose={jest.fn()} onChooseMode={chooseMode} onAccount={jest.fn()}/></SafeAreaProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Chuyển chế độ' }));
  expect(chooseMode).toHaveBeenCalledTimes(1);
  expect(timing).not.toHaveBeenCalled();
});

test('a late exit callback cannot navigate after the sheet unmounts', async () => {
  const openAccount = jest.fn();
  let finishExit: ((result: { finished: boolean }) => void) | undefined;
  jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => ({
    start: callback => { if (config.toValue === 0) finishExit = callback; },
    stop: jest.fn(), reset: jest.fn(),
  }));
  const component = await render(<SafeAreaProvider initialMetrics={initialMetrics}><AccountSheet {...props} reduceMotion={false} onClose={jest.fn()} onChooseMode={jest.fn()} onAccount={openAccount}/></SafeAreaProvider>);
  await fireEvent.press(screen.getByRole('button', { name: 'Tài khoản và đăng nhập' }));
  await component.unmount();
  await act(async () => finishExit?.({ finished: true }));
  expect(openAccount).not.toHaveBeenCalled();
});

test('a system close request during entrance completes one exit before closing', async () => {
  const onClose = jest.fn();
  let finishExit: ((result: { finished: boolean }) => void) | undefined;
  const timing = jest.spyOn(Animated, 'timing').mockImplementation((_value, config) => ({
    start: callback => { if (config.toValue === 0) finishExit = callback; },
    stop: jest.fn(), reset: jest.fn(),
  }));
  const component = await render(<SafeAreaProvider initialMetrics={initialMetrics}><AccountSheet {...props} reduceMotion={false} onClose={onClose} onChooseMode={jest.fn()} onAccount={jest.fn()}/></SafeAreaProvider>);
  await component.rerender(<SafeAreaProvider initialMetrics={initialMetrics}><AccountSheet {...props} closeRequest={1} reduceMotion={false} onClose={onClose} onChooseMode={jest.fn()} onAccount={jest.fn()}/></SafeAreaProvider>);
  expect(timing).toHaveBeenCalledTimes(2);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finishExit?.({ finished: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
