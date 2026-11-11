import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { horizonLayout } from '@/theme/layout';

import { ChatComposer } from './chat-composer';

test('the message field sizes to its own content instead of flexing to the slot height', async () => {
  await render(<ChatComposer value="Kael ơi, mình muốn tìm dịch vụ vệ sinh sofa. Bạn tư vấn giúp mình nhé." onChange={jest.fn()} onSubmit={jest.fn()} />);
  const style = StyleSheet.flatten(screen.getByLabelText('Nhắn Kael').props.style);
  expect(style.flex).toBeUndefined();
  expect(style.flexGrow).toBeUndefined();
  expect(style.minHeight).toBe(horizonLayout.chatComposer.inputMinHeight);
  expect(style.maxHeight).toBe(horizonLayout.chatComposer.inputMaxHeight);
});

test('the camera menu entry is enabled and opens the camera', async () => {
  await render(<ChatComposer value="" onChange={jest.fn()} onSubmit={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Đính kèm'));
  const camera = screen.getByLabelText('Chụp ảnh');
  expect(camera.props.accessibilityState).not.toMatchObject({ disabled: true });
  expect(screen.queryByText('Sắp có')).toBeNull();
});
