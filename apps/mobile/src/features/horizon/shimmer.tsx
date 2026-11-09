import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { DimensionValue, LayoutChangeEvent } from 'react-native';
import { KaelShimmerText } from './kael-shimmer-text';
import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.affectLab;
const colors = horizonColors.affectLab;

const SweepContext = createContext<Animated.Value | null>(null);

export function ShimmerGroup({ label, children }: { label: string; children: ReactNode }) {
  const { reduceMotion } = useGlassAccessibility();
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: metrics.sweepDuration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [sweep, reduceMotion]);
  return <SweepContext.Provider value={reduceMotion ? null : sweep}>
    <View accessible accessibilityLabel={label} aria-busy style={styles.group}>{children}</View>
  </SweepContext.Provider>;
}

type BoneProps = { width?: DimensionValue; height?: number; radius?: number; circle?: boolean };

function circleSide(width: DimensionValue, height: number): number {
  return typeof width === 'number' ? width : height;
}

export function Bone({ width = metrics.fullSize, height = metrics.skeletonLine, radius = metrics.skeletonRadius, circle = false }: BoneProps) {
  const sweep = useContext(SweepContext);
  const [size, setSize] = useState(0);
  const side = circleSide(width, height);
  return <View aria-hidden onLayout={(event: LayoutChangeEvent) => setSize(event.nativeEvent.layout.width)} style={[styles.bone, { width, height: circle ? side : height, borderRadius: circle ? metrics.pillRadius : radius }]}>
    {sweep && size > 0 && <Animated.View style={[styles.band, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-metrics.sweepWidth, size] }) }] }]}/>}
  </View>;
}

export function ShimmerText({ children }: { children: string }) {
  return <KaelShimmerText baseColor={colors.shimmerBase} highlightColor={colors.shimmerHighlight} style={styles.text}>{children}</KaelShimmerText>;
}

const styles = StyleSheet.create({
  group: { gap: metrics.skeletonGap },
  bone: { backgroundColor: colors.skeleton, overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, width: metrics.sweepWidth, backgroundColor: colors.sweep },
  text: { fontSize: metrics.shimmerSize },
});
