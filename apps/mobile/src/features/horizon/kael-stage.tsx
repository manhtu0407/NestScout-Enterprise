import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { kaelExpressionImages, kaelPlushImage } from './kael-assets';
import { landingTransform, reactionTransform } from './kael-motion';
import type { KaelExpression } from './kael-phase';

const metrics = horizonLayout.kaelCompanion;
const expressions = Object.keys(kaelExpressionImages) as KaelExpression[];

type Props = {
  progress: Animated.Value;
  landing: Animated.Value;
  reaction: Animated.Value;
  expression: KaelExpression | null;
  nod: boolean;
  seatTop: number | null;
  navHeight: number;
};

export function KaelStage({ progress, landing, reaction, expression, nod, seatTop, navHeight }: Props) {
  const introWidth = metrics.introKaelWidth;
  const introHeight = introWidth * metrics.plushAspectRatio;
  const introLeft = metrics.introKaelLeft;
  const introTop = navHeight + metrics.introKaelTop;
  const companionWidth = metrics.companionWidth;
  const companionHeight = companionWidth * metrics.plushAspectRatio;
  const seated = seatTop !== null;
  const companionLeft = metrics.companionLeft;
  const companionTop = seated ? seatTop + metrics.companionSeatOverlap - companionHeight : introTop;
  const scale = seated ? companionWidth / introWidth : 1;
  const travelX = seated ? (companionLeft + companionWidth / 2) - (introLeft + introWidth / 2) : 0;
  const travelY = seated ? (companionTop + companionHeight / 2) - (introTop + introHeight / 2) : 0;

  const [layerOpacity] = useState(() => Object.fromEntries(['plush', ...expressions].map(key => [key, new Animated.Value(key === 'plush' ? 1 : 0)])) as Record<string, Animated.Value>);

  useEffect(() => {
    const target = expression ?? 'plush';
    const animations = Object.entries(layerOpacity).map(([key, value]) => Animated.timing(value, { toValue: key === target ? 1 : 0, duration: metrics.expressionFadeDuration, useNativeDriver: true }));
    Animated.parallel(animations).start();
    return () => { for (const animation of animations) animation.stop(); };
  }, [expression, layerOpacity]);

  const figure = { width: introWidth, height: introHeight };
  const pivotDistance = metrics.pivotOffsetRatio * introHeight;

  return <>
    <Animated.View pointerEvents="none" style={[styles.figure, { left: introLeft, top: introTop, width: introWidth, height: introHeight, transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travelX] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travelY] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) },
    ] }]}>
      <Animated.View style={[styles.fill, { transform: [...landingTransform(landing, pivotDistance), ...reactionTransform(reaction, nod)] }]}>
        <Animated.Image source={kaelPlushImage} accessibilityIgnoresInvertColors style={[styles.fill, figure, { opacity: layerOpacity.plush }]} resizeMode="contain"/>
        {expressions.map(key => <Animated.Image key={key} source={kaelExpressionImages[key]} accessibilityIgnoresInvertColors style={[styles.fill, figure, { opacity: layerOpacity[key] }]} resizeMode="contain"/>)}
      </Animated.View>
    </Animated.View>
  </>;
}

const styles = StyleSheet.create({
  figure: { position: 'absolute' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
