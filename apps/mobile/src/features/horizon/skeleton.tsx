import { createContext, useContext, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { DimensionValue, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from './glass-interaction';

const metrics = horizonLayout.skeleton;
const colors = horizonColors.skeleton;

const SweepContext = createContext<Animated.Value | null>(null);

type SkeletonProps = { label: string; style?: StyleProp<ViewStyle>; children: ReactNode };

export function Skeleton({ label, style, children }: SkeletonProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: metrics.shimmerDuration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
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

const styles = StyleSheet.create({
  block: { overflow: 'hidden', backgroundColor: colors.base },
  sweep: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
