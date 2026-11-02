import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const travel = metrics.switchWidth - metrics.switchThumb - metrics.switchInset * 2;

type Props = { value: boolean; onValueChange: (value: boolean) => void; accessibilityLabel: string };

export function IosSwitch({ value, onValueChange, accessibilityLabel }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));
  const [press] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = reduceMotion
      ? Animated.timing(progress, { toValue: value ? 1 : 0, duration: metrics.switchReducedDuration, useNativeDriver: true })
      : Animated.spring(progress, { toValue: value ? 1 : 0, ...metrics.switchSpring, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, value]);

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    Animated.spring(press, { toValue: pressed ? 1 : 0, ...metrics.switchSpring, useNativeDriver: true }).start();
  };

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] });
  const stretch = press.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.switchStretch] });

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
        <Animated.View pointerEvents="none" style={[styles.trackOn, { opacity: progress }]} />
        <Animated.View pointerEvents="none" style={[styles.thumb, { transform: [{ translateX }, { scaleX: stretch }] }]} />
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
