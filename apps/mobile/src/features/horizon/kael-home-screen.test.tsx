import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import type { ComponentRef } from 'react';
import { Keyboard, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KaelHomeScreen } from './kael-home-screen';
import { kaelIntroSession } from './kael-intro-session';
import * as kaelStage from './kael-stage';

beforeEach(() => { kaelIntroSession.reset(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

function renderHome(onNew = jest.fn(), composerError: string | null = null) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}><KaelHomeScreen input="" onInput={jest.fn()} onSubmit={jest.fn()} onMenu={jest.fn()} onNew={onNew} messages={[]} composerError={composerError} onClearComposerError={jest.fn()} conversationKey={0}/></SafeAreaProvider>);
}

test('options button opens the conversation menu', async () => {
  await renderHome();
  await act(async () => { jest.advanceTimersByTime(2000); });
  await fireEvent.press(screen.getByLabelText('Tùy chọn cuộc trò chuyện'));
  expect(screen.getByLabelText('Menu cuộc trò chuyện')).toBeTruthy();
  expect(screen.getByLabelText('Trò chuyện mới')).toBeTruthy();
  expect(screen.queryByLabelText('Xóa')).toBeNull();
});

test('the introduction moves into the conversation layout after two seconds', async () => {
  await renderHome();
  expect(screen.queryByLabelText('Mở thanh bên')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(1999); });
  expect(screen.queryByLabelText('Mở thanh bên')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(screen.getByLabelText('Mở thanh bên')).toBeTruthy();
});

test('focusing the composer alone does not leave the introduction', async () => {
  await renderHome();
  await fireEvent(screen.getByLabelText('Nhắn Kael'), 'focus');
  expect(screen.queryByLabelText('Mở thanh bên')).toBeNull();
});

test('a Kael connection diagnosis is visible and announced by the composer', async () => {
  await renderHome(jest.fn(), 'Phiên Supabase Auth không hợp lệ. Vui lòng đăng nhập lại.');
  expect(screen.getByText('Phiên Supabase Auth không hợp lệ. Vui lòng đăng nhập lại.').props.accessibilityLiveRegion).toBe('polite');
});

test('the mascot follows the footer when the available screen height changes without resizing the footer', async () => {
  const stage = jest.spyOn(kaelStage, 'KaelStage');
  await renderHome();
  const root = screen.getByTestId('kael-home-layout');
  const footer = screen.getByTestId('kael-footer-layout');
  await fireEvent(root, 'layout', { nativeEvent: { layout: { height: 613 } } });
  await fireEvent(footer, 'layout', { nativeEvent: { layout: { height: 78, y: 535 } } });
  expect(stage.mock.lastCall?.[0].seatTop).toBe(535);
  await fireEvent(root, 'layout', { nativeEvent: { layout: { height: 810 } } });
  expect(stage.mock.lastCall?.[0].seatTop).toBe(732);
});

test('the mascot seat is measured again when the keyboard hides', async () => {
  const stage = jest.spyOn(kaelStage, 'KaelStage');
  const listeners = new Map<string, () => void>();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, listener) => { listeners.set(name, listener as () => void); return { remove: jest.fn() }; });
  await renderHome();
  await fireEvent(screen.getByTestId('kael-home-layout'), 'layout', { nativeEvent: { layout: { height: 500 } } });
  await fireEvent(screen.getByTestId('kael-footer-layout'), 'layout', { nativeEvent: { layout: { height: 78, y: 422 } } });
  expect(stage.mock.lastCall?.[0].seatTop).toBe(422);
  const probe = createRef<ComponentRef<typeof View>>();
  await render(<View ref={probe}/>);
  const measure = jest.spyOn(Object.getPrototypeOf(probe.current), 'measure')
    .mockImplementationOnce((...args: unknown[]) => (args[0] as (...values: number[]) => void)(0, 0, 390, 810, 0, 0))
    .mockImplementationOnce((...args: unknown[]) => (args[0] as (...values: number[]) => void)(0, 0, 390, 78, 0, 732));
  await act(async () => { listeners.get('keyboardDidHide')?.(); });
  expect(measure).toHaveBeenCalledTimes(2);
  expect(stage.mock.lastCall?.[0].seatTop).toBe(732);
});
