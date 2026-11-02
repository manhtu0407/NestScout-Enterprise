import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.appMotion;
const presenceEasing = Easing.bezier(0.23, 1, 0.32, 1);

export function useRetained<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  if (value !== null && value !== kept) setKept(value);
  return value ?? kept;
}

type Props = {
  visible: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  offset?: number;
  onExited?: () => void;
};

export function Presence({ visible, children, style, offset = -metrics.presenceOffset, onExited }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [mounted, setMounted] = useState(visible);
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  const exited = useRef(onExited);

  useEffect(() => {
    exited.current = onExited;
  }, [onExited]);

  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? metrics.presenceReducedDuration : visible ? metrics.presenceEnterDuration : metrics.presenceExitDuration,
      easing: presenceEasing,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished || visible) return;
      setMounted(false);
      exited.current?.();
    });
    return () => animation.stop();
  }, [visible, reduceMotion, progress]);

  if (!visible && !mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : offset, 0] });
  return <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
