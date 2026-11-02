import { createContext, useContext, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { DimensionValue, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.skeleton;
const colors = horizonColors.skeleton;

const SweepContext = createContext<Animated.Value | null>(null);

type SkeletonProps = { label: string; style?: StyleProp<ViewStyle>; children: ReactNode };

export function Skeleton({ label, style, children }: SkeletonProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: metrics.shimmerDuration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => { loop.stop(); sweep.setValue(0); };
  }, [reduceMotion, sweep]);
  return <SweepContext.Provider value={reduceMotion ? null : sweep}>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} aria-busy style={style}>{children}</View>
  </SweepContext.Provider>;
}

type BlockProps = { width: DimensionValue; height: number; radius: number; style?: StyleProp<ViewStyle> };

export function SkeletonBlock({ width, height, radius, style }: BlockProps) {
  const sweep = useContext(SweepContext);
  const key = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = `skeletonSweep${key}`;
  const [size, setSize] = useState(0);
  const sheen = size * metrics.shimmerWidthRatio;
  const handleLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout.width);
  return <View onLayout={handleLayout} style={[styles.block, { width, height, borderRadius: radius }, style]}>
    {sweep && size > 0 && <Animated.View pointerEvents="none" style={[styles.sweep, { width: sheen, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-sheen, size] }) }] }]}>
      <Svg width={sheen} height={height} viewBox={`0 0 ${sheen} ${height}`}>
        <Defs>
          <LinearGradient id={gradientId} x1={0} y1={0} x2={1} y2={0}>
            {colors.shimmer.map(stop => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity}/>)}
          </LinearGradient>
        </Defs>
        <Rect width={sheen} height={height} fill={`url(#${gradientId})`}/>
      </Svg>
    </Animated.View>}
  </View>;
}

type Stage = 'loading' | 'revealing' | 'done';

type RevealProps = { loading: boolean; skeleton: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> };

export function SkeletonReveal({ loading, skeleton, children, style }: RevealProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [stage, setStage] = useState<Stage>(loading ? 'loading' : 'done');
  const [seen, setSeen] = useState(loading);
  const [progress] = useState(() => new Animated.Value(loading ? 0 : 1));
  if (seen !== loading) {
    setSeen(loading);
    setStage(loading ? 'loading' : 'revealing');
  }

  useEffect(() => {
    if (stage === 'loading') {
      progress.setValue(0);
      return undefined;
    }
    if (stage === 'done') return undefined;
    const reveal = Animated.timing(progress, { toValue: 1, duration: reduceMotion ? 0 : metrics.revealDuration, easing: Easing.out(Easing.ease), useNativeDriver: true });
    reveal.start(({ finished }) => { if (finished) setStage('done'); });
    return () => reveal.stop();
  }, [stage, progress, reduceMotion]);

  const fadeIn = { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.revealScaleFrom, 1] }) }] };
  const fadeOut = { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) };
  const waiting = stage === 'loading';
  return <View style={style}>
    {stage !== 'done' && <Animated.View pointerEvents="none" style={[waiting ? null : styles.overlay, fadeOut]}>{skeleton}</Animated.View>}
    <Animated.View pointerEvents={waiting ? 'none' : 'auto'} accessibilityElementsHidden={waiting} importantForAccessibility={waiting ? 'no-hide-descendants' : 'auto'} style={[waiting && styles.hidden, fadeIn]}>
      {children}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  block: { overflow: 'hidden', backgroundColor: colors.base },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  overlay: { position: 'absolute', top: 0, right: 0, left: 0 },
  hidden: { position: 'absolute', top: 0, right: 0, left: 0 },
});
