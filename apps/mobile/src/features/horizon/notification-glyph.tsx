import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { kaelExpressionImages } from './kael-assets';
import { glyphMotions } from './notification-look';
import type { NotificationLook } from './notification-look';

const metrics = horizonLayout.notificationGlyph;
const colors = horizonColors.notificationGlyph;
const arrive = Easing.bezier(0.23, 1, 0.32, 1);
const faceSize = metrics.size * metrics.face.zoom;

export function NotificationGlyph({ look }: { look: NotificationLook }) {
  const { reduceMotion } = useGlassAccessibility();
  const motion = glyphMotions[look.motion];
  const tone = colors[look.tone];
  const [x] = useState(() => new Animated.Value(motion.x ?? 0));
  const [y] = useState(() => new Animated.Value(motion.y ?? 0));
  const [turn] = useState(() => new Animated.Value(motion.turn ?? 0));
  const [grow] = useState(() => new Animated.Value(motion.scale ?? 1));
  const [appear] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => new Animated.Value(0));
  const [badge] = useState(() => new Animated.Value(0));

  useEffect(() => {
    appear.setValue(0);
    ring.setValue(0);
    if (reduceMotion) {
      x.setValue(0);
      y.setValue(0);
      turn.setValue(0);
      grow.setValue(1);
      badge.setValue(1);
      const fade = Animated.timing(appear, { toValue: 1, duration: metrics.reducedDuration, useNativeDriver: true });
      fade.start();
      return () => fade.stop();
    }
    x.setValue(motion.x ?? 0);
    y.setValue(motion.y ?? 0);
    turn.setValue(motion.turn ?? 0);
    grow.setValue(motion.scale ?? 1);
    badge.setValue(0);
    const settle = (value: Animated.Value, toValue: number) => Animated.spring(value, { toValue, ...metrics.springs[motion.spring], useNativeDriver: true });
    const run = Animated.parallel([
      settle(x, 0),
      settle(y, 0),
      settle(turn, 0),
      settle(grow, 1),
      Animated.timing(appear, { toValue: 1, duration: metrics.fade, easing: arrive, useNativeDriver: true }),
      Animated.sequence([Animated.delay(metrics.badge.delay), Animated.spring(badge, { toValue: 1, ...metrics.springs.lively, useNativeDriver: true })]),
      ...(motion.ring === undefined ? [] : [Animated.sequence([Animated.delay(motion.ring), Animated.timing(ring, { toValue: 1, duration: metrics.ring.duration, easing: arrive, useNativeDriver: true })])]),
    ]);
    const timer = setTimeout(() => run.start(), metrics.delay);
    return () => {
      clearTimeout(timer);
      run.stop();
    };
  }, [appear, badge, grow, motion, reduceMotion, ring, turn, x, y]);

  const Badge = look.badge;
  const transform = [
    { translateX: x },
    { translateY: y },
    { rotate: turn.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
    { scale: grow },
  ];

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.frame}>
      {motion.ring !== undefined && !reduceMotion && (
        <Animated.View
          style={[styles.ring, {
            borderColor: tone.ink,
            opacity: ring.interpolate({ inputRange: [0, metrics.ring.peakAt, 1], outputRange: [0, metrics.ring.peak, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.ring.scale] }) }],
          }]}
        />
      )}
      <View style={[styles.tile, { backgroundColor: tone.fill }]}>
        <Animated.View style={[styles.layer, { opacity: appear, transform }]}>
          <Image source={kaelExpressionImages[look.expression]} accessibilityIgnoresInvertColors style={styles.face} />
        </Animated.View>
      </View>
      {Badge !== undefined && (
        <Animated.View
          style={[styles.badge, {
            opacity: badge,
            transform: [{ scale: badge.interpolate({ inputRange: [0, 1], outputRange: [metrics.badge.scaleFrom, 1] }) }],
          }]}
        >
          <Badge size={metrics.badge.icon} color={tone.ink} strokeWidth={metrics.badge.stroke} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: metrics.size, height: metrics.size },
  tile: { width: metrics.size, height: metrics.size, borderRadius: metrics.radius, borderCurve: 'continuous', overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  face: {
    position: 'absolute',
    width: faceSize,
    height: faceSize,
    left: metrics.size * metrics.face.centre - metrics.face.anchorX * faceSize,
    top: metrics.size * metrics.face.centre - metrics.face.anchorY * faceSize,
  },
  ring: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: metrics.radius, borderCurve: 'continuous', borderWidth: metrics.ring.width },
  badge: {
    position: 'absolute',
    right: metrics.badge.offset,
    bottom: metrics.badge.offset,
    width: metrics.badge.size,
    height: metrics.badge.size,
    borderRadius: metrics.badge.radius,
    borderWidth: metrics.badge.border,
    borderColor: colors.badgeSurface,
    backgroundColor: colors.badgeSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
