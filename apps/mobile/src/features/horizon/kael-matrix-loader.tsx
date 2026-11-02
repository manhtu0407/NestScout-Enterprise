import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.kaelMotion;
const colors = horizonColors.kaelMotion;

export type KaelMatrixVariant = 'scan' | 'twinkle' | 'orbit' | 'pulse';

const ring = [1, 2, 7, 11, 14, 13, 8, 4] as const;
const inner = [5, 6, 9, 10] as const;
const twinkle = [7, 2, 11, 5, 14, 9, 0, 12, 3, 15, 6, 10, 13, 1, 8, 4] as const;
const pulseKeys: readonly (readonly [number, number])[] = [[0, 0], [0.15, 1], [0.45, 0], [1, 0]];
const cellCount = metrics.matrixSize * metrics.matrixSize;

export function matrixDelay(variant: KaelMatrixVariant, index: number): number | null {
  if (variant === 'scan') return (index % metrics.matrixSize) / 10;
  if (variant === 'twinkle') return (twinkle[index] ?? 0) / cellCount;
  if (variant === 'orbit') {
    const position = ring.indexOf(index as typeof ring[number]);
    return position === -1 ? null : position / ring.length;
  }
  return inner.includes(index as typeof inner[number]) ? 0 : 0.16;
}

function pulseAt(local: number): number {
  const index = pulseKeys.findIndex(([end]) => local <= end);
  const next = pulseKeys[index];
  const previous = pulseKeys[index - 1];
  if (!next || !previous) return 0;
  return previous[1] + (next[1] - previous[1]) * ((local - previous[0]) / (next[0] - previous[0]));
}

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}

export function matrixStops(delay: number): { inputRange: number[]; outputRange: number[] } {
  const stops = new Map<number, number>();
  for (const [at, value] of pulseKeys.slice(0, -1)) stops.set(wrap(delay + at), value);
  const edge = pulseAt(wrap(-delay));
  if (!stops.has(0)) stops.set(0, edge);
  stops.set(1, edge);
  const ordered = [...stops.entries()].sort(([a], [b]) => a - b);
  return { inputRange: ordered.map(([position]) => position), outputRange: ordered.map(([, value]) => value) };
}

type Props = { variant?: KaelMatrixVariant; label?: string; paused?: boolean };

export function KaelMatrixLoader({ variant = 'scan', label, paused = false }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const still = reduceMotion || paused;
  const [cycle] = useState(() => new Animated.Value(0));
  const cells = useMemo(() => Array.from({ length: cellCount }, (_, index) => {
    const delay = matrixDelay(variant, index);
    return delay === null ? null : matrixStops(delay);
  }), [variant]);

  useEffect(() => {
    if (still) return;
    cycle.setValue(0);
    const loop = Animated.loop(Animated.timing(cycle, { toValue: 1, duration: metrics.matrixCycle, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [cycle, still]);

  return <View accessible={label !== undefined} accessibilityLabel={label} accessibilityRole={label === undefined ? undefined : 'progressbar'} style={styles.grid}>
    {cells.map((stops, index) => <View key={index} style={styles.dot}>
      {stops && !still && <Animated.View style={[styles.active, { opacity: cycle.interpolate(stops) }]}/>}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  grid: { width: metrics.matrixSide, height: metrics.matrixSide, flexDirection: 'row', flexWrap: 'wrap', gap: metrics.matrixGap },
  dot: { width: metrics.matrixDot, height: metrics.matrixDot, backgroundColor: colors.matrixBase },
  active: { flex: 1, backgroundColor: colors.matrixActive },
});
