import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Icon, PressScale, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.appMotion;
const idle = horizonColors.appMotion.heartIdle;
const filled = horizonColors.supportScreens.heartFilled;

type Props = {
  saved: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  iconSize: number;
  style?: StyleProp<ViewStyle>;
};

export function HeartToggle({ saved, onPress, accessibilityLabel, iconSize, style }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [fill] = useState(() => new Animated.Value(saved ? 1 : 0));
  const [pop] = useState(() => new Animated.Value(1));
  const previous = useRef(saved);

  useEffect(() => {
    if (previous.current === saved) return;
    previous.current = saved;
    if (reduceMotion) {
      fill.setValue(saved ? 1 : 0);
      return;
    }
    const swap = Animated.timing(fill, { toValue: saved ? 1 : 0, duration: metrics.heartSwapDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const bounce = Animated.sequence([
      Animated.timing(pop, { toValue: saved ? metrics.heartPopScale : 1 / metrics.heartPopScale, duration: metrics.heartPopDuration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 1, duration: metrics.heartSettleDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]);
    const motion = Animated.parallel([swap, bounce]);
    motion.start();
    return () => {
      motion.stop();
      fill.setValue(saved ? 1 : 0);
      pop.setValue(1);
    };
  }, [saved, reduceMotion, fill, pop]);

  const outline = fill.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected: saved }} onPress={onPress} style={style}>
    <Animated.View style={{ transform: [{ scale: pop }] }}>
      <Animated.View style={{ opacity: outline }}>
        <Icon name="heart" size={iconSize} color={idle}/>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.filled, { opacity: fill }]}>
        <Icon name="heart" size={iconSize} color={filled} fill={filled}/>
      </Animated.View>
    </Animated.View>
  </PressScale>;
}

const styles = StyleSheet.create({
  filled: { position: 'absolute', top: 0, left: 0 },
});
