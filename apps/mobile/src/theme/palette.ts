import { useColorScheme } from 'react-native';

const light = {
  background: '#ffffff',
  surface: '#f2f2f7',
  text: '#111111',
  mutedText: '#555555',
  border: '#76767a',
  accent: '#0a5bd8',
  onAccent: '#ffffff',
  danger: '#b00020',
};

const dark: typeof light = {
  background: '#000000',
  surface: '#1c1c1e',
  text: '#f5f5f5',
  mutedText: '#b0b0b5',
  border: '#77777a',
  accent: '#4f9bff',
  onAccent: '#000000',
  danger: '#ff6b6b',
};

export type Palette = typeof light;

export function paletteForAppearance(appearance: 'light' | 'dark' | null | undefined): Palette {
  return appearance === 'dark' ? dark : light;
}

export function usePalette(): Palette {
  return paletteForAppearance(useColorScheme());
}
