import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { paletteForAppearance } from '@/theme/palette';
import { FoundationShowcase } from './foundation-showcase';

let mockScheme: 'light' | 'dark' = 'light';
const originalRevision = process.env.EXPO_PUBLIC_DESIGN_REVISION;

jest.mock('@/theme/palette', () => {
  const actual = jest.requireActual('@/theme/palette');
  return { ...actual, usePalette: () => actual.paletteForAppearance(mockScheme) };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View }));

afterEach(() => {
  mockScheme = 'light';
  if (originalRevision === undefined) delete process.env.EXPO_PUBLIC_DESIGN_REVISION;
  else process.env.EXPO_PUBLIC_DESIGN_REVISION = originalRevision;
});

test.each(['light', 'dark'] as const)('shows inherited roles, palette and interactive action states in %s', async (mode) => {
  mockScheme = mode;
  process.env.EXPO_PUBLIC_DESIGN_REVISION = 'revision-under-test';
  await render(<FoundationShowcase />);
  expect(screen.getByRole('header', { name: 'Development component showcase' })).toBeTruthy();
  expect(screen.getByText('Revision: revision-under-test')).toBeTruthy();
  expect(screen.getByText(/Tiếng Việt có dấu/)).toBeTruthy();
  const palette = paletteForAppearance(mode);
  for (const [name, color] of Object.entries(palette)) {
    expect(StyleSheet.flatten(screen.getByLabelText(`${name} color`).props.style).backgroundColor).toBe(color);
    expect(screen.getByText(`${name}: ${color}`)).toBeTruthy();
  }
  expect(screen.getByText('Action ready')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Press to change state' }));
  expect(screen.getByText('Action pressed')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Secondary action' }));
  expect(screen.getByText('Action ready')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Disabled action' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Loading action' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
});
