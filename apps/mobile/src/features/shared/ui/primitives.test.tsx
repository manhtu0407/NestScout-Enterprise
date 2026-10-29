import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { layout } from '@/theme/layout';
import { paletteForAppearance } from '@/theme/palette';

import { ActionButton } from './action-button';
import { IconButton } from './icon-button';
import { StateView, StatusIndicator } from './status-view';
import { TextField } from './text-field';

const palette = paletteForAppearance('light');
jest.mock('@/theme/palette', () => {
  const actual = jest.requireActual('@/theme/palette');
  return { ...actual, usePalette: () => actual.paletteForAppearance('light') };
});

test('field preserves input events and exposes error and disabled state', async () => {
  const onChangeText = jest.fn();
  const onFocus = jest.fn();
  const view = await render(<TextField label="Tên" value="" onChangeText={onChangeText} onFocus={onFocus} hint="Tên đầy đủ" />);
  const input = screen.getByLabelText('Tên');
  expect(input.props.accessibilityHint).toBe('Tên đầy đủ');
  await fireEvent.changeText(input, 'An');
  expect(onChangeText).toHaveBeenCalledWith('An');
  await fireEvent(input, 'focus');
  expect(onFocus).toHaveBeenCalled();
  expect(StyleSheet.flatten(input.props.style).borderColor).toBe(palette.accent);
  await view.rerender(<TextField label="Tên" value="" error="Bắt buộc" editable={false} />);
  expect(screen.getByLabelText('Tên').props.accessibilityState).toMatchObject({ disabled: true });
  expect(screen.getByLabelText('Tên').props.accessibilityHint).toBe('Bắt buộc');
  expect(StyleSheet.flatten(screen.getByLabelText('Tên').props.style).borderColor).toBe(palette.danger);
});

test('selected and disabled actions expose state and do not invoke disabled actions', async () => {
  const onPress = jest.fn();
  await render(<><ActionButton label="Selected" selected onPress={onPress} /><IconButton label="Favorite" selected disabled onPress={onPress}><Text>★</Text></IconButton></>);
  expect(screen.getByRole('button', { name: 'Selected' }).props.accessibilityState.selected).toBe(true);
  const icon = screen.getByRole('button', { name: 'Favorite' });
  expect(icon.props.accessibilityState).toMatchObject({ selected: true, disabled: true });
  expect(StyleSheet.flatten(icon.props.style)).toMatchObject({ minWidth: layout.dimensions.touch, minHeight: layout.dimensions.touch });
  await fireEvent.press(icon);
  expect(onPress).not.toHaveBeenCalled();
});

test('status and retry are communicated through text and accessible actions', async () => {
  const retry = jest.fn();
  await render(<><StatusIndicator label="Needs attention" tone="warning" /><StateView title="Unable to load" message="Try again" action={{ label: 'Retry', onPress: retry }} /></>);
  expect(screen.getByText('Needs attention')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledTimes(1);
});
