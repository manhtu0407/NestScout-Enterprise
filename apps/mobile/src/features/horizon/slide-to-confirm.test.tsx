import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SlideToConfirm } from './slide-to-confirm';

const activate = { nativeEvent: { actionName: 'activate' } };

test('the assistive activate action confirms once the thumb has travelled', async () => {
  const onConfirm = jest.fn();
  await render(<SlideToConfirm label="Trượt để nhận việc" accessibilityLabel="Nhận việc Sửa vòi" onConfirm={onConfirm} />);
  const control = screen.getByLabelText('Nhận việc Sửa vòi');
  await fireEvent(control, 'accessibilityAction', activate);
  await fireEvent(control, 'accessibilityAction', activate);
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('Nhận việc Sửa vòi').props.accessibilityState).toMatchObject({ busy: true });
});

test('a disabled control never confirms', async () => {
  const onConfirm = jest.fn();
  await render(<SlideToConfirm disabled label="Trượt" accessibilityLabel="Xác nhận" onConfirm={onConfirm} />);
  await fireEvent(screen.getByLabelText('Xác nhận'), 'accessibilityAction', activate);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Xác nhận').props.accessibilityState).toMatchObject({ disabled: true });
});

test('a plain tap does not confirm', async () => {
  const onConfirm = jest.fn();
  await render(<SlideToConfirm label="Trượt" accessibilityLabel="Xác nhận" onConfirm={onConfirm} />);
  await fireEvent.press(screen.getByLabelText('Xác nhận'));
  expect(onConfirm).not.toHaveBeenCalled();
});
