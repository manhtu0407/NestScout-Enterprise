import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';
import { matrixStops } from './kael-orb-stops';
import type { KaelPhase } from './kael-phase';

const metrics = horizonLayout.kaelMotion;
const colors = horizonColors.kaelMotion;
const half = 0.5;
const fullTurn = Math.PI * 2;

export type KaelOrbMode = 'thinking' | 'searching';

export function orbModeForPhase(phase: KaelPhase): KaelOrbMode {
  return phase === 'matching' ? 'searching' : 'thinking';
}

const dots = Array.from({ length: metrics.orbDots }, (_, index) => {
  const angle = (index / metrics.orbDots) * fullTurn - Math.PI * half;
  return {
    left: metrics.orbSize * half + Math.cos(angle) * metrics.orbRadius - metrics.orbDot * half,
    top: metrics.orbSize * half + Math.sin(angle) * metrics.orbRadius - metrics.orbDot * half,
    tail: metrics.orbTailFloor + (1 - metrics.orbTailFloor) * (index / (metrics.orbDots - 1)),
    stops: matrixStops(index / metrics.orbDots),
  };
});

function dotOpacity(dot: typeof dots[number], cycle: Animated.Value, mode: KaelOrbMode, still: boolean) {
  if (still) return metrics.orbRestOpacity;
  return mode === 'searching' ? dot.tail : cycle.interpolate(dot.stops);
}

type Props = { mode: KaelOrbMode; paused?: boolean; label?: string };

export function KaelThinkingOrb({ mode, paused = false, label }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const still = reduceMotion || paused;
  const [cycle] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (still) return undefined;
    cycle.setValue(0);
    const duration = mode === 'searching' ? metrics.orbSearchCycle : metrics.orbCycle;
    const loop = Animated.loop(Animated.timing(cycle, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [cycle, mode, still]);

  const motion = useMemo(() => (mode === 'searching'
    ? { transform: [{ rotate: cycle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }
    : { transform: [{ scale: cycle.interpolate({ inputRange: [0, half, 1], outputRange: [1, metrics.orbBreathe, 1] }) }] }), [cycle, mode]);

  return <View accessible={label !== undefined} accessibilityLabel={label} accessibilityRole={label === undefined ? undefined : 'progressbar'} style={styles.orb}>
    <Animated.View style={[styles.ring, !still && motion]}>
      {dots.map((dot, index) => {
        const place = { left: dot.left, top: dot.top, opacity: dotOpacity(dot, cycle, mode, still) };
        return <Animated.View key={index} style={[styles.dot, place]}/>;
      })}
    </Animated.View>
    <View style={[styles.core, still && styles.coreRest]}/>
  </View>;
}

const styles = StyleSheet.create({
  orb: { width: metrics.orbSize, height: metrics.orbSize, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: 0, left: 0, width: metrics.orbSize, height: metrics.orbSize },
  dot: { position: 'absolute', width: metrics.orbDot, height: metrics.orbDot, borderRadius: metrics.orbDotRadius, backgroundColor: colors.orbDot },
  core: { width: metrics.orbCoreSize, height: metrics.orbCoreSize, borderRadius: metrics.orbCoreRadius, backgroundColor: colors.orbCore },
  coreRest: { backgroundColor: colors.orbRest },
});
