import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { LiquidSwitch } from './liquid-switch';

function Harness({ onChange }: { onChange: (value: boolean) => void }) {
  const [value, setValue] = useState(false);
  return <LiquidSwitch accessibilityLabel="Thông báo" value={value} onValueChange={next => { setValue(next); onChange(next); }} />;
}

test('pressing the switch flips its checked state and reports the new value', async () => {
  const onChange = jest.fn();
  await render(<Harness onChange={onChange} />);
  expect(screen.getByRole('switch', { name: 'Thông báo' }).props.accessibilityState.checked).toBe(false);
  await fireEvent.press(screen.getByRole('switch', { name: 'Thông báo' }));
  expect(onChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('switch', { name: 'Thông báo' }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('switch', { name: 'Thông báo' }));
  expect(onChange).toHaveBeenLastCalledWith(false);
});
