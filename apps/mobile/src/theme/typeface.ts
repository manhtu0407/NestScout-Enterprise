import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Platform, StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';

export const typefaceAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} as const;

type InterFamily = keyof typeof typefaceAssets;

const webFallback = ', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function interFamilyFor(weight: TextStyle['fontWeight']): InterFamily {
  const numeric = weight === 'bold' ? 700 : weight === undefined || weight === 'normal' ? 400 : Number(weight);
  if (numeric >= 700) return 'Inter_700Bold';
  if (numeric >= 600) return 'Inter_600SemiBold';
  if (numeric >= 500) return 'Inter_500Medium';
  return 'Inter_400Regular';
}

export function interStyleFor(style: StyleProp<TextStyle>): TextStyle | null {
  const flat = StyleSheet.flatten(style);
  if (flat?.fontFamily) return null;
  const family = interFamilyFor(flat?.fontWeight);
  return { fontFamily: Platform.OS === 'web' ? `${family}${webFallback}` : family, fontWeight: 'normal' };
}

type Renderable = { render?: (props: { style?: StyleProp<TextStyle> }, ref: unknown) => unknown };

let applied = false;

export function applyInterTo(component: unknown): boolean {
  const target = component as Renderable;
  const original = target.render;
  if (typeof original !== 'function') return false;
  target.render = function render(props, ref) {
    const inter = interStyleFor(props.style);
    return original.call(this, inter ? { ...props, style: [props.style, inter] } : props, ref);
  };
  return true;
}

export function applyTypeface() {
  if (applied) return;
  applied = true;
  if (!applyInterTo(Text) || !applyInterTo(TextInput)) console.error('Text or TextInput is not a forwardRef component; the system font stays in use.');
}
