import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.chatComposer;
const colors = horizonColors.chatComposer;
const secondsPerMinute = 60;
const millisecondsPerSecond = 1000;
const secondDigits = 2;

export function formatElapsed(milliseconds: number): string {
  const total = Math.floor(milliseconds / millisecondsPerSecond);
  const seconds = String(total % secondsPerMinute).padStart(secondDigits, '0');
  return `${Math.floor(total / secondsPerMinute)}:${seconds}`;
}

export function useVoiceHold(onRelease: (durationMs: number) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const release = useRef(onRelease);

  useEffect(() => {
    release.current = onRelease;
  }, [onRelease]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const begin = () => {
    if (timer.current) return;
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    timer.current = setInterval(() => setElapsed(Date.now() - startedAt.current), metrics.voiceTickInterval);
  };

  const end = () => {
    if (!timer.current) return;
    clearInterval(timer.current);
    timer.current = null;
    setRecording(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    release.current(Date.now() - startedAt.current);
  };

  return { recording, elapsed, toggle: () => (timer.current ? end() : begin()) };
}

export function VoiceHoldPill({ elapsed }: { elapsed: number }) {
  const { reduceMotion } = useGlassAccessibility();
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: metrics.voicePulseMin, duration: metrics.voicePulseDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: metrics.voicePulseDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={`Đang nghe, ${formatElapsed(elapsed)}. Nhấn mic để dừng`} accessible style={styles.pill}>
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
      <Icon name="mic" size={metrics.voiceIconSize} strokeWidth={metrics.mediaIconStroke} color={colors.voiceLabel} />
      <Text style={styles.label}>Đang nghe</Text>
      <Text style={styles.timer}>{formatElapsed(elapsed)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flex: 1, minHeight: metrics.inputMinHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.voiceGap, paddingHorizontal: metrics.voicePaddingHorizontal, borderRadius: metrics.voiceRadius, backgroundColor: colors.voiceSurface },
  dot: { width: metrics.voiceDotSize, height: metrics.voiceDotSize, borderRadius: metrics.voiceDotRadius, backgroundColor: colors.voiceDot },
  label: { color: colors.voiceLabel, fontSize: metrics.voiceLabelSize, fontWeight: metrics.voiceLabelWeight },
  timer: { color: colors.voiceTimer, fontSize: metrics.voiceLabelSize, fontWeight: metrics.voiceTimerWeight, fontVariant: ['tabular-nums'] },
});
