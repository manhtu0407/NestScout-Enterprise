import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.glass;
const colors = horizonColors.liquid;

type Props = { width: number; height: number; radius: number };

export function GlassSheen({ width, height, radius }: Props) {
  const key = useId().replace(/[^a-zA-Z0-9]/g, '');
  const frostId = `glassFrost${key}`;
  const rimId = `glassRim${key}`;
  const inset = metrics.rimWidth / 2;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient id={frostId} cx={metrics.sheen.frostX} cy={metrics.sheen.frostY} r={metrics.sheen.frostRadius}>
          {colors.frost.map(stop => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity}/>)}
        </RadialGradient>
        <LinearGradient id={rimId} x1={0} y1={0} x2={1} y2={1}>
          {colors.rim.map(stop => <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity}/>)}
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} rx={radius} fill={`url(#${frostId})`}/>
      <Rect x={inset} y={inset} width={width - metrics.rimWidth} height={height - metrics.rimWidth} rx={Math.max(0, radius - inset)} fill="none" stroke={`url(#${rimId})`} strokeWidth={metrics.rimWidth}/>
    </Svg>
  </View>;
}
