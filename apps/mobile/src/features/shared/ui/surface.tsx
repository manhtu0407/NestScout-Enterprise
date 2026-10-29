import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { layout } from '@/theme/layout';
import { usePalette } from '@/theme/palette';

export function Surface({ children, elevated = false }: { children: ReactNode; elevated?: boolean }) {
  const palette = usePalette();
  return <View style={[styles.surface, { backgroundColor: palette.surface, borderColor: palette.border }, elevated && { elevation: layout.elevation.raised, shadowColor: palette.shadow, shadowOpacity: layout.elevation.shadowOpacity, shadowRadius: layout.elevation.shadowRadius, shadowOffset: { width: 0, height: layout.elevation.shadowOffset } }]}>{children}</View>;
}

export function Divider() {
  const palette = usePalette();
  return <View accessible={false} style={[styles.divider, { backgroundColor: palette.border }]} />;
}

const styles = StyleSheet.create({
  surface: { padding: layout.spacing.lg, gap: layout.spacing.md, borderRadius: layout.radius.large, borderWidth: layout.border.thin },
  divider: { height: layout.border.thin, alignSelf: 'stretch' },
});
