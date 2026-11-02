import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { PopBadge } from './motion-count';

type Props = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  first?: boolean;
  badge?: number;
  children: React.ReactNode;
};

const metrics = horizonLayout.sidebarList;
const listColors = horizonColors.sidebarList;
const revealEasing = Easing.bezier(0.23, 1, 0.32, 1);

export function CollapsibleGroup({ title, expanded, onToggle, first, badge = 0, children }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [hidden, setHidden] = useState(!expanded);
  const [progress] = useState(() => new Animated.Value(expanded ? 1 : 0));
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: reduceMotion ? metrics.groupReducedDuration : expanded ? metrics.groupRevealDuration : metrics.groupHideDuration,
      easing: revealEasing,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !expanded) setHidden(true); });
    return () => animation.stop();
  }, [expanded, progress, reduceMotion]);
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.groupChevronClosedRotation, metrics.groupChevronOpenRotation] });
  const offset = progress.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : -metrics.groupRevealOffset, 0] });
  return <View style={first ? undefined : styles.group}>
    <Pressable accessibilityRole="button" accessibilityLabel={!expanded && badge > 0 ? `${title}, ${badge} mới` : title} accessibilityState={{ expanded }} onPress={() => { if (!expanded) setHidden(false); onToggle(); }} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Animated.View style={[styles.chevron, { transform: [{ rotate }] }]}>
        <Icon name="chevron" size={metrics.groupChevronSize} color={listColors.groupChevron} strokeWidth={2.2}/>
      </Animated.View>
      <PopBadge count={badge} visible={!expanded} style={styles.badge} textStyle={styles.badgeText}/>
    </Pressable>
    {(expanded || !hidden) && <Animated.View style={{ opacity: progress, transform: [{ translateY: offset }] }}>{children}</Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  group: { marginTop: metrics.groupMarginTop },
  toggle: { minHeight: metrics.groupToggleHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: metrics.groupToggleGap, paddingHorizontal: metrics.rowPadding, borderRadius: metrics.groupToggleRadius },
  pressed: { backgroundColor: listColors.pressed },
  title: { color: horizonColors.text, fontSize: metrics.groupTitleFontSize, fontWeight: metrics.groupTitleFontWeight },
  chevron: { marginTop: metrics.groupChevronNudge },
  badge: { minWidth: metrics.badgeSize, height: metrics.badgeSize, paddingHorizontal: metrics.badgePaddingHorizontal, borderRadius: metrics.badgeRadius, backgroundColor: listColors.badge, alignItems: 'center', justifyContent: 'center', marginLeft: metrics.groupToggleGap },
  badgeText: { color: listColors.onBadge, fontSize: metrics.badgeFontSize, fontWeight: metrics.badgeFontWeight },
});
