import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.kaelMotion;

export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(word => word.length > 0);
}

export function streamTiming(wordCount: number): { gap: number; total: number } {
  if (wordCount <= 1) return { gap: 0, total: metrics.streamWordDuration };
  const gap = Math.min(metrics.streamWordGap, (metrics.streamMaxDuration - metrics.streamWordDuration) / (wordCount - 1));
  return { gap, total: (wordCount - 1) * gap + metrics.streamWordDuration };
}

type WordProps = { word: string; delay: number; style: StyleProp<TextStyle> };

function StreamingWord({ word, delay, style }: WordProps) {
  const [visible] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(visible, { toValue: 1, duration: metrics.streamWordDuration, delay, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [delay, visible]);
  return <Animated.View style={[styles.word, { opacity: visible }]}>
    <Text accessible={false} style={style}>{word}</Text>
  </Animated.View>;
}

type Props = { text: string; style?: StyleProp<TextStyle>; animate?: boolean };

export function KaelStreamingText({ text, style, animate = true }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const words = useMemo(() => splitWords(text), [text]);
  const [settled, setSettled] = useState(0);
  const pending = Math.max(0, words.length - settled);
  const timing = streamTiming(pending);
  const streaming = animate && !reduceMotion && words.length > 0;

  useEffect(() => {
    if (!streaming || pending === 0) return;
    const timer = setTimeout(() => setSettled(words.length), timing.total);
    return () => clearTimeout(timer);
  }, [streaming, pending, words.length, timing.total]);

  if (!streaming) return <Text style={style}>{text}</Text>;
  return <View accessible accessibilityLabel={text} style={styles.row}>
    {words.map((word, index) => <StreamingWord key={`${index}-${word}`} word={word} delay={Math.max(0, index - settled) * timing.gap} style={style}/>)}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1 },
  word: { marginRight: metrics.streamWordSpace },
});
