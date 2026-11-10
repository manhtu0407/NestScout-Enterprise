import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { FadeIn } from './earnings-motion';

const metrics = horizonLayout.rating;
const colors = horizonColors.rating;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export const ratingWords: readonly string[] = ['Tệ', 'Chưa tốt', 'Ổn', 'Tốt', 'Tuyệt vời'];

export type RatingSize = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  allowHalf?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  showValue?: boolean;
  emptyLabel?: string;
  size?: RatingSize;
  max?: number;
};

function wordFor(value: number, max: number): string | null {
  if (value <= 0) return null;
  if (max !== ratingWords.length) return String(value);
  return ratingWords[Math.min(max, Math.max(1, Math.round(value))) - 1] ?? null;
}

export function Rating({ label, value, onChange, readOnly = false, allowHalf = false, allowClear = true, disabled = false, showValue = true, emptyLabel = 'Chưa đánh giá', size = 'md', max = 5 }: Props) {
  const interactive = !readOnly && !disabled && onChange !== undefined;
  const star = metrics.star[size];
  const stars = Array.from({ length: max }, (_, index) => index + 1);
  const word = wordFor(value, max);
  const text = readOnly && value > 0 ? value.toFixed(1) : word ?? emptyLabel;

  const choose = (next: number) => {
    if (!interactive) return;
    void Haptics.selectionAsync();
    onChange(allowClear && next === value ? 0 : next);
  };

  return (
    <View style={styles.row}>
      <View
        accessible={readOnly}
        accessibilityRole={readOnly ? 'image' : 'radiogroup'}
        accessibilityLabel={readOnly ? `${label}: ${value.toFixed(1)} trên ${max} sao` : label}
        style={styles.stars}
      >
        {stars.map(position => (
          <StarCell key={position} position={position} value={value} star={star} interactive={interactive} allowHalf={allowHalf} max={max} onChoose={choose} />
        ))}
      </View>
      {showValue ? (
        <FadeIn key={text} style={styles.word}>
          <Text style={[styles.wordText, value <= 0 && styles.wordEmpty]}>{text}</Text>
        </FadeIn>
      ) : null}
    </View>
  );
}

type CellProps = { position: number; value: number; star: number; interactive: boolean; allowHalf: boolean; max: number; onChoose: (next: number) => void };

function StarCell({ position, value, star, interactive, allowHalf, max, onChoose }: CellProps) {
  const { reduceMotion } = useGlassAccessibility();
  const fraction = Math.max(0, Math.min(1, value - (position - 1)));
  const [fill] = useState(() => new Animated.Value(fraction));
  const [press] = useState(() => new Animated.Value(1));
  const [pop] = useState(() => new Animated.Value(1));
  const previous = useRef(fraction);

  useEffect(() => {
    const rising = fraction > previous.current;
    previous.current = fraction;
    if (reduceMotion) {
      fill.setValue(fraction);
      return undefined;
    }
    const delay = rising ? (position - 1) * metrics.stagger : (max - position) * metrics.stagger;
    const sweep = Animated.timing(fill, { toValue: fraction, duration: metrics.sweepDuration, delay, easing: easeOut, useNativeDriver: false });
    sweep.start();
    if (rising && fraction === 1) {
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(pop, { toValue: metrics.popScale, duration: metrics.popDuration, easing: easeOut, useNativeDriver: true }),
        Animated.timing(pop, { toValue: 1, duration: metrics.popDuration, easing: easeOut, useNativeDriver: true }),
      ]).start();
    }
    return () => sweep.stop();
  }, [fraction, position, max, reduceMotion, fill, pop]);

  const pressTo = (toValue: number) => {
    if (reduceMotion) return;
    Animated.timing(press, { toValue, duration: metrics.pressDuration, easing: easeOut, useNativeDriver: true }).start();
  };

  const width = starFill(fill, star);

  const glyph = (
    <Animated.View style={{ width: star, height: star, transform: [{ scale: press }, { scale: pop }] }}>
      <Icon name="star" size={star} color={colors.empty} />
      <Animated.View pointerEvents="none" style={[styles.fillClip, { width, height: star }]}>
        <View style={{ width: star, height: star }}>
          <Icon name="star" size={star} color={colors.on} />
        </View>
      </Animated.View>
    </Animated.View>
  );

  if (!interactive) return <View style={[styles.cell, { width: star + metrics.gap, height: star + metrics.gap }]}>{glyph}</View>;

  return (
    <View style={[styles.cell, { width: interactiveCellWidth(star), height: Math.max(star + metrics.gap, metrics.touch) }]}>
      {glyph}
      {allowHalf ? (
        <View style={styles.halves}>
          <Pressable accessibilityRole="radio" accessibilityLabel={`${position - 0.5} sao`} accessibilityState={{ selected: value === position - 0.5 }} onPress={() => onChoose(position - 0.5)} onPressIn={() => pressTo(metrics.pressScale)} onPressOut={() => pressTo(1)} style={styles.half} />
          <Pressable accessibilityRole="radio" accessibilityLabel={`${position} sao`} accessibilityState={{ selected: value === position }} onPress={() => onChoose(position)} onPressIn={() => pressTo(metrics.pressScale)} onPressOut={() => pressTo(1)} style={styles.half} />
        </View>
      ) : (
        <Pressable accessibilityRole="radio" accessibilityLabel={`${position} sao`} accessibilityState={{ selected: value === position }} onPress={() => onChoose(position)} onPressIn={() => pressTo(metrics.pressScale)} onPressOut={() => pressTo(1)} style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

function starFill(progress: Animated.Value, star: number): Animated.AnimatedInterpolation<number> {
  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, star] });
}

function interactiveCellWidth(star: number): number {
  return star + metrics.gap * 2;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: metrics.wordGap },
  stars: { flexDirection: 'row', alignItems: 'center' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  fillClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  halves: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  half: { flex: 1 },
  word: { minWidth: metrics.wordMinWidth },
  wordText: { color: colors.word, fontSize: metrics.wordSize, fontWeight: horizonLayout.ratingStyle.wordTextFontWeight, fontVariant: ['tabular-nums'] },
  wordEmpty: { color: colors.wordEmpty, fontWeight: horizonLayout.ratingStyle.wordEmptyFontWeight },
});
