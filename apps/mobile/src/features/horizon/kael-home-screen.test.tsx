import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KaelHomeScreen } from './kael-home-screen';

jest.mock('./kael-status-avatar', () => ({ KaelStatusAvatar: () => null }));

afterEach(() => jest.restoreAllMocks());

const initialMetrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
const conversation = [
  { id: 'a', role: 'user' as const, text: 'Vòi nước bị rò' },
  { id: 'b', role: 'assistant' as const, text: 'Bạn mô tả giúp mình vị trí rò nhé.' },
];

function renderHome(messages: typeof conversation = [], onNew = jest.fn()) {
  return render(<SafeAreaProvider initialMetrics={initialMetrics}><KaelHomeScreen input="" onInput={jest.fn()} onSubmit={jest.fn()} onMenu={jest.fn()} onNew={onNew} messages={messages} composerError={null} onClearComposerError={jest.fn()} conversationKey={0}/></SafeAreaProvider>);
}

test('compose segment starts a new conversation without opening the menu', async () => {
  const onNew = jest.fn();
  await renderHome(conversation, onNew);
  await fireEvent.press(screen.getByLabelText('Trò chuyện mới'));
  expect(onNew).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Menu cuộc trò chuyện')).toBeNull();
});

const menuLabel = 'Menu cuộc trò chuyện';
const closed = () => waitFor(() => expect(screen.queryByLabelText(menuLabel)).toBeNull());
const openMenu = () => fireEvent.press(screen.getByLabelText('Tùy chọn cuộc trò chuyện'));
const choose = (name: string) => fireEvent.press(screen.getByRole('menuitem', { name }));

test('more segment opens the menu titled with the first user message and the scrim closes it', async () => {
  await renderHome(conversation);
  await openMenu();
  expect(screen.getByLabelText(menuLabel)).toBeTruthy();
  expect(within(screen.getByLabelText(menuLabel)).getByText('Vòi nước bị rò')).toBeTruthy();
  for (const label of ['Chia sẻ', 'Ghim', 'Tìm trong cuộc trò chuyện', 'Lưu trữ', 'Xóa']) expect(screen.getByRole('menuitem', { name: label })).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Đóng menu cuộc trò chuyện'));
  await closed();
});

test('delete clears an existing conversation once the menu has closed', async () => {
  const onNew = jest.fn();
  await renderHome(conversation, onNew);
  await openMenu();
  await choose('Xóa');
  await closed();
  expect(onNew).toHaveBeenCalledTimes(1);
});

test('share sends the transcript of an existing conversation', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  await renderHome(conversation);
  await openMenu();
  await choose('Chia sẻ');
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: 'Bạn: Vòi nước bị rò\n\nKael: Bạn mô tả giúp mình vị trí rò nhé.' }));
});

test('actions without content or backend report why instead of pretending to work', async () => {
  const share = jest.spyOn(Share, 'share');
  const onNew = jest.fn();
  await renderHome([], onNew);
  await openMenu();
  await choose('Chia sẻ');
  expect(await screen.findByText('Chưa có nội dung để chia sẻ.')).toBeTruthy();
  await closed();
  await openMenu();
  await choose('Ghim');
  expect(await screen.findByText('Ghim cuộc trò chuyện chưa được kết nối.')).toBeTruthy();
  await closed();
  await openMenu();
  await choose('Xóa');
  expect(await screen.findByText('Chưa có cuộc trò chuyện để xóa.')).toBeTruthy();
  expect(share).not.toHaveBeenCalled();
  expect(onNew).not.toHaveBeenCalled();
});

test('a failed share surfaces a notice', async () => {
  jest.spyOn(Share, 'share').mockRejectedValue(new Error('unsupported'));
  await renderHome(conversation);
  await openMenu();
  await choose('Chia sẻ');
  expect(await screen.findByText('Thiết bị này chưa mở được chia sẻ.')).toBeTruthy();
});
