import { render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';
import * as glassEffect from 'expo-glass-effect';
import { horizonColors } from '@/theme/palette';
import { GlassSurface } from './glass-surface';

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GlassView: (props: Record<string, unknown>) => <View {...props} testID="native-glass"/>,
    isLiquidGlassAvailable: jest.fn(() => false),
    isGlassEffectAPIAvailable: jest.fn(() => false),
  };
});

afterEach(() => jest.restoreAllMocks());

function nativeGlass(available: boolean, apiAvailable = available) {
  jest.mocked(glassEffect.isLiquidGlassAvailable).mockReturnValue(available);
  jest.mocked(glassEffect.isGlassEffectAPIAvailable).mockReturnValue(apiAvailable);
}

function renderSurface() {
  return render(<GlassSurface variant="control" radius={22} testID="surface"><Text>icon</Text></GlassSurface>);
}

test('uses the native Liquid Glass view only when both availability checks pass', async () => {
  nativeGlass(true);
  await renderSurface();
  expect(screen.getByTestId('native-glass')).toBeTruthy();
});

test('falls back to a plain surface when the glass API module is missing', async () => {
  nativeGlass(true, false);
  await renderSurface();
  expect(screen.queryByTestId('native-glass')).toBeNull();
  expect(screen.getByTestId('surface')).toBeTruthy();
});

test('Reduce Transparency replaces native glass with a solid surface', async () => {
  nativeGlass(true);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);
  await renderSurface();
  await waitFor(() => expect(screen.queryByTestId('native-glass')).toBeNull());
  expect(screen.getByText('icon')).toBeTruthy();
});

test('the accent tone tints the native glass and the neutral tone does not', async () => {
  nativeGlass(true);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  await render(<GlassSurface variant="control" radius={22} tone="accent"><Text>icon</Text></GlassSurface>);
  expect(screen.getByTestId('native-glass').props.tintColor).toBe(horizonColors.liquid.tint.accent);
  await renderSurface();
  expect(screen.getAllByTestId('native-glass')[1]?.props.tintColor).toBeUndefined();
});
