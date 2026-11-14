import { fireEvent, render, screen } from '@testing-library/react-native';

import { KaelChatNav } from './kael-nav';

test('shows the session title as a header between the menu and options buttons', async () => {
  const onMenu = jest.fn();
  const onOptions = jest.fn();
  await render(<KaelChatNav title="Vòi nước bếp bị rò rỉ" onMenu={onMenu} onOptions={onOptions} />);
  const title = screen.getByRole('header');
  expect(title.props.children).toBe('Vòi nước bếp bị rò rỉ');
  expect(title.props.numberOfLines).toBe(1);
  await fireEvent.press(screen.getByLabelText('Mở thanh bên'));
  await fireEvent.press(screen.getByLabelText('Tùy chọn cuộc trò chuyện'));
  expect(onMenu).toHaveBeenCalledTimes(1);
  expect(onOptions).toHaveBeenCalledTimes(1);
});

test('follows the title when the active session changes', async () => {
  const { rerender } = await render(<KaelChatNav title="Vệ sinh sofa 3 chỗ" onMenu={jest.fn()} onOptions={jest.fn()} />);
  await rerender(<KaelChatNav title="Máy lạnh không mát" onMenu={jest.fn()} onOptions={jest.fn()} />);
  expect(screen.getByRole('header').props.children).toBe('Máy lạnh không mát');
});
