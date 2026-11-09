import { memo, useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { KaelShimmerText } from './kael-shimmer-text';
import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

const sparkle = 'M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z';

export function formatElapsed(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

type Spot = (typeof metrics.starSpots)[number];

function Star({ spot, index, still }: { spot: Spot; index: number; still: boolean }) {
  const [phase] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (still) return;
    const step = (toValue: number, duration: number) => Animated.timing(phase, { toValue, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const twinkle = Animated.loop(Animated.sequence([
      step(metrics.hair, metrics.starDuration * metrics.starPeak),
      step(metrics.starSettleScale, metrics.starDuration * (metrics.starSettle - metrics.starPeak)),
      step(0, metrics.starDuration * (metrics.hair - metrics.starSettle)),
    ]), { iterations: -1 });
    const run = Animated.sequence([Animated.delay(index * metrics.starStagger), twinkle]);
    run.start();
    return () => run.stop();
  }, [index, phase, still]);
  const opacity = still ? metrics.starStill : phase.interpolate({ inputRange: [0, metrics.starSettleScale, metrics.hair], outputRange: [0, metrics.starSettleOpacity, metrics.hair] });
  const scale = still ? metrics.hair : phase;
  const left = metrics.starCluster * spot.x - spot.size * metrics.starCenter;
  const top = metrics.starCluster * spot.y - spot.size * metrics.starCenter;
  return <Animated.View style={{ position: 'absolute', left, top, width: spot.size, height: spot.size, opacity, transform: [{ scale }] }}>
    <Svg width={spot.size} height={spot.size} viewBox="0 0 24 24"><Path d={sparkle} fill={colors.faint}/></Svg>
  </Animated.View>;
}

const Elapsed = memo(function Elapsed() {
  const [milliseconds, setMilliseconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setMilliseconds(Date.now() - started), metrics.timerTick);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.timer}>{formatElapsed(milliseconds)}</Text>;
});

type StarsProps = { paused?: boolean };

export function ThinkingStars({ paused = false }: StarsProps) {
  const { reduceMotion } = useGlassAccessibility();
  return <View style={styles.stars}>{metrics.starSpots.map((spot, index) => <Star key={index} spot={spot} index={index} still={reduceMotion || paused}/>)}</View>;
}

type Props = { label?: string; showTimer?: boolean };

export function AgentThinking({ label = 'Kael đang nghĩ', showTimer = true }: Props) {
  return <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite" aria-busy style={styles.root}>
    <ThinkingStars/>
    <KaelShimmerText baseColor={colors.faint} highlightColor={colors.text} style={styles.label}>{label}</KaelShimmerText>
    {showTimer && <Elapsed/>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: metrics.thinkingGap, paddingHorizontal: metrics.thinkingPad },
  stars: { width: metrics.starCluster, height: metrics.starCluster },
  label: { fontSize: metrics.thinkingLabel, fontWeight: metrics.titleWeight },
  timer: { color: colors.faint, fontSize: metrics.captionSize, fontFamily: Platform.select({ ios: metrics.iosMonoFont, default: metrics.monoFont }), fontVariant: ['tabular-nums'] },
});
