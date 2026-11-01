import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { signInCopy } from '../auth/auth-messages';
import type { SignInRole } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;
const webHidden = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0, cursor: 'text' } as const, default: undefined });

type Props = {
  code: string;
  length: number;
  onChange: (code: string) => void;
  role: SignInRole;
  invalid: boolean;
  disabled: boolean;
  shakeKey: number;
};

function Caret({ role }: { role: SignInRole }) {
  const { reduceMotion } = useGlassAccessibility();
  const [blink] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: metrics.otpCaretBlink, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: metrics.otpCaretBlink, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, reduceMotion]);
  return <Animated.View style={[styles.caret, { backgroundColor: colors.accent[role], opacity: blink }]} />;
}

function Cell({ digit, active, role, invalid }: { digit: string; active: boolean; role: SignInRole; invalid: boolean }) {
  const { reduceMotion } = useGlassAccessibility();
  const [pop] = useState(() => new Animated.Value(1));
  const previous = useRef(digit);
  useEffect(() => {
    const arrived = previous.current === '' && digit !== '';
    previous.current = digit;
    if (!arrived || reduceMotion) return;
    pop.setValue(metrics.otpPop);
    const spring = Animated.spring(pop, { toValue: 1, ...metrics.otpSpring, useNativeDriver: true });
    spring.start();
    return () => spring.stop();
  }, [digit, pop, reduceMotion]);
  const filled = digit.length > 0;
  const ring = invalid ? colors.error : active ? colors.accent[role] : filled ? colors.accentSoft[role] : colors.fieldBorder;
  return (
    <Animated.View
      style={[
        styles.cell,
        { borderColor: ring, transform: [{ scale: pop }] },
        filled && styles.cellFilled,
        invalid && styles.cellInvalid,
      ]}
    >
      {filled ? <Text style={styles.digit}>{digit}</Text> : active ? <Caret role={role} /> : null}
    </Animated.View>
  );
}

export function CodeCells({ code, length, onChange, role, invalid, disabled, shakeKey }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (shakeKey === 0 || reduceMotion) return;
    const step = metrics.shakeStep;
    const distance = metrics.shakeDistance;
    const run = Animated.sequence([
      Animated.timing(shake, { toValue: -distance, duration: step, useNativeDriver: true }),
      Animated.timing(shake, { toValue: distance, duration: step, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -distance / length, duration: step, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: step, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [length, reduceMotion, shake, shakeKey]);

  useEffect(() => {
    if (!disabled) input.current?.focus();
  }, [disabled]);

  const cells = Array.from({ length }, (_, index) => code[index] ?? '');
  const activeIndex = focused && !disabled ? Math.min(code.length, length - 1) : -1;

  return (
    <Pressable accessible={false} onPress={() => input.current?.focus()}>
      <Animated.View style={[styles.row, { transform: [{ translateX: shake }] }]}>
        {cells.map((digit, index) => (
          <Cell key={index} digit={digit} active={index === activeIndex} role={role} invalid={invalid} />
        ))}
        <TextInput
          ref={input}
          accessibilityLabel={signInCopy.codeLabel}
          value={code}
          onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoCorrect={false}
          maxLength={length}
          editable={!disabled}
          caretHidden
          style={[styles.hidden, webHidden]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: metrics.otpGap },
  cell: { width: metrics.otpWidth, height: metrics.otpHeight, borderRadius: metrics.otpRadius, borderWidth: metrics.otpBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.otpFill },
  cellFilled: { backgroundColor: colors.otpFilledFill },
  cellInvalid: { backgroundColor: colors.errorSoft },
  digit: { fontSize: metrics.otpDigitSize, fontWeight: metrics.otpDigitWeight, color: colors.otpDigit },
  caret: { width: metrics.otpCaretWidth, height: metrics.otpCaretHeight, borderRadius: metrics.otpCaretWidth },
  hidden: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, color: 'transparent' },
});
