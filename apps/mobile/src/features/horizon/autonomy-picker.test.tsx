import { fireEvent, render, screen } from '@testing-library/react-native';

import { AutonomyPicker } from './autonomy-picker';

test('the trigger names the current mode and the menu offers Ask and Auto with the current one checked', async () => {
  const onChange = jest.fn();
  await render(<AutonomyPicker mode="client" value="ask" onChange={onChange}/>);
  expect(screen.getByLabelText('Chế độ Kael: Ask')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Chế độ Kael: Ask'));
  expect(screen.getByLabelText(/^Ask\./).props.accessibilityState).toMatchObject({ checked: true });
  expect(screen.getByLabelText(/^Auto\./).props.accessibilityState).toMatchObject({ checked: false });
  await fireEvent.press(screen.getByLabelText(/^Auto\./));
  expect(onChange).toHaveBeenCalledWith('auto');
  expect(screen.queryByLabelText('Chế độ Kael')).toBeNull();
});

test('choosing the current mode only closes the menu', async () => {
  const onChange = jest.fn();
  await render(<AutonomyPicker mode="client" value="auto" onChange={onChange}/>);
  await fireEvent.press(screen.getByLabelText('Chế độ Kael: Auto'));
  await fireEvent.press(screen.getByLabelText(/^Auto\./));
  expect(onChange).not.toHaveBeenCalled();
});

test('the worker menu describes automatic acceptance and a failed save is shown', async () => {
  await render(<AutonomyPicker mode="worker" value="ask" onChange={jest.fn()} failed/>);
  await fireEvent.press(screen.getByLabelText('Chế độ Kael: Ask'));
  expect(screen.getByText('Kael tự nhận việc khớp hồ sơ của bạn rồi báo cho bạn qua thông báo.')).toBeTruthy();
  expect(screen.getByText('Chưa lưu được lựa chọn. Bạn thử lại nhé.')).toBeTruthy();
});

test('a disabled picker does not open', async () => {
  await render(<AutonomyPicker mode="client" value="ask" onChange={jest.fn()} disabled/>);
  await fireEvent.press(screen.getByLabelText('Chế độ Kael: Ask'));
  expect(screen.queryByLabelText('Chế độ Kael')).toBeNull();
});
