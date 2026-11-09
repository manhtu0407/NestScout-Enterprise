import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassSurface, Icon, PressScale, SocialButton, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { SocialProvider } from '../auth/auth-gateway';
import { signInCopy } from '../auth/auth-messages';
import { AuroraBackdrop } from './aurora-backdrop';
import { CodeCells } from './code-cells';
import { KaelCompanion } from './kael-companion';
import { isCompleteNational } from './phone-format';
import { PhoneField } from './phone-field';
import { RoleSwitch } from './role-switch';
import type { CompanionState, SignInRole, SignInStep } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;

export const codeLength = 6;

export type SignInGateProps = {
  role: SignInRole;
  onRoleChange: (role: SignInRole) => void;
  step: SignInStep;
  digits: string;
  onDigitsChange: (digits: string) => void;
  code: string;
  onCodeChange: (code: string) => void;
  maskedPhone: string;
  busy: boolean;
  success: boolean;
  phoneError: string | null;
  codeError: string | null;
  failure: string | null;
  shakeKey: number;
  resendSeconds: number;
  onSubmitPhone: () => void;
  onSocialSignIn: (provider: SocialProvider) => void;
  onSubmitCode: () => void;
  onResend: () => void;
  onChangeNumber: () => void;
  onBack?: () => void;
  note?: string;
};

function useStepEntrance(step: SignInStep) {
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const entrance = Animated.timing(progress, { toValue: 1, duration: metrics.stepDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    entrance.start();
    return () => entrance.stop();
  }, [progress, reduceMotion, step]);
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [step === 'code' ? metrics.stepSlide : -metrics.stepSlide, 0] });
  return { opacity: progress, transform: [{ translateX }] };
}

function isReady(props: SignInGateProps): boolean {
  return props.step === 'phone' ? isCompleteNational(props.digits) : props.code.length === codeLength;
}

function companionState(props: SignInGateProps): CompanionState {
  if (props.success) return 'success';
  if (props.busy) return 'busy';
  const typed = props.step === 'phone' ? props.digits.length : props.code.length;
  return typed > 0 ? 'typing' : 'idle';
}

export function SignInGate(props: SignInGateProps) {
  const { role, step, busy, success } = props;
  const entrance = useStepEntrance(step);
  const copy = signInCopy.roles[role];
  const ready = isReady(props);
  const error = step === 'phone' ? props.phoneError ?? props.failure : props.codeError ?? props.failure;
  const title = step === 'phone' ? copy.title : signInCopy.codeTitle;
  const subtitle = step === 'phone' ? null : signInCopy.codeSent(props.maskedPhone);
  const ctaLabel = success ? signInCopy.verified : step === 'phone' ? signInCopy.sendCode : signInCopy.verify;
  const ctaDisabled = !ready || busy || success;

  return (
    <View style={styles.root}>
      <AuroraBackdrop role={role} />
      <SafeAreaView style={styles.safe}>
        {props.onBack && (
          <Pressable accessibilityRole="button" accessibilityLabel={signInCopy.back} onPress={props.onBack} style={styles.back}>
            <Icon name="back" size={metrics.backIconSize} color={colors.backIcon} />
          </Pressable>
        )}
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <KaelCompanion state={companionState(props)} role={role} />
            <GlassSurface variant="sheet" radius={metrics.sheetRadius} style={styles.sheet}>
              <Animated.View style={[styles.sheetBody, entrance]}>
                <View style={styles.copy}>
                  <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                  {subtitle !== null && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
                {step === 'phone' ? (
                  <>
                    <RoleSwitch role={role} onChange={props.onRoleChange} disabled={busy} />
                    <PhoneField digits={props.digits} onChange={props.onDigitsChange} onSubmit={props.onSubmitPhone} role={role} invalid={props.phoneError !== null} disabled={busy} />
                    <View style={styles.social}>
                      <SocialButton brand="google" disabled={busy} onPress={() => props.onSocialSignIn('google')} />
                      <SocialButton brand="apple" disabled={busy} onPress={() => props.onSocialSignIn('apple')} />
                    </View>
                  </>
                ) : (
                  <CodeCells code={props.code} length={codeLength} onChange={props.onCodeChange} role={role} invalid={props.codeError !== null || props.failure !== null} disabled={busy || success} shakeKey={props.shakeKey} />
                )}
                <View accessibilityLiveRegion="polite" role="alert">
                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </View>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={ctaLabel}
                  accessibilityState={{ disabled: ctaDisabled, busy }}
                  disabled={ctaDisabled}
                  onPress={step === 'phone' ? props.onSubmitPhone : props.onSubmitCode}
                  style={[styles.cta, ready ? styles.ctaOn : styles.ctaOff]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.ctaLabel} />
                  ) : (
                    <>
                      <Text style={[styles.ctaLabel, !ready && styles.ctaLabelOff]}>{ctaLabel}</Text>
                      <Icon name={success ? 'check' : 'arrowRight'} size={metrics.ctaIconSize} color={ready ? colors.ctaLabel : colors.ctaOffLabel} />
                    </>
                  )}
                </PressScale>
                {step === 'code' && (
                  <View style={styles.links}>
                    <Pressable accessibilityRole="button" disabled={busy || props.resendSeconds > 0} onPress={props.onResend} style={styles.link}>
                      <Text style={[styles.linkLabel, { color: props.resendSeconds > 0 ? colors.muted : colors.accentText[role] }]}>
                        {props.resendSeconds > 0 ? signInCopy.resendIn(props.resendSeconds) : signInCopy.resend}
                      </Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={props.onChangeNumber} style={styles.link}>
                      <Text style={[styles.linkLabel, { color: colors.accentText[role] }]}>{signInCopy.changeNumber}</Text>
                    </Pressable>
                  </View>
                )}
                <Text style={styles.footnote}>{props.note ?? signInCopy.footnote}</Text>
              </Animated.View>
            </GlassSurface>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.backdrop, overflow: 'hidden' },
  safe: { flex: 1 },
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: metrics.gutter, paddingBottom: metrics.sheetBottomGap },
  back: { position: 'absolute', top: metrics.backTop, left: metrics.gutter, zIndex: 1, width: metrics.backButtonSize, height: metrics.backButtonSize, borderRadius: metrics.backButtonSize, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backFill, boxShadow: colors.backShadow },
  sheet: { padding: metrics.sheetPadding },
  sheetBody: { gap: metrics.sheetGap },
  copy: { gap: metrics.copyGap },
  social: { gap: metrics.copyGap },
  title: { fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight, fontWeight: metrics.titleWeight, letterSpacing: metrics.titleTracking, color: colors.title },
  subtitle: { fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight, color: colors.body },
  error: { fontSize: metrics.noteSize, lineHeight: metrics.noteLineHeight, color: colors.error },
  cta: { minHeight: metrics.ctaHeight, borderRadius: metrics.ctaRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.ctaGap },
  ctaOn: { backgroundColor: colors.cta },
  ctaOff: { backgroundColor: colors.ctaOff },
  ctaLabel: { fontSize: metrics.ctaSize, fontWeight: metrics.ctaWeight, color: colors.ctaLabel },
  ctaLabelOff: { color: colors.ctaOffLabel },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  link: { minHeight: metrics.linkHeight, justifyContent: 'center' },
  linkLabel: { fontSize: metrics.linkSize, fontWeight: metrics.linkWeight },
  footnote: { fontSize: metrics.footnoteSize, lineHeight: metrics.footnoteLineHeight, color: colors.muted, textAlign: 'center' },
});
