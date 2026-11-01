import { Animated, Pressable, StyleSheet } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import type { GlassTone } from './glass-surface';
import type { ReactNode } from 'react';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility, usePressFeedback } from './glass-interaction';
import { GlassSurface } from './glass-surface';

const metrics = horizonLayout.glass;

type ControlProps = { label: string; onPress: () => void; children: ReactNode };

export function GlassIconButton({ label, hint, onPress, children, style }: ControlProps & { hint?: string; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Animated.View style={[style, { transform: [{ scale: feedback.scale }] }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut}>
      <GlassSurface variant="control" radius={metrics.controlRadius} interactive style={styles.icon}>{children}</GlassSurface>
    </Pressable>
  </Animated.View>;
}

export function GlassCapsuleButton({ label, onPress, radius, tone = 'neutral', children, style }: ControlProps & { radius: number; tone?: GlassTone; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut}>
      <GlassSurface variant="control" radius={radius} tone={tone} interactive style={style}>{children}</GlassSurface>
    </Pressable>
  </Animated.View>;
}

export function PressScale({ children, style, wrapperStyle, ...rest }: Omit<PressableProps, 'style'> & { children: ReactNode; style?: StyleProp<ViewStyle>; wrapperStyle?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Animated.View style={[wrapperStyle, { transform: [{ scale: feedback.scale }] }]}>
    <Pressable {...rest} style={style} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut}>{children}</Pressable>
  </Animated.View>;
}

export function GlassPill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <GlassSurface variant="control" radius={metrics.pillRadius} interactive style={[styles.pill, style]}>{children}</GlassSurface>;
}

export function GlassSegment({ label, onPress, expanded, children }: ControlProps & { expanded?: boolean }) {
  const { reduceMotion } = useGlassAccessibility();
  const feedback = usePressFeedback(reduceMotion);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={expanded === undefined ? undefined : { expanded }} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut} style={styles.segment}>
    <Animated.View pointerEvents="none" style={[styles.highlight, { opacity: feedback.press }]}/>
    <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>{children}</Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  icon: { width: metrics.controlSize, height: metrics.controlSize, alignItems: 'center', justifyContent: 'center' },
  pill: { height: metrics.controlSize, flexDirection: 'row', alignItems: 'center' },
  segment: { width: metrics.pillSegmentWidth, height: metrics.controlSize, alignItems: 'center', justifyContent: 'center' },
  highlight: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: metrics.segmentRadius, backgroundColor: horizonColors.liquid.pressHighlight },
});
