import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { CompanionState, SignInRole } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;

const scaleFor: Record<CompanionState, number> = {
  idle: 1,
  typing: metrics.orbTyping,
  busy: 1,
  success: metrics.orbSuccess,
};

export function KaelCompanion({ state, role }: { state: CompanionState; role: SignInRole }) {
  const { reduceMotion } = useGlassAccessibility();
  const [float] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(1));
  const [badge] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: metrics.orbFloatDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: metrics.orbFloatDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [float, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    if (state === 'busy') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: metrics.orbBreath, duration: metrics.orbBusyDuration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: metrics.orbBusyDuration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
    const spring = Animated.spring(scale, { toValue: scaleFor[state], ...metrics.orbSpring, useNativeDriver: true });
    spring.start();
    return () => spring.stop();
  }, [reduceMotion, scale, state]);

  useEffect(() => {
    const target = state === 'success' ? 1 : 0;
    if (reduceMotion) {
      badge.setValue(target);
      return;
    }
    const spring = Animated.spring(badge, { toValue: target, ...metrics.successSpring, useNativeDriver: true });
    spring.start();
    return () => spring.stop();
  }, [badge, reduceMotion, state]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, metrics.orbFloat] });

  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.halo, { backgroundColor: colors.halo[role], transform: [{ scale }] }]} />
      <Animated.View style={{ transform: [{ translateY }, { scale }] }}>
        <Image source={require('../../../../assets/horizon/kael-login-auth-state.png')} style={{ width: metrics.heroImageWidth, height: metrics.heroImageHeight }} resizeMode="contain" accessibilityLabel="Kael đang hỗ trợ đăng nhập" />
      </Animated.View>
      <Animated.View style={[styles.badge, { backgroundColor: colors.success, opacity: badge, transform: [{ scale: badge }] }]}>
        <Icon name="check" size={metrics.successIconSize} color={colors.ctaLabel} strokeWidth={2.6} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: metrics.heroHeight, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: metrics.haloSize, height: metrics.haloSize, borderRadius: metrics.haloRadius },
  badge: { position: 'absolute', width: metrics.successSize, height: metrics.successSize, borderRadius: metrics.successRadius, alignItems: 'center', justifyContent: 'center', bottom: metrics.successBottom, right: metrics.successRight },
});
