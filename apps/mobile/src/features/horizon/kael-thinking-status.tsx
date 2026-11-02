import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';
import { KaelShimmerText } from './kael-shimmer-text';

const metrics = horizonLayout.kaelMotion;
const colors = horizonColors.kaelMotion;

type Props = { label: string; active?: boolean };

export function KaelThinkingStatus({ label, active = true }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [shown, setShown] = useState(label);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [exit] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(1));
  const shownRef = useRef(label);

  useEffect(() => {
    if (label === shownRef.current) return;
    const outgoing = shownRef.current;
    shownRef.current = label;
    setShown(label);
    if (reduceMotion) return;
    setLeaving(outgoing);
    exit.setValue(0);
    enter.setValue(0);
    const swap = Animated.parallel([
      Animated.timing(exit, { toValue: 1, duration: metrics.swapDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(metrics.swapGap),
        Animated.timing(enter, { toValue: 1, duration: metrics.swapDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ]);
    swap.start(({ finished }) => { if (finished) setLeaving(null); });
    return () => {
      swap.stop();
      enter.setValue(1);
      setLeaving(null);
    };
  }, [label, reduceMotion, exit, enter]);

  const incoming = { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [metrics.swapDistance, 0] }) }] };
  const outgoing = { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: exit.interpolate({ inputRange: [0, 1], outputRange: [0, -metrics.swapDistance] }) }] };

  return <View accessibilityRole="text" accessibilityLabel={shown} accessibilityLiveRegion="polite" style={styles.root}>
    <Animated.View style={incoming}>
      <KaelShimmerText active={active} style={styles.text}>{shown}</KaelShimmerText>
    </Animated.View>
    {leaving !== null && <Animated.View pointerEvents="none" style={[styles.leaving, outgoing]}>
      <Text style={[styles.text, { color: colors.shimmerBase }]}>{leaving}</Text>
    </Animated.View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  leaving: { position: 'absolute', top: 0, left: 0, right: 0 },
  text: { fontSize: metrics.statusSize, lineHeight: metrics.statusLineHeight, fontWeight: metrics.statusWeight },
});
