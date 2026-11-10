import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

type Props = {
  online: boolean;
  onToggle: () => void;
  hint?: string;
  missingCount?: number;
};

const metrics = horizonLayout.workerSidebar;
const colors = horizonColors.workerSidebar;
const travel = metrics.switchWidth - metrics.switchThumb - metrics.switchInset * 2;

export function AvailabilitySwitch({ online, onToggle, hint, missingCount = 0 }: Props) {
  const blocked = !online && missingCount > 0;
  const { reduceMotion } = useGlassAccessibility();
  const [position] = useState(() => new Animated.Value(online ? 1 : 0));
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (reduceMotion) { position.setValue(online ? 1 : 0); return; }
    const motion = Animated.timing(position, { toValue: online ? 1 : 0, duration: metrics.stateDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: false });
    motion.start();
    return () => motion.stop();
  }, [online, position, reduceMotion]);
  const trackColor = position.interpolate({ inputRange: [0, 1], outputRange: [colors.switchOff, colors.online] });
  const thumbShift = position.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  const stretch = pressed ? metrics.switchPressStretch : 0;
  return <Pressable
    accessibilityRole="switch"
    accessibilityLabel="Nhận việc mới"
    accessibilityHint={hint ?? (blocked ? `Hồ sơ còn thiếu ${missingCount} mục. Chạm để mở hồ sơ và bổ sung` : online ? 'Đang nhận việc. Chạm để tắt nhận việc' : 'Đang tắt. Chạm để bắt đầu nhận việc')}
    accessibilityState={{ checked: online }}
    onPress={onToggle}
    onPressIn={() => setPressed(true)}
    onPressOut={() => setPressed(false)}
    style={styles.row}
  >
    <View style={styles.copy}>
      <Text style={styles.title}>Nhận việc mới</Text>
      <Text numberOfLines={1} style={[styles.status, online && styles.statusOn, blocked && styles.statusNeeds]}>
        {blocked ? `Cần bổ sung ${missingCount} mục hồ sơ` : online ? 'Đang bật · sẵn sàng nhận việc' : 'Đang tắt · tạm dừng nhận việc'}
      </Text>
    </View>
    <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.thumb, { width: metrics.switchThumb + stretch, transform: [{ translateX: Animated.subtract(thumbShift, online ? stretch : 0) }] }]}/>
    </Animated.View>
  </Pressable>;
}

function half(size: number): number {
  return size / 2;
}

const styles = StyleSheet.create({
  row: { minHeight: metrics.switchRowHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.switchGap, paddingHorizontal: metrics.cardPadding, borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill },
  copy: { flex: 1, gap: metrics.statCopyGap },
  title: { color: colors.ink, fontSize: metrics.statValueSize, fontWeight: metrics.statValueWeight },
  status: { color: colors.muted, fontSize: metrics.statCaptionSize },
  statusOn: { color: colors.accentText },
  statusNeeds: { color: colors.needsText },
  track: { width: metrics.switchWidth, height: metrics.switchHeight, borderRadius: half(metrics.switchHeight), padding: metrics.switchInset, justifyContent: 'center' },
  thumb: { height: metrics.switchThumb, borderRadius: half(metrics.switchThumb), backgroundColor: colors.switchThumb, shadowColor: colors.ink, shadowOpacity: horizonLayout.availabilitySwitchStyle.thumbShadowOpacity, shadowRadius: horizonLayout.availabilitySwitchStyle.thumbShadowRadius, shadowOffset: { width: 0, height: horizonLayout.availabilitySwitchStyle.thumbShadowOffsetHeight }, elevation: horizonLayout.availabilitySwitchStyle.thumbElevation },
});
