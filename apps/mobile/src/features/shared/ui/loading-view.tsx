import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { usePalette } from '@/theme/palette';

import { BodyText } from './text';

export function LoadingView({ label }: { label: string }) {
  const palette = usePalette();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.container, { backgroundColor: palette.background }]}>
      <ActivityIndicator />
      <BodyText muted>{label}</BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
