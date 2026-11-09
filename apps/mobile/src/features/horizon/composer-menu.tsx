import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon, type IconName, useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.composerMenu;
const glass = horizonLayout.glass;
const colors = horizonColors.composerMenu;
const step = metrics.bubbleSize + metrics.bubbleGap;
const leave = Easing.bezier(0.23, 1, 0.32, 1);

function ramp(value: Animated.Value, input: readonly number[], output: readonly (number | string)[]) {
  return value.interpolate({ inputRange: [...input], outputRange: [...output], extrapolate: 'clamp' });
}

export type ComposerMenuAnchor = { x: number; bottom: number };

export type ComposerMenuItem = { id: string; label: string; icon: IconName; detail?: string; disabled?: boolean; onPress: () => void };

type Props = { anchor: ComposerMenuAnchor; items: readonly ComposerMenuItem[]; onClose: () => void };

export function ComposerMenu({ anchor, items, onClose }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [pops] = useState(() => items.map(() => new Animated.Value(0)));
  const leaving = useRef(false);
  const alive = useRef(true);
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    alive.current = true;
    const entrance = reduceMotion
      ? Animated.parallel(pops.map(pop => Animated.timing(pop, { toValue: 1, duration: glass.reducedDuration, useNativeDriver: true })))
      : Animated.stagger(metrics.stagger, pops.map(pop => Animated.spring(pop, { toValue: 1, ...metrics.spring, useNativeDriver: true })));
    animation.current = entrance;
    entrance.start();
    return () => { alive.current = false; entrance.stop(); };
  }, [pops, reduceMotion]);

  const dismiss = (action?: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    animation.current?.stop();
    const exit = Animated.parallel(pops.map(pop => Animated.timing(pop, { toValue: 0, duration: reduceMotion ? glass.reducedDuration : metrics.exitDuration, easing: leave, useNativeDriver: true })));
    animation.current = exit;
    exit.start(({ finished }) => { if (finished && alive.current) { onClose(); action?.(); } });
  };

  const lead = pops[0];
  const spin = ramp(lead ?? pops[0] ?? new Animated.Value(0), [0, 1], ['0deg', metrics.closeRotation]);
  const origin = { left: anchor.x, bottom: anchor.bottom - metrics.anchorGap - horizonLayout.chatComposer.mediaSize, width: metrics.bubbleSize, height: metrics.bubbleSize };

  return <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss()}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu đính kèm" onPress={() => dismiss()} style={styles.scrim}/>
      <View pointerEvents="box-none" accessibilityRole="menu" accessibilityLabel="Menu đính kèm" style={[styles.stack, origin, styles.inset]}>
        {pops.map((pop, index) => {
          const reach = (index + metrics.slotOffset) * step;
          const thin = ramp(pop, metrics.neckThinInput, metrics.neckThin);
          const neck = { height: reach, opacity: thin, transform: [{ scaleY: pop }, { scaleX: thin }] };
          return <Animated.View key={`neck-${index}`} pointerEvents="none" style={[styles.neck, neck]}/>;
        })}
        {items.map((item, index) => {
          const pop = pops[index] ?? lead;
          if (!pop) return null;
          const rise = pop.interpolate({ inputRange: [0, 1], outputRange: [0, -(index + 1) * step] });
          const fade = ramp(pop, metrics.fadeInput, metrics.fadeOutput);
          const lift = { opacity: fade, transform: [{ translateY: rise }] };
          return <Animated.View key={item.id} style={[styles.item, lift]}>
            <Pressable accessibilityRole="menuitem" accessibilityLabel={item.label} accessibilityState={{ disabled: item.disabled === true }} disabled={item.disabled} onPress={() => dismiss(item.onPress)} style={[styles.row, item.disabled && styles.disabled]}>
              <View style={styles.bubble}>
                <Icon name={item.icon} size={metrics.iconSize} strokeWidth={metrics.iconStroke} color={colors.icon}/>
              </View>
              <View style={styles.label}>
                <Text numberOfLines={1} style={styles.labelText}>{item.label}</Text>
                {item.detail && <Text numberOfLines={1} style={styles.detail}>{item.detail}</Text>}
              </View>
            </Pressable>
          </Animated.View>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng menu" onPress={() => dismiss()} style={styles.bubble}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Icon name="plus" size={metrics.iconSize} strokeWidth={metrics.iconStroke} color={colors.icon}/>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  stack: { position: 'absolute' },
  inset: { marginBottom: -metrics.bubbleInset, marginLeft: -metrics.bubbleInset },
  neck: { position: 'absolute', bottom: metrics.neckBottom, left: metrics.neckLeft, width: metrics.neckWidth, borderRadius: metrics.neckRadius, backgroundColor: colors.fill, transformOrigin: 'bottom center' },
  item: { position: 'absolute', left: 0, bottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: metrics.labelGap },
  disabled: { opacity: metrics.disabledOpacity },
  bubble: { width: metrics.bubbleSize, height: metrics.bubbleSize, borderRadius: metrics.bubbleRadius, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  label: { minHeight: metrics.labelMinHeight, minWidth: metrics.labelMinWidth, flexShrink: 0, paddingHorizontal: metrics.labelPaddingHorizontal, borderRadius: metrics.labelRadius, backgroundColor: colors.labelSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.labelBorder, flexDirection: 'row', alignItems: 'center', gap: metrics.labelGap },
  labelText: { flexShrink: 0, color: horizonColors.text, fontSize: metrics.labelFontSize, fontWeight: metrics.labelFontWeight },
  detail: { flexShrink: 0, color: colors.detail, fontSize: metrics.detailFontSize },
});
