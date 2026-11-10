import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';

const metrics = horizonLayout.workerEarnings;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

type FadeInProps = { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number };

export function FadeIn({ children, style, delay = 0 }: FadeInProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const motion = Animated.timing(progress, { toValue: 1, duration: metrics.fadeDuration, delay, easing: easeOut, useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [delay, progress, reduceMotion]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.fadeOffset, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

type GrowProps = { children?: ReactNode; style?: StyleProp<ViewStyle>; index: number };

export function GrowUp({ children, style, index }: GrowProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const motion = Animated.timing(progress, { toValue: 1, duration: metrics.growDuration, delay: index * metrics.growStagger, easing: easeOut, useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [index, progress, reduceMotion]);
  return <Animated.View style={[style, { transform: [{ scaleY: progress }], transformOrigin: 'bottom center' }]}>{children}</Animated.View>;
}
