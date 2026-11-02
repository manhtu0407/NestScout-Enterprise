import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.kaelMotion;
const colors = horizonColors.kaelMotion;

export function shimmerStops(index: number, count: number, span: number): [number, number, number] {
  const center = count <= 1 ? 0.5 : index / (count - 1);
  const total = 1 + span;
  return [center / total, (center + span / 2) / total, (center + span) / total];
}

type Props = { children: string; style?: StyleProp<TextStyle>; active?: boolean; baseColor?: string; highlightColor?: string };

export function KaelShimmerText({ children, style, active = true, baseColor = colors.shimmerBase, highlightColor = colors.shimmerHighlight }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [sweep] = useState(() => new Animated.Value(0));
  const moving = active && !reduceMotion;
  const characters = useMemo(() => Array.from(children.normalize('NFC')), [children]);

  useEffect(() => {
    if (!moving) return;
    sweep.setValue(0);
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: metrics.shimmerDuration, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [moving, sweep]);

  if (!moving) return <Text style={[style, { color: baseColor }]}>{children}</Text>;
  return <Text style={[style, { color: baseColor }]}>
    {characters.map((character, index) => <Animated.Text
      key={index}
      style={{ color: sweep.interpolate({ inputRange: [0, ...shimmerStops(index, characters.length, metrics.shimmerSpan), 1], outputRange: [baseColor, baseColor, highlightColor, baseColor, baseColor] }) }}
    >{character}</Animated.Text>)}
  </Text>;
}
