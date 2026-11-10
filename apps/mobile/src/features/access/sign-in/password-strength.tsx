import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { passwordRules, scorePassword, type PasswordLevel } from '../auth/password-strength';

const metrics = horizonLayout.passwordStrength;
const colors = horizonColors.passwordStrength;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);
const segments: readonly PasswordLevel[] = [1, 2, 3, 4];

type Props = { password: string; onSuggest: () => void; disabled?: boolean };

export function PasswordStrength({ password, onSuggest, disabled = false }: Props) {
  const result = scorePassword(password);
  const tone = result.level === 0 ? colors.word : colors.levels[result.level - 1] ?? colors.word;
  return (
    <View style={styles.root}>
      <View accessible accessibilityRole="progressbar" accessibilityLabel="Độ mạnh mật khẩu" accessibilityValue={{ min: 0, max: 4, now: result.level, text: result.label }} style={styles.meter}>
        {segments.map(step => (
          <Segment key={step} active={result.level >= step} color={colors.levels[step - 1] ?? colors.word} delay={(step - 1) * metrics.stagger} />
        ))}
      </View>
      <View style={styles.head}>
        <Word text={result.label} color={tone} />
        <Pressable accessibilityRole="button" accessibilityLabel="Gợi ý mật khẩu mạnh" disabled={disabled} hitSlop={8} onPress={onSuggest}>
          <Text style={[styles.suggest, disabled && styles.disabled]}>Gợi ý mật khẩu</Text>
        </Pressable>
      </View>
      <View accessibilityRole="list" style={styles.rules}>
        {passwordRules.map(rule => (
          <Rule key={rule.id} label={rule.label} met={result.met.includes(rule.id)} />
        ))}
      </View>
    </View>
  );
}

function Segment({ active, color, delay }: { active: boolean; color: string; delay: number }) {
  const { reduceMotion } = useGlassAccessibility();
  const [fill] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      fill.setValue(active ? 1 : 0);
      return undefined;
    }
    const motion = Animated.timing(fill, { toValue: active ? 1 : 0, duration: metrics.fillDuration, delay: active ? delay : 0, easing: easeOut, useNativeDriver: false });
    motion.start();
    return () => motion.stop();
  }, [active, delay, fill, reduceMotion]);
  const width = fillWidth(fill);
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, { width, backgroundColor: color }]} />
    </View>
  );
}

function Word({ text, color }: { text: string; color: string }) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const motion = Animated.timing(progress, { toValue: 1, duration: metrics.wordDuration, easing: easeOut, useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [text, progress, reduceMotion]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.wordOffset, 0] });
  return <Animated.Text accessibilityLiveRegion="polite" style={[styles.word, { color, opacity: progress, transform: [{ translateY }] }]}>{text}</Animated.Text>;
}

function Rule({ label, met }: { label: string; met: boolean }) {
  const { reduceMotion } = useGlassAccessibility();
  const [state] = useState(() => new Animated.Value(met ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      state.setValue(met ? 1 : 0);
      return undefined;
    }
    const motion = Animated.timing(state, { toValue: met ? 1 : 0, duration: metrics.ruleDuration, easing: easeOut, useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [met, state, reduceMotion]);
  const scale = state.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  return (
    <View accessible accessibilityLabel={`${label}, ${met ? 'đã đạt' : 'chưa đạt'}`} style={styles.rule}>
      <View style={[styles.dot, met && styles.dotOn]}>
        <Animated.View style={{ opacity: state, transform: [{ scale }] }}>
          <Icon name="check" size={metrics.ruleIcon} color={colors.checkIcon} strokeWidth={2.6} />
        </Animated.View>
      </View>
      <Text style={[styles.ruleText, met && styles.ruleTextOn]}>{label}</Text>
    </View>
  );
}

function half(size: number): number {
  return size / 2;
}

function fillWidth(progress: Animated.Value): Animated.AnimatedInterpolation<string> {
  return progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
}

const styles = StyleSheet.create({
  root: { gap: metrics.gap },
  meter: { flexDirection: 'row', gap: metrics.segmentGap },
  segment: { flex: 1, height: metrics.segmentHeight, borderRadius: half(metrics.segmentHeight), overflow: 'hidden', backgroundColor: colors.track },
  segmentFill: { height: horizonLayout.passwordStrengthStyle.segmentFillHeight, borderRadius: half(metrics.segmentHeight) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  word: { fontSize: metrics.wordSize, fontWeight: horizonLayout.passwordStrengthStyle.wordFontWeight },
  suggest: { color: colors.action, fontSize: metrics.wordSize, fontWeight: horizonLayout.passwordStrengthStyle.suggestFontWeight },
  disabled: { opacity: horizonLayout.passwordStrengthStyle.disabledOpacity },
  rules: { gap: metrics.ruleGap },
  rule: { flexDirection: 'row', alignItems: 'center', gap: metrics.ruleInset },
  dot: { width: metrics.ruleDot, height: metrics.ruleDot, borderRadius: half(metrics.ruleDot), alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ruleOff },
  dotOn: { backgroundColor: colors.ruleOn },
  ruleText: { color: colors.ruleText, fontSize: metrics.ruleSize },
  ruleTextOn: { color: colors.ruleTextOn },
});
