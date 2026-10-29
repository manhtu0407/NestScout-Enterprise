import type { ReactNode } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { usePalette } from '@/theme/palette';
import { typography } from '@/theme/layout';

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
  heading: typography.heading,
  body: typography.body,
});

export type TextVariant = 'title' | 'heading' | 'subheading' | 'body' | 'caption';

export function AppText({ variant = 'body', muted = false, style, ...props }: TextProps & { variant?: TextVariant; muted?: boolean }) {
  const palette = usePalette();
  return <Text {...props} style={[typography[variant], { color: muted ? palette.mutedText : palette.text }, style]} />;
}
