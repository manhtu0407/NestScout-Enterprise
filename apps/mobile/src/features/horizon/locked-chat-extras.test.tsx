import { AccessibilityInfo } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { LockedChatExtras } from './locked-chat-extras';

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('every Kael card and the sources are Coming Soon and cannot be used', async () => {
  await render(<LockedChatExtras />);
  expect(screen.getAllByText('Coming Soon')).toHaveLength(5);
  for (const title of ['Câu hỏi của Kael', 'Gợi ý tiếp theo', 'Tóm tắt yêu cầu', 'Hành động với đoạn đã chọn', 'Nguồn tra cứu']) expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText('Chưa có nguồn')).toBeTruthy();
  expect(screen.getByText('Rút gọn')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Tháng sau' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Chấp nhận' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Tiếp tục' })).toBeNull();
});
