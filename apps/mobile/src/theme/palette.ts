import { useColorScheme } from 'react-native';

export type Palette = Readonly<{
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  border: string;
  accent: string;
  onAccent: string;
  danger: string;
  success: string;
  warning: string;
  shadow: string;
}>;

const light: Palette = {
  background: '#ffffff', surface: '#f2f7f6', text: '#102b2c', mutedText: '#465e5d',
  border: '#687d7a', accent: '#006b64', onAccent: '#ffffff', danger: '#b00020',
  success: '#176b43', warning: '#795200', shadow: '#000000',
};

const dark: Palette = {
  background: '#071a1a', surface: '#172d2c', text: '#f1f8f6', mutedText: '#b2c7c3',
  border: '#819994', accent: '#79d8c5', onAccent: '#003730', danger: '#ff8f96',
  success: '#8bd7aa', warning: '#f2c86b', shadow: '#000000',
};

export function paletteForAppearance(appearance: 'light' | 'dark' | null | undefined): Palette {
  return appearance === 'dark' ? dark : light;
}

export function usePalette(): Palette {
  return paletteForAppearance(useColorScheme());
}
