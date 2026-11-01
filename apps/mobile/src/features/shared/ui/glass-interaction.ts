import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { horizonLayout } from '@/theme/layout';

const metrics = horizonLayout.glass;

type TransparencyAccessibility = typeof AccessibilityInfo & { isReduceTransparencyEnabled?: () => Promise<boolean> };

export function useGlassAccessibility() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    let live = true;
    const info: TransparencyAccessibility = AccessibilityInfo;
    info.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => undefined);
    info.isReduceTransparencyEnabled?.().then(value => { if (live) setReduceTransparency(value); }).catch(() => undefined);
    const motion = info.addEventListener('reduceMotionChanged', setReduceMotion);
    const transparency = info.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { live = false; motion.remove(); transparency.remove(); };
  }, []);
  return { reduceMotion, reduceTransparency };
}

export function usePressFeedback(reduceMotion: boolean) {
  const [press] = useState(() => new Animated.Value(0));
  useEffect(() => () => press.stopAnimation(), [press]);
  const move = (toValue: number) => {
    if (reduceMotion) { press.setValue(toValue); return; }
    Animated.spring(press, { toValue, ...metrics.pressSpring, useNativeDriver: true }).start();
  };
  const scale = reduceMotion ? 1 : press.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.pressScale] });
  return { press, scale, pressIn: () => move(1), pressOut: () => move(0) };
}
