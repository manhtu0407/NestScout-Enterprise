import { render, screen } from '@testing-library/react-native';

import { ChatMessage } from './chat-message';

test('a message without a time or delivery status renders only its text', async () => {
  await render(<ChatMessage role="user" text="Điều hòa không mát" />);
  expect(screen.getByText('Điều hòa không mát')).toBeTruthy();
  expect(screen.queryByText('Đã gửi')).toBeNull();
});

test('a message with a time and delivery status still shows both', async () => {
  await render(<ChatMessage role="user" text="Xin chào" time="09:30" status="sent" />);
  expect(screen.getByText('09:30')).toBeTruthy();
  expect(screen.getByText('Đã gửi')).toBeTruthy();
});
