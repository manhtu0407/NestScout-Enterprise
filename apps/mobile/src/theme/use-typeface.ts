import { useFonts } from 'expo-font';
import { useEffect } from 'react';

import { applyTypeface, typefaceAssets } from './typeface';

export function useTypeface(): boolean {
  const [loaded, error] = useFonts(typefaceAssets);
  if (loaded) applyTypeface();
  useEffect(() => {
    if (error) console.error('Inter failed to load; the system font stays in use.', error);
  }, [error]);
  return loaded || error !== null;
}
