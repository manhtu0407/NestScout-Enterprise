import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { OtpVerificationScreen } from '@/features/access/screens/otp-verification-screen';
import { PhoneEntryScreen } from '@/features/access/screens/phone-entry-screen';
import { layout, typography } from '@/theme/layout';
import { paletteForAppearance } from '@/theme/palette';

import { ActionButton } from './action-button';
import { LoadingView } from './loading-view';
import { Screen } from './screen';
import { BodyText, ErrorText, Heading } from './text';

let mockScheme: 'light' | 'dark' = 'light';

jest.mock('@/theme/palette', () => {
  const actual = jest.requireActual('@/theme/palette');
  return { ...actual, usePalette: () => actual.paletteForAppearance(mockScheme) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), Redirect: () => null }));
jest.mock('@/features/access/auth/use-phone-sign-in', () => ({
  otpLength: 6,
  usePhoneSignIn: () => ({ busy: false, submitPhone: jest.fn(), submitCode: jest.fn(), cancel: jest.fn(), resend: jest.fn(), resendSeconds: 0 }),
}));
jest.mock('@/features/access/state/access-provider', () => ({ useAccess: () => ({ otpPhone: '+84912345678' }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: jest.requireActual<typeof import('react-native')>('react-native').View }));

afterEach(() => { mockScheme = 'light'; });

function contrast(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('pins layout and typography values', () => {
  expect(layout).toEqual({ screen: { padding: 24, gap: 16 }, control: { minHeight: 48, radius: 10, horizontalPadding: 16, inactiveOpacity: 0.5, feedbackBorderWidth: 2 }, input: { horizontalPadding: 12, borderWidth: 1 }, loading: { gap: 12 } });
  expect(typography).toEqual({ heading: { fontSize: 28, fontWeight: '700' }, body: { fontSize: 16, lineHeight: 22 }, control: { fontSize: 16, fontWeight: '600' }, phoneInput: { fontSize: 18 }, codeInput: { fontSize: 24, letterSpacing: 6 } });
});

test.each(['light', 'dark'] as const)('shared and authentication styles retain base values in %s', async (mode) => {
  mockScheme = mode;
  const palette = paletteForAppearance(mode);
  const view = await render(<Screen><Heading>Title</Heading><BodyText>Content</BodyText><ErrorText>Error</ErrorText><ActionButton label="Continue" onPress={() => undefined} /><ActionButton label="Back" onPress={() => undefined} secondary disabled /><LoadingView label="Loading" /></Screen>);
  expect(StyleSheet.flatten(screen.root?.props.style)).toEqual({ flex: 1, backgroundColor: palette.background });
  const scroll = screen.container.queryAll((node) => node.type === 'RCTScrollView');
  expect(scroll).toHaveLength(1);
  expect(StyleSheet.flatten(scroll[0]?.props.contentContainerStyle)).toEqual({ flexGrow: 1, padding: 24, gap: 16, justifyContent: 'center' });
  const loading = screen.container.queryAll((node) => node.props.accessibilityRole === 'progressbar');
  expect(loading).toHaveLength(1);
  expect(StyleSheet.flatten(loading[0]?.props.style)).toEqual({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: palette.background });
  expect(StyleSheet.flatten(screen.getByRole('header', { name: 'Title' }).props.style)).toEqual({ color: palette.text, fontSize: 28, fontWeight: '700' });
  expect(StyleSheet.flatten(screen.getByText('Content').props.style)).toEqual({ color: palette.text, fontSize: 16, lineHeight: 22 });
  expect(StyleSheet.flatten(screen.getByText('Error').props.style)).toEqual({ color: palette.danger, fontSize: 16, lineHeight: 22 });
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Continue' }).props.style)).toEqual({ minHeight: 48, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent });
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Back' }).props.style)).toEqual({ minHeight: 48, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderColor: palette.border, borderWidth: 1, opacity: 0.5 });
  expect(StyleSheet.flatten(screen.getByText('Continue').props.style)).toEqual({ color: palette.onAccent, fontSize: 16, fontWeight: '600' });
  for (const label of ['Title', 'Content', 'Error', 'Continue']) {
    expect(screen.getByText(label).props.dynamicTypeRamp).toBeUndefined();
    expect(screen.getByText(label).props.allowFontScaling).toBeUndefined();
  }
  await view.unmount();
  const phone = await render(<PhoneEntryScreen />);
  const phoneInput = screen.getByLabelText('Mobile number');
  expect(StyleSheet.flatten(phoneInput.props.style)).toEqual({ minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 18, color: palette.text, borderColor: palette.border });
  expect(phoneInput.props.allowFontScaling).toBeUndefined();
  await phone.unmount();
  await render(<OtpVerificationScreen />);
  const codeInput = screen.getByLabelText('One-time code');
  expect(StyleSheet.flatten(codeInput.props.style)).toEqual({ minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 24, letterSpacing: 6, color: palette.text, borderColor: palette.border });
  expect(codeInput.props.allowFontScaling).toBeUndefined();
});

test('pins both palettes', () => {
  expect(paletteForAppearance('light')).toEqual({ background: '#ffffff', surface: '#f2f2f7', text: '#111111', mutedText: '#555555', border: '#76767a', accent: '#0a5bd8', onAccent: '#ffffff', danger: '#b00020' });
  expect(paletteForAppearance('dark')).toEqual({ background: '#000000', surface: '#1c1c1e', text: '#f5f5f5', mutedText: '#b0b0b5', border: '#77777a', accent: '#4f9bff', onAccent: '#000000', danger: '#ff6b6b' });
});

test.each(['light', 'dark'] as const)('meets contrast targets for %s', (mode) => {
  const p = paletteForAppearance(mode);
  for (const foreground of [p.text, p.mutedText, p.danger]) {
    for (const background of [p.background, p.surface]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(p.border, p.background)).toBeGreaterThanOrEqual(3);
  expect(contrast(p.border, p.surface)).toBeGreaterThanOrEqual(3);
});

test('secondary actions retain their accessible name and run when enabled', async () => {
  const onPress = jest.fn();
  const label = 'Tiếp tục với yêu cầu có nội dung dài';
  await render(<ActionButton label={label} hint="Mở bước tiếp theo" onPress={onPress} secondary />);
  const button = screen.getByRole('button', { name: label });
  expect(button.props.accessibilityHint).toBe('Mở bước tiếp theo');
  expect(button).toBeEnabled();
  await fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test.each(['light', 'dark'] as const)('enabled actions show pressed and focus feedback in %s', async (mode) => {
  mockScheme = mode;
  const palette = paletteForAppearance(mode);
  await render(<ActionButton label="Continue" onPress={() => undefined} secondary />);
  const button = screen.getByRole('button', { name: 'Continue' });
  await fireEvent(button, 'pressIn');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ borderColor: palette.accent, borderWidth: layout.control.feedbackBorderWidth });
  await fireEvent(button, 'pressOut');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ borderColor: palette.border, borderWidth: layout.input.borderWidth });
  await fireEvent(button, 'focus');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ borderColor: palette.accent, borderWidth: layout.control.feedbackBorderWidth });
  await fireEvent(button, 'blur');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ borderColor: palette.border, borderWidth: layout.input.borderWidth });
});

test.each(['light', 'dark'] as const)('primary feedback preserves label and inactive styles in %s', async (mode) => {
  mockScheme = mode;
  const palette = paletteForAppearance(mode);
  const view = await render(<ActionButton label="Continue" onPress={() => undefined} />);
  const button = screen.getByRole('button', { name: 'Continue' });
  await fireEvent(button, 'pressIn');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ backgroundColor: palette.accent, borderColor: palette.onAccent, borderWidth: layout.control.feedbackBorderWidth });
  expect(StyleSheet.flatten(screen.getByText('Continue').props.style).color).toBe(palette.onAccent);
  await fireEvent(button, 'pressOut');
  await fireEvent(button, 'focus');
  expect(StyleSheet.flatten(button.props.style)).toMatchObject({ borderColor: palette.onAccent, borderWidth: layout.control.feedbackBorderWidth });
  await view.rerender(<ActionButton label="Continue" onPress={() => undefined} disabled />);
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Continue' }).props.style)).toMatchObject({ backgroundColor: palette.accent, opacity: layout.control.inactiveOpacity });
  expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Continue' }).props.style).borderWidth).toBeUndefined();
});

test('disabled and busy actions expose their state and do not invoke the action', async () => {
  const onPress = jest.fn();
  const view = await render(<ActionButton label="Continue" onPress={onPress} disabled />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onPress).not.toHaveBeenCalled();
  await view.rerender(<ActionButton label="Continue" onPress={onPress} busy />);
  expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onPress).not.toHaveBeenCalled();
});
