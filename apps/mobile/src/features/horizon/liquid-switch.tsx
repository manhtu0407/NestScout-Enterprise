import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const travel = metrics.switchWidth - metrics.switchThumb - metrics.switchInset * 2;
const reach = 1 + travel / metrics.switchThumb;

type Props = { value: boolean; onValueChange: (value: boolean) => void; accessibilityLabel: string };

export function LiquidSwitch({ value, onValueChange, accessibilityLabel }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [lead] = useState(() => new Animated.Value(value ? 1 : 0));
  const [trail] = useState(() => new Animated.Value(value ? 1 : 0));
  const [press] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const toValue = value ? 1 : 0;
    const animation = reduceMotion
      ? Animated.parallel([
        Animated.timing(lead, { toValue, duration: metrics.switchReducedDuration, useNativeDriver: true }),
        Animated.timing(trail, { toValue, duration: metrics.switchReducedDuration, useNativeDriver: true }),
      ])
      : Animated.parallel([
        Animated.spring(lead, { toValue, ...metrics.switchLeadSpring, useNativeDriver: true }),
        Animated.spring(trail, { toValue, ...metrics.switchTrailSpring, useNativeDriver: true }),
      ]);
    animation.start();
    return () => animation.stop();
  }, [lead, trail, reduceMotion, value]);

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    Animated.spring(press, { toValue: pressed ? 1 : 0, ...metrics.switchSpring, useNativeDriver: true }).start();
  };

  const translateX = Animated.multiply(Animated.add(lead, trail), travel / 2);
  const flow = Animated.subtract(lead, trail).interpolate({ inputRange: [-1, 0, 1], outputRange: [reach, 1, reach] });
  const squash = press.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.switchStretch] });
  const scaleX = Animated.multiply(flow, squash);
  const scaleY = press.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.switchSquash] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={metrics.switchHitSlop}
      onPress={() => { void Haptics.selectionAsync(); onValueChange(!value); }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <View style={styles.track}>
        <Animated.View pointerEvents="none" style={[styles.trackOn, { opacity: trail }]} />
        <Animated.View pointerEvents="none" style={[styles.thumb, { transform: [{ translateX }, { scaleX }, { scaleY }] }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: metrics.switchWidth, height: metrics.switchHeight, borderRadius: metrics.switchHeight, backgroundColor: colors.switchOff },
  trackOn: { ...StyleSheet.absoluteFill, borderRadius: metrics.switchHeight, backgroundColor: colors.switchOn },
  thumb: {
    position: 'absolute',
    top: metrics.switchInset,
    left: metrics.switchInset,
    width: metrics.switchThumb,
    height: metrics.switchThumb,
    borderRadius: metrics.switchThumb,
    backgroundColor: colors.switchThumb,
    boxShadow: colors.switchThumbShadow,
  },
});
