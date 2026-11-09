import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, Check } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Badge } from '@/features/shared';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type RequestItem = Readonly<{ id: string; label: string; value: string | null }>;

type Props = {
  title?: string;
  items: readonly RequestItem[];
  onFill: (id: string) => void;
  onConfirm: () => void;
  confirmed?: boolean;
};

export function missingCount(items: readonly RequestItem[]): number {
  return items.filter(item => item.value === null).length;
}

export function RequestSummary({ title = 'Kael đã tổng hợp yêu cầu của bạn', items, onFill, onConfirm, confirmed = false }: Props) {
  const missing = missingCount(items);
  const ready = missing === 0 && !confirmed;
  return <View style={styles.root}>
    <View style={styles.head}>
      <Text style={styles.title}>{title}</Text>
      {confirmed ? <Badge label="Đang tìm thợ" tone="info" dot size="sm"/> : missing > 0 ? <Badge label={`Thiếu ${missing} mục`} tone="warning" size="sm"/> : <Badge label="Đã đủ thông tin" tone="success" icon={Check} size="sm"/>}
    </View>
    <View>
      {items.map((item, index) => {
        const empty = item.value === null;
        return <View key={item.id} style={[styles.row, index > 0 && styles.rowDivider]}>
          <View style={[styles.mark, empty ? styles.markEmpty : styles.markDone]}>
            {empty ? <AlertCircle size={metrics.taskIcon - 4} color={colors.warnFg} strokeWidth={2.4}/> : <Check size={metrics.taskIcon - 4} color={colors.solidFg} strokeWidth={3}/>}
          </View>
          <View style={styles.copy}>
            <Text style={styles.label}>{item.label}</Text>
            <Text style={[styles.value, empty && styles.valueEmpty]}>{item.value ?? 'Chưa có thông tin'}</Text>
          </View>
          {empty && !confirmed && <Pressable accessibilityRole="button" accessibilityLabel={`Bổ sung ${item.label}`} onPress={() => onFill(item.id)} style={styles.fill}><Text style={styles.fillText}>Bổ sung</Text></Pressable>}
        </View>;
      })}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={onConfirm} style={[styles.confirm, ready && styles.confirmReady]}>
      <Text style={[styles.confirmText, ready && styles.confirmTextReady]}>{confirmed ? 'Đã chốt, Kael đang tìm thợ' : 'Chốt và tìm thợ'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  root: { borderRadius: metrics.radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: metrics.taskPadding, gap: metrics.gap },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.rowGap },
  title: { flex: 1, color: colors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  row: { minHeight: metrics.taskRowMin, flexDirection: 'row', alignItems: 'center', gap: metrics.taskGap, paddingVertical: metrics.rowGap },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mark: { width: metrics.taskIcon, height: metrics.taskIcon, borderRadius: metrics.pillRadius, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: colors.successFg },
  markEmpty: { backgroundColor: colors.warnBg },
  copy: { flex: 1, gap: metrics.tiny },
  label: { color: colors.muted, fontSize: metrics.captionSize },
  value: { color: colors.text, fontSize: metrics.bodySize },
  valueEmpty: { color: colors.warnFg },
  fill: { paddingHorizontal: metrics.badgePaddingMd, paddingVertical: metrics.badgePaddingSm, borderRadius: metrics.pillRadius, backgroundColor: colors.accentSoft },
  fillText: { color: colors.accent, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  confirm: { height: metrics.questionOptionMin, borderRadius: metrics.questionOptionRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralBg },
  confirmReady: { backgroundColor: colors.solidBg },
  confirmText: { color: colors.faint, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  confirmTextReady: { color: colors.solidFg },
});
