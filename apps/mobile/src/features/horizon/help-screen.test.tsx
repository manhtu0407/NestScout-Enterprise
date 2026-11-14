import { fireEvent, render, screen } from '@testing-library/react-native';

import { HelpScreen } from './help-screen';

test('offers to replay the welcome tour and reports the press', async () => {
  const onReplayTour = jest.fn();
  await render(<HelpScreen onBack={jest.fn()} onReplayTour={onReplayTour}/>);
  expect(screen.getByText('Làm quen')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Xem lại hướng dẫn làm quen, Giới thiệu nhanh cách dùng NestScout và Kael'));
  expect(onReplayTour).toHaveBeenCalledTimes(1);
});

test('shows no replay entry when there is no tour to replay', async () => {
  await render(<HelpScreen onBack={jest.fn()}/>);
  expect(screen.queryByText('Làm quen')).toBeNull();
  expect(screen.queryByText('Xem lại hướng dẫn làm quen')).toBeNull();
});
