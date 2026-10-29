import { StyleSheet, View } from 'react-native';

import { layout } from '@/theme/layout';
import { usePalette } from '@/theme/palette';

import { ActionButton } from './action-button';
import { BodyText, Heading } from './text';

export function StatusIndicator({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const palette = usePalette();
  const colors = { neutral: palette.mutedText, success: palette.success, warning: palette.warning, danger: palette.danger };
  return <View style={styles.row}><View accessible={false} style={[styles.dot, { backgroundColor: colors[tone] }]} /><BodyText>{label}</BodyText></View>;
}

export function StateView({ title, message, action }: { title: string; message: string; action?: { label: string; onPress: () => void } }) {
  return <View style={styles.state}><Heading>{title}</Heading><BodyText muted>{message}</BodyText>{action ? <ActionButton secondary label={action.label} onPress={action.onPress} /> : null}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: layout.spacing.sm },
  dot: { width: layout.dimensions.indicator, height: layout.dimensions.indicator, borderRadius: layout.radius.pill },
  state: { gap: layout.spacing.md, alignItems: 'stretch' },
});
