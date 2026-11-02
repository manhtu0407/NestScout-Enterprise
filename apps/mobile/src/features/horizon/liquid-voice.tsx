import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.chatComposer;
const colors = horizonColors.chatComposer;
const middle = (metrics.voiceBarCount - 1) / 2;
const envelopes = Array.from({ length: metrics.voiceBarCount }, (_, index) => 1 - Math.abs(index - middle) * metrics.voiceBarFalloff);

export function useLiquidVoice(onFinish: () => void) {
  const [recording, setRecording] = useState(false);
  const start = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecording(true);
  };
  const cancel = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecording(false);
  };
  const finish = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRecording(false);
    onFinish();
  };
  return { recording, start, cancel, finish };
}

function Waveform() {
  const { reduceMotion } = useGlassAccessibility();
  const [bars] = useState(() => envelopes.map(envelope => new Animated.Value(reduceMotion ? envelope : metrics.voiceBarRest)));

  useEffect(() => {
    if (reduceMotion) {
      bars.forEach((bar, index) => bar.setValue(envelopes[index] ?? 1));
      return undefined;
    }
    const loops = bars.map((bar, index) => Animated.loop(Animated.sequence([
      Animated.delay(index * metrics.voiceBarStagger),
      Animated.timing(bar, { toValue: envelopes[index] ?? 1, duration: metrics.voiceBarDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bar, { toValue: metrics.voiceBarRest, duration: metrics.voiceBarDuration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])));
    const running = Animated.parallel(loops);
    running.start();
    return () => running.stop();
  }, [bars, reduceMotion]);

  return (
    <View pointerEvents="none" style={styles.wave}>
      {bars.map((bar, index) => <Animated.View key={index} style={[styles.bar, { transform: [{ scaleY: bar }] }]} />)}
    </View>
  );
}

type CapsuleProps = { onCancel: () => void; onSend: () => void };

export function LiquidVoiceCapsule({ onCancel, onSend }: CapsuleProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const animation = Animated.spring(progress, { toValue: 1, ...metrics.voiceSpring, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion]);

  const scaleX = progress.interpolate({ inputRange: [0, 1], outputRange: [metrics.voiceEnterFrom, 1] });

  return (
    <Animated.View accessibilityLiveRegion="polite" style={[styles.capsule, { opacity: progress, transform: [{ scaleX }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Hủy ghi âm" hitSlop={metrics.voiceActionHitSlop} onPress={onCancel} style={[styles.action, styles.cancel]}>
        <Icon name="close" size={metrics.voiceActionIconSize} strokeWidth={metrics.voiceActionStroke} color={colors.voiceCancelIcon} />
      </Pressable>
      <View accessible accessibilityLabel="Đang nghe" style={styles.waveSlot}>
        <Waveform />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dừng và gửi lời nói" hitSlop={metrics.voiceActionHitSlop} onPress={onSend} style={[styles.action, styles.send]}>
        <Icon name="arrowUp" size={metrics.voiceActionIconSize} strokeWidth={metrics.voiceActionStroke} color={colors.voiceSendIcon} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capsule: { flex: 1, minHeight: metrics.inputMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.voiceGap, padding: metrics.voicePadding, borderRadius: metrics.voiceRadius, backgroundColor: colors.voiceSurface, transformOrigin: 'right center' },
  action: { width: metrics.voiceActionSize, height: metrics.voiceActionSize, borderRadius: metrics.voiceActionRadius, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: colors.voiceCancelFill },
  send: { backgroundColor: colors.voiceSendFill },
  waveSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wave: { height: metrics.voiceBarHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.voiceBarGap },
  bar: { width: metrics.voiceBarWidth, height: metrics.voiceBarHeight, borderRadius: metrics.voiceBarRadius, backgroundColor: colors.voiceBar },
});
