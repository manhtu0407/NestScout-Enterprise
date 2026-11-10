import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatComposer } from './chat-composer';

const unavailable = 'Ghi âm chưa khả dụng nên Kael chưa nhận được lời nói.';

test('tapping the mic opens the listening capsule', async () => {
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  expect(screen.getByLabelText('Đang nghe')).toBeTruthy();
  expect(screen.getByLabelText('Hủy ghi âm')).toBeTruthy();
  expect(screen.getByLabelText('Dừng và gửi lời nói')).toBeTruthy();
});

test('cancelling closes the capsule without any notice', async () => {
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await fireEvent.press(screen.getByLabelText('Hủy ghi âm'));
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  expect(screen.queryByText(unavailable)).toBeNull();
});

test('sending closes the capsule and says recording is not available', async () => {
  const onSubmit = jest.fn();
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={onSubmit} />);
  await fireEvent.press(screen.getByLabelText('Nói với Kael'));
  await fireEvent.press(screen.getByLabelText('Dừng và gửi lời nói'));
  expect(screen.queryByLabelText('Đang nghe')).toBeNull();
  expect(screen.getByText(unavailable)).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});
