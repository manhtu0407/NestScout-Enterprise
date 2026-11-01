import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { signInRoles, type SignInRole } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;

export function AuroraBackdrop({ role }: { role: SignInRole }) {
  const { reduceMotion } = useGlassAccessibility();
  const [drift] = useState(() => new Animated.Value(0));
  const [crossfade] = useState(() => new Animated.Value(role === 'worker' ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: metrics.auroraDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: metrics.auroraDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift, reduceMotion]);

  useEffect(() => {
    const target = role === 'worker' ? 1 : 0;
    if (reduceMotion) {
      crossfade.setValue(target);
      return;
    }
    const fade = Animated.timing(crossfade, { toValue: target, duration: metrics.auroraCrossfade, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [crossfade, reduceMotion, role]);

  const layerOpacity = { client: crossfade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), worker: crossfade };

  return (
    <View pointerEvents="none" style={styles.fill}>
      {signInRoles.map((layer) => {
        return (
          <Animated.View key={layer} style={[styles.fill, { opacity: layerOpacity[layer] }]}>
            {metrics.auroraPlacements.map((placement, index) => {
              const direction = index % 2 === 0 ? [-metrics.auroraDrift, metrics.auroraDrift] : [metrics.auroraDrift, -metrics.auroraDrift];
              const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: direction });
              const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [direction[1] ?? 0, direction[0] ?? 0] });
              return (
                <Animated.View key={index} style={[styles.blob, placement, { transform: [{ translateX }, { translateY }] }]}>
                  <Svg width={metrics.auroraSize} height={metrics.auroraSize}>
                    <Defs>
                      <RadialGradient id={`${layer}-${index}`} cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={colors.aurora[layer][index]} stopOpacity={metrics.auroraCenterOpacity} />
                        <Stop offset="100%" stopColor={colors.aurora[layer][index]} stopOpacity={0} />
                      </RadialGradient>
                    </Defs>
                    <Circle cx="50%" cy="50%" r="50%" fill={`url(#${layer}-${index})`} />
                  </Svg>
                </Animated.View>
              );
            })}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' },
  blob: { position: 'absolute', width: metrics.auroraSize, height: metrics.auroraSize },
});
