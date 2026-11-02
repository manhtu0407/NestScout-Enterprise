import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.kaelMotion;
const colors = horizonColors.kaelMotion;
const bounce = Easing.bezier(0.34, 1.36, 0.64, 1);
const checkViewBox = 24;
const checkPath = 'M8 12.5L10.8 15.5L16.4 9.5';

type PopInProps = { enabled: boolean; index: number; style: StyleProp<ViewStyle>; children?: ReactNode };

export function KaelPopIn({ enabled, index, style, children }: PopInProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [pop] = useState(() => new Animated.Value(enabled && !reduceMotion ? 0 : 1));

  useEffect(() => {
    if (!enabled || reduceMotion) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    const animation = Animated.timing(pop, { toValue: 1, duration: metrics.markerPopDuration, delay: index * metrics.markerPopStagger, easing: bounce, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [enabled, index, pop, reduceMotion]);

  return <Animated.View style={[style, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [metrics.markerPopFrom, 1] }) }] }]}>{children}</Animated.View>;
}

type SpinnerProps = { done: boolean; label: string };

export function KaelSpinnerCheck({ done, label }: SpinnerProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [spin] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(done ? 1 : 0));
  const [draw] = useState(() => new Animated.Value(done ? 1 : 0));
  const radius = (metrics.spinnerSize - metrics.spinnerStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = metrics.spinnerSize / 2;

  useEffect(() => {
    if (done || reduceMotion) return;
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: metrics.spinnerSpinDuration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [done, reduceMotion, spin]);

  useEffect(() => {
    if (!done || reduceMotion) {
      pop.setValue(done ? 1 : 0);
      draw.setValue(done ? 1 : 0);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(pop, { toValue: 1, duration: metrics.spinnerCheckDuration, easing: bounce, useNativeDriver: true }),
      Animated.timing(draw, { toValue: 1, duration: metrics.spinnerCheckDuration, delay: metrics.spinnerCheckDelay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [done, draw, pop, reduceMotion]);

  return <View accessible accessibilityRole="image" accessibilityLabel={label} style={styles.spinner}>
    <Animated.View style={[styles.fill, { opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
      <Svg width={metrics.spinnerSize} height={metrics.spinnerSize}>
        <Circle cx={center} cy={center} r={radius} stroke={colors.spinnerTrack} strokeWidth={metrics.spinnerStroke} fill="none"/>
        <Circle cx={center} cy={center} r={radius} stroke={colors.spinnerArc} strokeWidth={metrics.spinnerStroke} strokeLinecap="round" strokeDasharray={[circumference * metrics.spinnerArc, circumference]} fill="none"/>
      </Svg>
    </Animated.View>
    <Animated.View style={[styles.fill, styles.disc, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [metrics.markerPopFrom, 1] }) }] }]}>
      <Svg width={metrics.spinnerSize} height={metrics.spinnerSize} viewBox={`0 0 ${checkViewBox} ${checkViewBox}`}>
        <Path d={checkPath} stroke={colors.spinnerCheck} strokeWidth={metrics.spinnerCheckStroke} strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </Svg>
      <Animated.View style={[styles.cover, { transform: [{ translateX: draw.interpolate({ inputRange: [0, 1], outputRange: [0, metrics.spinnerSize] }) }] }]}/>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  spinner: { width: metrics.spinnerSize, height: metrics.spinnerSize },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, width: metrics.spinnerSize, backgroundColor: colors.spinnerDone },
  disc: { overflow: 'hidden', borderRadius: metrics.spinnerRadius, backgroundColor: colors.spinnerDone, alignItems: 'center', justifyContent: 'center' },
});
