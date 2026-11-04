import { Pressable, StyleSheet, Text, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { KaelAttention, KaelAttentionTone } from './kael-attention';
import { Presence, useRetained } from './motion-presence';

const metrics = horizonLayout.kaelAttention;
const colors = horizonColors.kaelAttention;
const navHeight = horizonLayout.kaelCompanion.navHeight;

const toneDots: Readonly<Record<KaelAttentionTone, string>> = { wait: colors.waitDot, warn: colors.warnDot, ok: colors.okDot };
const toneSurfaces: Readonly<Record<KaelAttentionTone, string>> = { wait: colors.waitSurface, warn: colors.warnSurface, ok: colors.okSurface };
const toneBorders: Readonly<Record<KaelAttentionTone, string>> = { wait: colors.border, warn: colors.warnBorder, ok: colors.okBorder };

type Props = { attention: KaelAttention | null; onAction: (attention: KaelAttention) => void; onHeight: (height: number) => void };

export function KaelAttentionCard({ attention, onAction, onHeight }: Props) {
  const shown = useRetained(attention);
  return <Presence visible={attention !== null} style={styles.wrap} offset={-metrics.gap}>
    {shown && <View onLayout={event => onHeight(event.nativeEvent.layout.height)} accessibilityRole="alert" accessibilityLiveRegion="polite" accessibilityLabel={`${shown.title}. ${shown.body}`} style={[styles.card, { backgroundColor: toneSurfaces[shown.tone], borderColor: toneBorders[shown.tone] }]}>
      <View style={[styles.dot, { backgroundColor: toneDots[shown.tone] }]}/>
      <View style={styles.copy}>
        <Text style={styles.title}>{shown.title}</Text>
        <Text style={styles.body}>{shown.body}</Text>
      </View>
      {shown.actionLabel !== null && <Pressable accessibilityRole="button" accessibilityLabel={shown.actionLabel} onPress={() => onAction(shown)} style={styles.action}>
        <Text style={styles.actionText}>{shown.actionLabel}</Text>
      </Pressable>}
    </View>}
  </Presence>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: metrics.inset, right: metrics.inset, top: navHeight + metrics.top, zIndex: 5 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: metrics.gap, padding: metrics.padding, borderRadius: metrics.radius, borderWidth: StyleSheet.hairlineWidth },
  dot: { width: metrics.dot, height: metrics.dot, borderRadius: metrics.dotRadius, marginTop: metrics.dotTop },
  copy: { flex: 1, minWidth: 0, gap: metrics.copyGap },
  title: { color: colors.ink, fontSize: metrics.titleSize, lineHeight: metrics.titleLine, fontWeight: metrics.titleWeight },
  body: { color: colors.inkMuted, fontSize: metrics.bodySize, lineHeight: metrics.bodyLine },
  action: { minHeight: metrics.actionHeight, justifyContent: 'center', paddingHorizontal: metrics.actionPadding, borderRadius: metrics.actionRadius, backgroundColor: colors.accent },
  actionText: { color: colors.onAccent, fontSize: metrics.actionSize, fontWeight: metrics.titleWeight },
});
