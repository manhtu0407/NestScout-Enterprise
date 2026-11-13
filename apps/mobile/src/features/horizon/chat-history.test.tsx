import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatHistory, recentQuestions } from './chat-history';
import { ChatMessage } from './chat-message';

const sent = new Date(2026, 10, 12, 9, 5).getTime();

test('recent questions list the newest first, skip replies and blanks, and drop repeats', () => {
  const entries = recentQuestions([
    { id: 'a', role: 'user', text: 'Sửa vòi nước', sentAt: sent },
    { id: 'b', role: 'assistant', text: 'Mình đã ghi nhận' },
    { id: 'c', role: 'user', text: '   ' },
    { id: 'd', role: 'user', text: 'Thay công tắc' },
    { id: 'e', role: 'user', text: 'Sửa vòi nước' },
  ]);
  expect(entries.map(entry => entry.id)).toEqual(['e', 'd']);
});

test('recent questions are capped', () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({ id: `m${index}`, role: 'user' as const, text: `Câu hỏi ${index}` }));
  expect(recentQuestions(messages)).toHaveLength(8);
});

test('the history button is absent without questions', async () => {
  await render(<ChatHistory entries={[]} onPick={jest.fn()}/>);
  expect(screen.queryByLabelText('Lịch sử câu hỏi')).toBeNull();
});

test('choosing a past question hands its text back and closes the list', async () => {
  const onPick = jest.fn();
  await render(<ChatHistory entries={[{ id: 'a', text: 'Sửa vòi nước', sentAt: sent }]} onPick={onPick}/>);
  await fireEvent.press(screen.getByLabelText('Lịch sử câu hỏi'));
  expect(screen.getByText('GẦN ĐÂY')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Sửa vòi nước'));
  expect(onPick).toHaveBeenCalledWith('Sửa vòi nước');
  expect(screen.queryByText('GẦN ĐÂY')).toBeNull();
});

test('a disabled history button does not open', async () => {
  await render(<ChatHistory entries={[{ id: 'a', text: 'Sửa vòi nước' }]} onPick={jest.fn()} disabled/>);
  await fireEvent.press(screen.getByLabelText('Lịch sử câu hỏi'));
  expect(screen.queryByText('GẦN ĐÂY')).toBeNull();
});

test('tapping a message with a send time reveals and hides the time', async () => {
  await render(<ChatMessage role="user" text="Xin chào" sentAt={sent}/>);
  expect(screen.queryByText('09:05')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Xem giờ gửi'));
  expect(screen.getByText(/09:05/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Ẩn giờ gửi'));
  expect(screen.queryByText(/09:05/)).toBeNull();
});

test('a message without a send time is not tappable', async () => {
  await render(<ChatMessage role="user" text="Xin chào"/>);
  expect(screen.queryByLabelText('Xem giờ gửi')).toBeNull();
});
