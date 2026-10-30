import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { PressScale } from './glass-controls';
import { Icon } from './icon';
import { useGlassAccessibility } from './glass-interaction';
import { kaelPhaseLabels } from './kael-phase';
import type { KaelPhase } from './kael-phase';

const metrics = horizonLayout.recentSession;
const colors = horizonColors.recentSession;

export type RecentSession = { id: string; title: string; preview: string; timeLabel: string; phase: KaelPhase | null; pinned: boolean };

type Props = { session: RecentSession; active?: boolean; onPress: () => void; onMore: () => void; onTogglePin: () => void };

export function RecentSessionRow({ session, active = false, onPress, onMore, onTogglePin }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const revealed = active || hovered || focused;
  const [reveal] = useState(() => new Animated.Value(revealed ? 1 : 0));
  useEffect(() => {
    const animation = Animated.timing(reveal, { toValue: revealed ? 1 : 0, duration: reduceMotion ? 0 : metrics.revealDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reveal, revealed, reduceMotion]);
  const busy = session.phase === 'researching' || session.phase === 'working';
  const subtitle = busy && session.phase ? kaelPhaseLabels[session.phase] : session.preview;
  return <Pressable accessible={false} focusable={false} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={[styles.row, active && styles.active]}>
    <PressScale wrapperStyle={styles.mainWrap} accessibilityRole="button" accessibilityLabel={`${session.title}, ${subtitle}, ${session.timeLabel}`} accessibilityState={{ selected: active }} onPress={onPress} onLongPress={onMore} style={styles.main}>
      <Text numberOfLines={1} style={styles.title}>{session.title}</Text>
      <Text numberOfLines={1} style={[styles.preview, busy && styles.previewBusy]}>{subtitle}</Text>
    </PressScale>
    <Animated.View pointerEvents={revealed ? 'auto' : 'none'} style={[styles.actions, { opacity: reveal }]}>
      <PressScale accessibilityRole="button" accessibilityLabel={session.pinned ? `Bỏ ghim ${session.title}` : `Ghim ${session.title}`} accessibilityState={{ selected: session.pinned }} hitSlop={metrics.actionHitSlop} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onTogglePin} style={styles.action}>
        <Icon name="pin" size={metrics.actionIconSize} color={colors.actionIcon} strokeWidth={metrics.actionStroke} fill={session.pinned ? colors.actionIcon : undefined}/>
      </PressScale>
      <PressScale accessibilityRole="button" accessibilityLabel={`Tùy chọn khác cho ${session.title}`} hitSlop={metrics.actionHitSlop} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onMore} style={styles.action}>
        <Icon name="more" size={metrics.actionIconSize} color={colors.actionIcon}/>
      </PressScale>
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: metrics.rowMinHeight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: metrics.rowPaddingHorizontal, marginHorizontal: -metrics.rowPaddingHorizontal, borderRadius: metrics.rowRadius },
  active: { backgroundColor: colors.activeFill },
  mainWrap: { flex: 1, minWidth: 0 },
  main: { minHeight: metrics.rowMinHeight, justifyContent: 'center' },
  title: { color: horizonColors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  preview: { color: horizonColors.muted, fontSize: metrics.previewSize, marginTop: metrics.previewGap },
  previewBusy: { color: colors.busyText, fontWeight: metrics.busyWeight },
  actions: { flexDirection: 'row', alignItems: 'center' },
  action: { width: metrics.actionSize, height: metrics.actionSize, alignItems: 'center', justifyContent: 'center' },
});
