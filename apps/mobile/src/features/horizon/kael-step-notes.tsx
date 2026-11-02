import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.kaelMotion;
const colors = horizonColors.kaelMotion;

type Props = { lines: readonly string[] };

export function KaelStepNotes({ lines }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [enter] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    const animation = Animated.timing(enter, { toValue: 1, duration: metrics.noteEnterDuration, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [enter, reduceMotion]);

  return <Animated.View style={[styles.root, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [metrics.noteEnterOffset, 0] }) }] }]}>
    {lines.map((line, index) => <Text key={`${index}-${line}`} style={styles.line}>{line}</Text>)}
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.noteGap },
  line: { color: colors.noteText, fontSize: metrics.noteTextSize, lineHeight: metrics.noteLineHeight },
});
