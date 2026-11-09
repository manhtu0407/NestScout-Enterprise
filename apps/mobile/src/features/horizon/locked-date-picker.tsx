import { StyleSheet, Text, View } from 'react-native';

import { Badge, DateCalendar } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

const ignore = () => undefined;

export function LockedDatePicker() {
  return <View style={styles.root}>
    <View style={styles.header}>
      <Text style={styles.title}>Chọn ngày thợ đến</Text>
      <Badge label="Coming Soon" tone="warning" size="sm" />
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.calendar}>
      <DateCalendar value={null} onChange={ignore} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  calendar: { opacity: metrics.lockedOpacity },
});
