import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KaelHomeScreen } from './kael-home-screen';
import { kaelIntroSession } from './kael-intro-session';
import * as kaelStage from './kael-stage';

beforeEach(() => kaelIntroSession.reset());
afterEach(() => jest.restoreAllMocks());

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

async function enterAfterIntro() {
  await act(async () => { jest.advanceTimersByTime(2000); });
}

function renderHome(onNew = jest.fn(), composerError: string | null = null) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}><KaelHomeScreen input="" onInput={jest.fn()} onSubmit={jest.fn()} onMenu={jest.fn()} onNew={onNew} messages={[]} composerError={composerError} onClearComposerError={jest.fn()} conversationKey={0}/></SafeAreaProvider>);
}

test('options button opens the conversation menu', async () => {
  jest.useFakeTimers();
  await renderHome();
  await enterAfterIntro();
  jest.useRealTimers();
  await fireEvent.press(screen.getByLabelText('Tùy chọn cuộc trò chuyện'));
  expect(screen.getByLabelText('Menu cuộc trò chuyện')).toBeTruthy();
  expect(screen.getByLabelText('Trò chuyện mới')).toBeTruthy();
  expect(screen.queryByLabelText('Xóa')).toBeNull();
});

test('the introduction moves into the conversation layout after its delay', async () => {
  jest.useFakeTimers();
  await renderHome();
  expect(screen.queryByLabelText('Mở thanh bên')).toBeNull();
  await enterAfterIntro();
  jest.useRealTimers();
  expect(screen.getByLabelText('Mở thanh bên')).toBeTruthy();
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

test('a Kael question appears after the last reply and its answer is sent back', async () => {
  const onAnswer = jest.fn();
  const question = { id: '77777777-7777-4777-8777-777777777777', prompt: 'Thợ nên đến khi nào?', options: ['Sáng mai', 'Chiều mai'], date: false };
  await render(<SafeAreaProvider initialMetrics={initialMetrics}><KaelHomeScreen input="" onInput={jest.fn()} onSubmit={jest.fn()} onMenu={jest.fn()} onNew={jest.fn()} messages={[{ id: 'a1', role: 'assistant', text: 'Bạn chọn giúp Kael nhé.', runId: 'r1' }]} question={question} onAnswer={onAnswer} composerError={null} onClearComposerError={jest.fn()} conversationKey={0}/></SafeAreaProvider>);
  expect(screen.getByText('Thợ nên đến khi nào?')).toBeTruthy();
  expect(screen.queryByText('Coming Soon')).toBeNull();
  await fireEvent.press(screen.getByText('Chiều mai'));
  await fireEvent.press(screen.getByText('Trả lời'));
  expect(onAnswer).toHaveBeenCalledWith('Chiều mai');
});
