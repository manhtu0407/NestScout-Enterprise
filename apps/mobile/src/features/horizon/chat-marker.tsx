import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type MarkerTone = 'neutral' | 'info' | 'success' | 'warning';

const toneColor: Readonly<Record<MarkerTone, string>> = {
  neutral: colors.neutralFg,
  info: colors.infoFg,
  success: colors.successFg,
  warning: colors.warnFg,
};

type Props = { label: string; icon?: LucideIcon; tone?: MarkerTone };

export function ChatMarker({ label, icon: Glyph, tone = 'neutral' }: Props) {
  const tint = toneColor[tone];
  return <View accessibilityRole="text" accessibilityLabel={label} style={styles.root}>
    <View style={styles.line}/>
    <View style={styles.pill}>
      {Glyph !== undefined && <Glyph size={metrics.markerIcon} color={tint} strokeWidth={2.4}/>}
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
    </View>
    <View style={styles.line}/>
  </View>;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: metrics.markerGap },
  line: { flex: 1, height: metrics.markerLine, backgroundColor: colors.border },
  pill: { flexDirection: 'row', alignItems: 'center', gap: metrics.quarter, paddingHorizontal: metrics.markerPaddingX, paddingVertical: metrics.markerPaddingY, borderRadius: metrics.pillRadius, backgroundColor: colors.neutralBg },
  label: { fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
});
