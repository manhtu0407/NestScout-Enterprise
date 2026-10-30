import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from './glass-interaction';
import { GlassSurface } from './glass-surface';
import { Icon } from './icon';
import type { IconName } from './icon';

const metrics = horizonLayout.composerMenu;
const glass = horizonLayout.glass;
const colors = horizonColors.composerMenu;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export type ComposerMenuAnchor = { x: number; bottom: number };

export type ComposerMenuItem = { id: string; label: string; icon: IconName; detail?: string; disabled?: boolean; onPress: () => void };

type Props = { anchor: ComposerMenuAnchor; items: readonly ComposerMenuItem[]; onClose: () => void };

export function ComposerMenu({ anchor, items, onClose }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(0));
  const leaving = useRef(false);
  const alive = useRef(true);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    alive.current = true;
    const entrance = Animated.timing(progress, { toValue: 1, duration: reduceMotion ? glass.reducedDuration : metrics.enterDuration, easing: easeOut, useNativeDriver: true });
    animation.current = entrance;
    entrance.start();
    return () => { alive.current = false; entrance.stop(); };
  }, [progress, reduceMotion]);
  const dismiss = (action?: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    animation.current?.stop();
    const exit = Animated.timing(progress, { toValue: 0, duration: reduceMotion ? glass.reducedDuration : metrics.exitDuration, easing: easeOut, useNativeDriver: true });
    animation.current = exit;
    exit.start(({ finished }) => { if (finished && alive.current) { onClose(); action?.(); } });
  };
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.fromScale, 1] });
  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu đính kèm" onPress={() => dismiss()} style={styles.scrim}/>
      <Animated.View style={[styles.menu, { left: anchor.x, bottom: anchor.bottom, opacity: progress, transform: [{ scale }] }]}>
        <GlassSurface variant="sheet" radius={metrics.radius} accessibilityRole="menu" accessibilityLabel="Menu đính kèm" style={styles.surface}>
          {items.map(item => <Pressable key={item.id} accessibilityRole="menuitem" accessibilityLabel={item.label} accessibilityState={{ disabled: item.disabled === true }} disabled={item.disabled} onPress={() => dismiss(item.onPress)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Icon name={item.icon} size={metrics.iconSize} color={colors.icon}/>
            <Text style={styles.label}>{item.label}</Text>
            {item.detail && <Text style={styles.detail}>{item.detail}</Text>}
          </Pressable>)}
        </GlassSurface>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  menu: { position: 'absolute', width: metrics.width, transformOrigin: 'bottom left' },
  surface: { padding: metrics.padding },
  row: { minHeight: metrics.rowHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, paddingHorizontal: metrics.rowPaddingHorizontal, borderRadius: metrics.rowRadius },
  pressed: { backgroundColor: colors.pressed },
  label: { flex: 1, color: horizonColors.text, fontSize: metrics.labelFontSize, fontWeight: metrics.labelFontWeight },
  detail: { color: colors.detail, fontSize: metrics.detailFontSize },
});
