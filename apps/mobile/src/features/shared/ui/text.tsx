import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { usePalette } from '@/theme/palette';

export function Heading({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>
      {children}
    </Text>
  );
}

export function BodyText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const palette = usePalette();
  return <Text style={[styles.body, { color: muted ? palette.mutedText : palette.text }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.body, { color: palette.danger }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
});
