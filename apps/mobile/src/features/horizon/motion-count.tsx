import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { useGlassAccessibility } from '@/features/shared';
import { useRetained } from './motion-presence';

const metrics = horizonLayout.appMotion;

type RollingProps = { value: number; style?: StyleProp<TextStyle> };

export function RollingNumber({ value, style }: RollingProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [exit] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(1));
  const shownRef = useRef(value);

  useEffect(() => {
    if (value === shownRef.current) return;
    const previous = shownRef.current;
    shownRef.current = value;
    setShown(value);
    if (reduceMotion) return;
    setLeaving(previous);
    exit.setValue(0);
    enter.setValue(0);
    const roll = Animated.parallel([
      Animated.timing(exit, { toValue: 1, duration: metrics.rollDuration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(metrics.rollGap),
        Animated.timing(enter, { toValue: 1, duration: metrics.rollDuration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    ]);
    roll.start(({ finished }) => { if (finished) setLeaving(null); });
    return () => {
      roll.stop();
      enter.setValue(1);
      setLeaving(null);
    };
  }, [value, reduceMotion, exit, enter]);

  const sign = leaving !== null && leaving > shown ? -1 : 1;
  const incomingFrom = sign * metrics.rollDistance;
  const outgoingTo = -incomingFrom;
  const incoming = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [incomingFrom, 0] }) }] };
  const outgoing = { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: exit.interpolate({ inputRange: [0, 1], outputRange: [0, outgoingTo] }) }] };

  return <Animated.View>
    <Animated.Text style={[style, incoming]}>{shown}</Animated.Text>
    {leaving !== null && <Animated.Text pointerEvents="none" style={[style, styles.leaving, outgoing]}>{leaving}</Animated.Text>}
  </Animated.View>;
}

type BadgeProps = { count: number; visible?: boolean; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle> };

export function PopBadge({ count, visible = true, style, textStyle }: BadgeProps) {
  const { reduceMotion } = useGlassAccessibility();
  const shown = visible && count > 0;
  const kept = useRetained(shown ? count : null);
  const [mounted, setMounted] = useState(shown);
  const [pop] = useState(() => new Animated.Value(shown ? 1 : 0));
  const [bump] = useState(() => new Animated.Value(1));
  const lastCount = useRef(count);

  if (shown && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(pop, {
      toValue: shown ? 1 : 0,
      duration: reduceMotion ? metrics.presenceReducedDuration : shown ? metrics.badgePopDuration : metrics.presenceExitDuration,
      easing: shown ? Easing.out(Easing.back(2)) : Easing.in(Easing.ease),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !shown) setMounted(false); });
    return () => animation.stop();
  }, [shown, reduceMotion, pop]);

  useEffect(() => {
    const previous = lastCount.current;
    lastCount.current = count;
    if (reduceMotion || !shown || previous <= 0 || previous === count) return;
    bump.setValue(1);
    const pulse = Animated.sequence([
      Animated.timing(bump, { toValue: metrics.badgeBumpScale, duration: metrics.badgeBumpDuration, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(bump, { toValue: 1, duration: metrics.badgeBumpDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]);
    pulse.start();
    return () => {
      pulse.stop();
      bump.setValue(1);
    };
  }, [count, shown, reduceMotion, bump]);

  if (!shown && !mounted) return null;
  const grow = pop.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 1 : metrics.badgePopFrom, 1] });
  return <Animated.View style={[style, { opacity: pop, transform: [{ scale: grow }, { scale: bump }] }]}>
    <RollingNumber value={kept ?? count} style={textStyle}/>
  </Animated.View>;
}

const styles = StyleSheet.create({
  leaving: { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center' },
});
