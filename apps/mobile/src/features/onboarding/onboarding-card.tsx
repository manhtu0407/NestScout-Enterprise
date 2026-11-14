import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type HostInstance } from 'react-native';

import { PressScale, useGlassAccessibility, usePressFeedback } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { OnboardingAction, OnboardingChrome, OnboardingStep } from './onboarding-steps';

const metrics = horizonLayout.onboarding;
const colors = horizonColors.onboarding;
const [easeX1, easeY1, easeX2, easeY2] = metrics.easeOut;
const dotEasing = Easing.bezier(easeX1, easeY1, easeX2, easeY2);

type DotProps = { active: boolean; label: string; reduceMotion: boolean; onPress: () => void };

function Dot({ active, label, reduceMotion, onPress }: DotProps) {
  const [width] = useState(() => new Animated.Value(active ? metrics.dotActive : metrics.dotSize));
  useEffect(() => {
    const animation = Animated.timing(width, { toValue: active ? metrics.dotActive : metrics.dotSize, duration: reduceMotion ? 0 : metrics.dotDuration, easing: dotEasing, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, width]);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} hitSlop={metrics.hitSlop} onPress={onPress}>
    <Animated.View style={[styles.dot, { width }, active && styles.dotActive]}/>
  </Pressable>;
}

type PrimaryProps = { label: string; onPress: () => void; reduceMotion: boolean; focusKey: number };

function PrimaryButton({ label, onPress, reduceMotion, focusKey }: PrimaryProps) {
  const feedback = usePressFeedback(reduceMotion);
  const button = useRef<HostInstance>(null);
  useEffect(() => {
    if (Platform.OS === 'web') button.current?.focus();
  }, [focusKey]);
  return <Animated.View style={[styles.primaryWrapper, { transform: [{ scale: feedback.scale }] }]}>
    <Pressable ref={button} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={feedback.pressIn} onPressOut={feedback.pressOut} style={[styles.button, styles.primary]}>
      <Text style={[styles.buttonLabel, styles.primaryLabel]}>{label}</Text>
    </Pressable>
  </Animated.View>;
}

type Props = {
  step: OnboardingStep;
  index: number;
  total: number;
  chrome: OnboardingChrome;
  onPrimary: () => void;
  onAction: (action: OnboardingAction) => void;
  onBack: () => void;
  onSkip: () => void;
  onJump: (index: number) => void;
};

export function OnboardingCard({ step, index, total, chrome, onPrimary, onAction, onBack, onSkip, onJump }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  return <View role="dialog" aria-modal accessibilityViewIsModal accessibilityLabel={chrome.dialog} style={styles.card}>
    <View style={styles.header}>
      <View accessible accessibilityLabel={chrome.stepOf(index + 1, total)} style={styles.dots}>
        {Array.from({ length: total }, (_, position) => <Dot key={position} active={position === index} label={chrome.stepOf(position + 1, total)} reduceMotion={reduceMotion} onPress={() => onJump(position)}/>)}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={chrome.skip} hitSlop={metrics.hitSlop} onPress={onSkip} style={styles.skip}>
        <Text style={styles.skipLabel}>{chrome.skip}</Text>
      </Pressable>
    </View>
    <View accessibilityLiveRegion="polite" style={styles.copy}>
      <Text accessibilityRole="header" style={styles.title}>{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>
    </View>
    {step.note !== undefined && <View style={styles.note}><Text style={styles.noteText}>{step.note}</Text></View>}
    {step.links.length > 0 && <View style={styles.links}>
      {step.links.map(link => <PressScale key={link.action} accessibilityRole="button" accessibilityLabel={link.label} onPress={() => onAction(link.action)} style={styles.link}>
        <Text style={styles.linkLabel}>{link.label}</Text>
      </PressScale>)}
    </View>}
    <View style={styles.actions}>
      {index > 0 && <PressScale accessibilityRole="button" accessibilityLabel={chrome.back} onPress={onBack} style={[styles.button, styles.ghost]}>
        <Text style={[styles.buttonLabel, styles.ghostLabel]}>{chrome.back}</Text>
      </PressScale>}
      <PrimaryButton label={step.primary.label} onPress={onPrimary} reduceMotion={reduceMotion} focusKey={index}/>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: metrics.cardPadding, gap: metrics.cardGap, borderRadius: metrics.cardRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.cardBorder, backgroundColor: colors.cardSurface, boxShadow: colors.cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: metrics.dotGap },
  dot: { height: metrics.dotSize, borderRadius: metrics.dotRadius, backgroundColor: colors.dot },
  dotActive: { backgroundColor: colors.dotActive },
  skip: { minHeight: metrics.skipHit, justifyContent: 'center', marginVertical: -metrics.skipOffset },
  skipLabel: { color: colors.skip, fontSize: metrics.skipSize, fontWeight: metrics.skipWeight },
  copy: { gap: metrics.copyGap },
  title: { color: colors.title, fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight, fontWeight: metrics.titleWeight, letterSpacing: metrics.titleTracking },
  body: { color: colors.body, fontSize: metrics.bodySize, lineHeight: metrics.bodyLineHeight },
  note: { padding: metrics.notePadding, borderRadius: metrics.noteRadius, backgroundColor: colors.noteSurface },
  noteText: { color: colors.noteText, fontSize: metrics.noteSize, lineHeight: metrics.noteLineHeight },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.linkGap },
  link: { minHeight: metrics.linkHeight, paddingHorizontal: metrics.backPadding, borderRadius: metrics.linkRadius, backgroundColor: colors.ghostFill, justifyContent: 'center' },
  linkLabel: { color: colors.link, fontSize: metrics.linkSize, fontWeight: metrics.linkWeight },
  actions: { flexDirection: 'row', gap: metrics.actionGap, marginTop: metrics.actionTop },
  primaryWrapper: { flex: 1 },
  button: { minHeight: metrics.buttonHeight, paddingHorizontal: metrics.backPadding, borderRadius: metrics.buttonRadius, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontSize: metrics.buttonSize, fontWeight: metrics.buttonWeight },
  primary: { backgroundColor: colors.primaryFill },
  primaryLabel: { color: colors.primaryText },
  ghost: { backgroundColor: colors.ghostFill },
  ghostLabel: { color: colors.ghostText },
});
