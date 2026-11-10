import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChatComposer } from './chat-composer';
import { ComposerMenu } from './composer-menu';
import { KaelThinkingOrb, orbModeForPhase } from './kael-thinking-orb';

const anchor = { x: 16, bottom: 96 };

test('clarifying phases think while matching searches', () => {
  expect(orbModeForPhase('clarifying')).toBe('thinking');
  expect(orbModeForPhase('matching')).toBe('searching');
});

test('the orb exposes a progress label only when asked', async () => {
  await render(<KaelThinkingOrb mode="searching" label="Đang tìm"/>);
  expect(screen.getByLabelText('Đang tìm')).toBeTruthy();
});

test('the attach menu lists its bubbles and keeps unavailable ones disabled', async () => {
  const items = [
    { id: 'photos', label: 'Thêm ảnh/tệp', icon: 'attach', onPress: jest.fn() },
    { id: 'camera', label: 'Chụp ảnh', icon: 'camera', detail: 'Sắp có', disabled: true, onPress: jest.fn() },
  ] as const;
  await render(<ComposerMenu anchor={anchor} items={items} onClose={jest.fn()}/>);
  expect(screen.getByLabelText('Thêm ảnh/tệp')).toBeTruthy();
  expect(screen.getByLabelText('Chụp ảnh').props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByLabelText('Đóng menu')).toBeTruthy();
});

test('the plus button opens the gooey menu', async () => {
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Đính kèm'));
  expect(screen.getByLabelText('Menu đính kèm')).toBeTruthy();
  expect(screen.getByLabelText('Thêm ảnh/tệp')).toBeTruthy();
  expect(screen.queryByLabelText('Tìm kiếm web')).toBeNull();
});
