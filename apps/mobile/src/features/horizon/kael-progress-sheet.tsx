import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon } from '@/features/shared';
import type { KaelProgress } from './kael-progress';
import { KaelPopIn, KaelSpinnerCheck } from './kael-progress-motion';

const metrics = horizonLayout.kaelCompanion;
const colors = horizonColors.kaelCompanion;

type Props = {
  open: boolean;
  progress: KaelProgress | null;
  bottomOffset: number;
  onClose: () => void;
};

export function KaelProgressSheet({ open, progress, bottomOffset, onClose }: Props) {
  if (!open) return null;
  const hint = progress === null ? 'Chưa có yêu cầu đặt dịch vụ nào đang diễn ra' : progress.hint;
  return <>
    <Pressable accessible={false} onPress={onClose} style={styles.scrim}/>
    <View accessibilityViewIsModal accessibilityLabel="Tiến độ đặt dịch vụ" style={[styles.sheet, { bottom: bottomOffset }]}>
      <View style={styles.head}>
        {progress !== null && <KaelSpinnerCheck done={progress.finished} label={progress.spinnerLabel}/>}
        <View style={styles.headCopy}>
          <Text style={styles.title}>Tiến độ</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng tiến độ" onPress={onClose} style={styles.close}>
          <Icon name="close" size={metrics.progressCloseGlyph} color={colors.progressCloseGlyph}/>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {progress?.steps.map((label, index) => {
          const past = index < progress.current;
          const active = index === progress.current;
          const status = past ? 'Đã hoàn thành' : active ? 'Bạn đang ở bước này' : 'Chưa đến bước';
          return <View key={label} accessible accessibilityLabel={`${label}. ${status}`} accessibilityState={{ selected: active }} style={styles.item}>
            <KaelPopIn enabled={past || active} index={index} style={[styles.marker, past && styles.markerDone, active && styles.markerCurrent]}>
              {past && <Icon name="check" size={metrics.progressMarkerGlyph} color={colors.progressMarkerGlyph}/>}
              {active && <View style={styles.dot}/>}
            </KaelPopIn>
            <View style={styles.itemCopy}>
              <Text style={[styles.itemTitle, (past || active) && styles.itemTitleActive, active && styles.itemTitleCurrent]}>{label}</Text>
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
