import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from './glass-interaction';
import { GlassSurface } from './glass-surface';
import { Icon } from './icon';
import type { IconName } from './icon';

const metrics = horizonLayout.conversationMenu;
const glass = horizonLayout.glass;
const colors = horizonColors.conversationMenu;

export type ConversationMenuItem = { id: string; label: string; icon: IconName; destructive?: boolean; onPress: () => void };

type Props = { title: string; items: readonly ConversationMenuItem[]; onClose: () => void };

export function ConversationMenu({ title, items, onClose }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(0));
  const leaving = useRef(false);
  const alive = useRef(true);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    alive.current = true;
    if (leaving.current) return;
    const entrance = reduceMotion
      ? Animated.timing(progress, { toValue: 1, duration: glass.reducedDuration, useNativeDriver: true })
      : Animated.spring(progress, { toValue: 1, ...glass.popSpring, useNativeDriver: true });
    animation.current = entrance;
    entrance.start();
    return () => { alive.current = false; entrance.stop(); };
  }, [progress, reduceMotion]);
  const dismiss = (action?: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    animation.current?.stop();
    const exit = Animated.timing(progress, { toValue: 0, duration: reduceMotion ? glass.reducedDuration : glass.exitDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    animation.current = exit;
    exit.start(({ finished }) => { if (finished && alive.current) { onClose(); action?.(); } });
  };
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [glass.popFromScale, 1] });
  const contentOpacity = progress.interpolate({ inputRange: [...metrics.contentFadeInput], outputRange: [...metrics.contentFadeOutput] });
  return <View style={styles.overlay}>
    <Animated.View style={[styles.scrim, { opacity: progress }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu cuộc trò chuyện" onPress={() => dismiss()} style={styles.scrimTarget}/>
    </Animated.View>
    <Animated.View style={[styles.menu, { transform: [{ scale }] }]}>
      <GlassSurface variant="sheet" radius={glass.sheetRadius} accessibilityRole="menu" accessibilityLabel="Menu cuộc trò chuyện" style={styles.surface}>
        <Animated.View style={{ opacity: contentOpacity }}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {items.map(item => <Pressable key={item.id} accessibilityRole="menuitem" accessibilityLabel={item.label} onPress={() => dismiss(item.onPress)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Icon name={item.icon} size={metrics.iconSize} color={item.destructive ? colors.danger : colors.icon}/>
            <Text style={[styles.label, item.destructive && styles.danger]}>{item.label}</Text>
          </Pressable>)}
        </Animated.View>
      </GlassSurface>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  scrimTarget: { flex: 1 },
  menu: { position: 'absolute', top: metrics.top, right: horizonLayout.kaelHomeScreen.rootPaddingHorizontal, width: metrics.width, transformOrigin: 'top right' },
  surface: { padding: metrics.padding },
  title: { color: colors.title, fontSize: metrics.titleFontSize, fontWeight: metrics.titleFontWeight, paddingHorizontal: metrics.titlePaddingHorizontal, paddingTop: metrics.titlePaddingTop, paddingBottom: metrics.titlePaddingBottom },
  row: { minHeight: metrics.rowHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, paddingHorizontal: metrics.rowPaddingHorizontal, borderRadius: metrics.rowRadius },
  pressed: { backgroundColor: colors.pressed },
  label: { flex: 1, color: horizonColors.text, fontSize: metrics.labelFontSize, fontWeight: metrics.labelFontWeight },
  danger: { color: colors.danger },
});
