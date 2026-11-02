import { fireEvent, render, screen } from '@testing-library/react-native';

import { workerKaelPrompts } from './worker-kael';
import { WorkerKaelScreen } from './worker-kael-screen';

test('each suggestion hands its prefilled question to the host', async () => {
  const onAsk = jest.fn();
  await render(<WorkerKaelScreen onBack={jest.fn()} onAsk={onAsk} />);
  for (const item of workerKaelPrompts) {
    await fireEvent.press(screen.getByLabelText(`${item.title}, ${item.detail}`));
    expect(onAsk).toHaveBeenLastCalledWith(item.prompt);
  }
});

test('the chat button opens an empty conversation and back is forwarded', async () => {
  const onAsk = jest.fn();
  const onBack = jest.fn();
  await render(<WorkerKaelScreen onBack={onBack} onAsk={onAsk} />);
  await fireEvent.press(screen.getByLabelText('Trò chuyện với Kael'));
  expect(onAsk).toHaveBeenCalledWith('');
  await fireEvent.press(screen.getByLabelText('Quay về'));
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('the screen states that Kael only suggests and never sends on the worker behalf', async () => {
  await render(<WorkerKaelScreen onBack={jest.fn()} onAsk={jest.fn()} />);
  expect(screen.getByText('Bạn quyết định')).toBeTruthy();
  expect(screen.getByText('Không tự gửi thay bạn')).toBeTruthy();
});
