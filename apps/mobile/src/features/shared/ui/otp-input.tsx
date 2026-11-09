import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useGlassAccessibility } from './glass-interaction';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.affectLab;
const colors = horizonColors.affectLab;
const webReset = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0, caretColor: 'transparent' } as const, default: undefined });

export type OtpStatus = 'idle' | 'verifying' | 'error' | 'success';

type Props = {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  status?: OtpStatus;
  errorMessage?: string;
  length?: number;
  separator?: boolean;
  successLabel?: string;
  onResend?: () => void;
  resendIn?: number;
  autoFocus?: boolean;
  disabled?: boolean;
};

function Caret() {
  const { reduceMotion } = useGlassAccessibility();
  const [blink] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [blink, reduceMotion]);
  return <Animated.View style={[styles.caret, { opacity: blink }]}/>;
}

function Digit({ digit, tone }: { digit: string; tone: 'normal' | 'muted' | 'error' }) {
  const { reduceMotion } = useGlassAccessibility();
  const [pop] = useState(() => new Animated.Value(reduceMotion ? 1 : metrics.otpPopFrom));
  useEffect(() => {
    if (reduceMotion) return;
    const spring = Animated.spring(pop, { toValue: 1, speed: 26, bounciness: 6, useNativeDriver: true });
    spring.start();
    return () => spring.stop();
  }, [pop, reduceMotion]);
  return <Animated.Text style={[styles.digit, tone === 'muted' && styles.digitMuted, tone === 'error' && styles.digitError, { opacity: pop.interpolate({ inputRange: [metrics.otpPopFrom, 1], outputRange: [0, 1] }), transform: [{ scale: pop }] }]}>{digit}</Animated.Text>;
}

function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function OtpInput({ value, onChange, onComplete, status = 'idle', errorMessage = 'Mã chưa đúng. Hãy thử lại.', length = 6, separator = false, successLabel = 'Đã xác minh', onResend, resendIn = metrics.resendSeconds, autoFocus = false, disabled = false }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [focused, setFocused] = useState(autoFocus);
  const [ring] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  const completed = useRef('');
  const [remaining, setRemaining] = useState(onResend ? resendIn : 0);
  const middle = Math.floor(length * metrics.half);
  const active = Math.min(value.length, length - 1);
  const positionOf = (index: number) => index * (metrics.otpCellWidth + metrics.otpGap) + (separator && index >= middle ? metrics.otpSeparator : 0);
  const rowWidth = positionOf(length) - metrics.otpGap;
  const locked = disabled || status === 'verifying' || status === 'success';

  useEffect(() => {
    if (reduceMotion) { ring.setValue(positionOf(active)); return; }
    const glide = Animated.timing(ring, { toValue: positionOf(active), duration: metrics.otpRingDuration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    glide.start();
    return () => glide.stop();
  });

  useEffect(() => {
    if (status !== 'error') return;
    const timer = setTimeout(() => onChange(''), metrics.otpErrorClear);
    if (reduceMotion) return () => clearTimeout(timer);
    shake.setValue(0);
    const step = metrics.otpShakeDistance;
    const animation = Animated.sequence([step, -step, step / 2, -step / 2, 0].map(toValue => Animated.timing(shake, { toValue, duration: metrics.otpShakeStep, useNativeDriver: true })));
    animation.start();
    return () => { animation.stop(); clearTimeout(timer); };
  }, [status, shake, reduceMotion, onChange]);

  useEffect(() => {
    if (status !== 'verifying' || reduceMotion) return;
    sweep.setValue(0);
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: metrics.otpSweepDuration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [status, sweep, reduceMotion]);

  useEffect(() => {
    if (!onResend || remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(current => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [onResend, remaining]);

  const change = (text: string) => {
    const next = text.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length < length) completed.current = '';
    else if (completed.current !== next) { completed.current = next; onComplete?.(next); }
  };
  const resend = () => { setRemaining(resendIn); onResend?.(); };
  const tone = status === 'error' ? 'error' : status === 'verifying' ? 'muted' : 'normal';

  if (status === 'success') {
    return <View style={styles.root}>
      <View accessibilityLiveRegion="polite" accessibilityLabel={successLabel} style={styles.chip}>
        <Check size={20} color={colors.success} strokeWidth={2.5}/>
        <Text style={styles.chipText}>{successLabel}</Text>
      </View>
    </View>;
  }

  return <View style={styles.root}>
    <Animated.View style={{ width: rowWidth, transform: [{ translateX: shake }] }}>
      <View style={[styles.row, { width: rowWidth }]}>
        {Array.from({ length }, (_, index) => {
          const digit = value[index] ?? '';
          return <View key={index} style={[styles.cell, { left: positionOf(index) }, status === 'error' && styles.cellError]}>
            {digit !== '' && <Digit digit={digit} tone={tone}/>}
            {digit === '' && focused && index === active && status === 'idle' && <Caret/>}
          </View>;
        })}
        {focused && !locked && status !== 'error' && <Animated.View pointerEvents="none" style={[styles.ring, { transform: [{ translateX: ring }] }]}/>}
        {status === 'verifying' && !reduceMotion && <View pointerEvents="none" style={styles.sweepClip}>
          <Animated.View style={[styles.sweep, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-metrics.otpSweepWidth, rowWidth] }) }] }]}/>
        </View>}
        <TextInput
          accessibilityLabel={`Mã xác minh, ${length} chữ số`}
          aria-invalid={status === 'error'}
          value={value}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!locked}
          autoFocus={autoFocus}
          inputMode="numeric"
          keyboardType="number-pad"
          autoComplete="sms-otp"
          textContentType="oneTimeCode"
          maxLength={length}
          caretHidden
          selectionColor="transparent"
          style={[styles.input, webReset]}
        />
      </View>
    </Animated.View>
    {status === 'error' && <Text accessibilityLiveRegion="polite" style={styles.error}>{errorMessage}</Text>}
    {onResend && status !== 'verifying' && <View style={styles.resend}>
      <Text style={styles.resendText}>Chưa nhận được mã?</Text>
      {remaining > 0 ? <Text style={styles.resendCount}>Gửi lại sau {formatClock(remaining)}</Text>
        : <Pressable accessibilityRole="button" onPress={resend}><Text style={styles.resendAction}>Gửi lại mã</Text></Pressable>}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.gapHalf, alignItems: 'flex-start' },
  row: { height: metrics.otpCellHeight },
  cell: { position: 'absolute', top: 0, width: metrics.otpCellWidth, height: metrics.otpCellHeight, borderRadius: metrics.otpCellRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cellError: { backgroundColor: colors.errorFill, borderColor: colors.error },
  ring: { position: 'absolute', top: 0, left: 0, width: metrics.otpCellWidth, height: metrics.otpCellHeight, borderRadius: metrics.otpCellRadius, borderWidth: metrics.otpBorder, borderColor: colors.accent },
  digit: { color: colors.text, fontSize: metrics.otpFont, fontWeight: metrics.otpFontWeight },
  digitMuted: { color: colors.faint },
  digitError: { color: colors.error },
  caret: { width: metrics.otpCaretWidth, height: metrics.otpCaretHeight, borderRadius: metrics.pillRadius, backgroundColor: colors.accent },
  input: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: metrics.hiddenOpacity, color: 'transparent', fontSize: metrics.otpFont },
  sweepClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', borderRadius: metrics.otpCellRadius },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: metrics.otpSweepWidth, backgroundColor: colors.sweep },
  error: { color: colors.error, fontSize: metrics.captionSize },
  resend: { flexDirection: 'row', gap: metrics.gapHalf, alignItems: 'center' },
  resendText: { color: colors.muted, fontSize: metrics.captionSize },
  resendCount: { color: colors.faint, fontSize: metrics.captionSize },
  resendAction: { color: colors.accent, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  chip: { height: metrics.chipHeight, borderRadius: metrics.chipRadius, paddingHorizontal: metrics.chipPaddingX, flexDirection: 'row', alignItems: 'center', gap: metrics.gapHalf, backgroundColor: colors.successFill },
  chipText: { color: colors.success, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
});
