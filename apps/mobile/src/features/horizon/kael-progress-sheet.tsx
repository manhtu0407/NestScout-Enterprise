import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon } from './icon';
import { kaelPhaseEntries, kaelPhases } from './kael-phase';
import type { KaelPhase } from './kael-phase';

const metrics = horizonLayout.kaelCompanion;
const colors = horizonColors.kaelCompanion;

type Props = {
  open: boolean;
  phase: KaelPhase | null;
  bottomOffset: number;
  onClose: () => void;
};

export function KaelProgressSheet({ open, phase, bottomOffset, onClose }: Props) {
  if (!open) return null;
  const current = phase === null ? -1 : kaelPhases.indexOf(phase);
  const hint = phase === null ? 'Chưa có yêu cầu đặt dịch vụ nào đang diễn ra' : `Bước ${current + 1} / ${kaelPhases.length}`;
  return <>
    <Pressable accessible={false} onPress={onClose} style={styles.scrim}/>
    <View accessibilityViewIsModal accessibilityLabel="Tiến độ đặt dịch vụ" style={[styles.sheet, { bottom: bottomOffset }]}>
      <View style={styles.head}>
        <View style={styles.headCopy}>
          <Text style={styles.title}>Tiến độ</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng tiến độ" onPress={onClose} style={styles.close}>
          <Icon name="close" size={metrics.progressCloseGlyph} color={colors.progressCloseGlyph}/>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {kaelPhaseEntries.map((entry, index) => {
          const past = index < current;
          const active = index === current;
          const status = past ? 'Đã hoàn thành' : active ? 'Bạn đang ở bước này' : 'Chưa đến bước';
          return <View key={entry.id} accessible accessibilityLabel={`${entry.control}. ${status}`} accessibilityState={{ selected: active }} style={styles.item}>
            <View style={[styles.marker, past && styles.markerDone, active && styles.markerCurrent]}>
              {past && <Icon name="check" size={metrics.progressMarkerGlyph} color={colors.progressMarkerGlyph}/>}
              {active && <View style={styles.dot}/>}
            </View>
            <View style={styles.itemCopy}>
              <Text style={[styles.itemTitle, (past || active) && styles.itemTitleActive, active && styles.itemTitleCurrent]}>{entry.control}</Text>
              {active && <Text style={styles.note}>{status}</Text>}
            </View>
          </View>;
        })}
      </ScrollView>
    </View>
  </>;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.progressScrim },
  sheet: { position: 'absolute', left: metrics.progressInset, right: metrics.progressInset, maxHeight: metrics.progressMaxHeight, borderRadius: metrics.progressRadius, borderWidth: metrics.progressBorderWidth, borderColor: colors.progressBorder, backgroundColor: colors.progressSurface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: metrics.progressItemGap, padding: metrics.progressPadding },
  headCopy: { flex: 1 },
  title: { fontSize: metrics.progressTitleSize, fontWeight: metrics.progressTitleWeight, color: colors.progressTitle },
  hint: { fontSize: metrics.progressHintSize, color: colors.progressMuted, marginTop: metrics.progressHintMarginTop },
  close: { width: metrics.progressCloseSize, height: metrics.progressCloseSize, borderRadius: metrics.progressCloseRadius, backgroundColor: colors.progressClose, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: metrics.progressPadding, paddingBottom: metrics.progressPadding, gap: metrics.progressListGap },
  item: { flexDirection: 'row', alignItems: 'center', gap: metrics.progressItemGap, minHeight: metrics.progressItemMinHeight, paddingVertical: metrics.progressItemPaddingY },
  marker: { width: metrics.progressMarkerSize, height: metrics.progressMarkerSize, borderRadius: metrics.progressMarkerRadius, borderWidth: metrics.progressMarkerBorder, borderColor: colors.progressMarkerIdle, alignItems: 'center', justifyContent: 'center' },
  markerDone: { borderColor: colors.progressMarkerDone, backgroundColor: colors.progressMarkerDone },
  markerCurrent: { borderColor: colors.progressMarkerCurrent },
  dot: { width: metrics.progressMarkerDot, height: metrics.progressMarkerDot, borderRadius: metrics.progressMarkerDotRadius, backgroundColor: colors.progressMarkerCurrent },
  itemCopy: { flex: 1 },
  itemTitle: { fontSize: metrics.progressTextSize, fontWeight: metrics.progressTextWeight, color: colors.progressTextIdle },
  itemTitleActive: { color: colors.progressTextActive },
  itemTitleCurrent: { fontWeight: metrics.progressCurrentWeight },
  note: { fontSize: metrics.progressNoteSize, color: colors.progressMuted, marginTop: metrics.progressNoteMarginTop },
});
