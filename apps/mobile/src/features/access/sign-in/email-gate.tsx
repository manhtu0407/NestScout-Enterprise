import { useRef, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlassSurface, Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import type { AuthFailure } from '../auth/auth-gateway';
import { authMessages, emailCopy, emailMessages, signInCopy } from '../auth/auth-messages';
import { minPasswordLength } from '../auth/email-credentials';
import { emailModes, type EmailFieldErrors, type EmailMode } from '../auth/use-email-auth';
import { AuroraBackdrop } from './aurora-backdrop';
import { KaelCompanion } from './kael-companion';
import { RoleSwitch } from './role-switch';
import type { CompanionState, SignInRole } from './sign-in-types';
import { TextField } from './text-field';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;

export type EmailGateProps = {
  role: SignInRole;
  onRoleChange: (role: SignInRole) => void;
  mode: EmailMode;
  onModeChange: (mode: EmailMode) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  confirm: string;
  onConfirmChange: (value: string) => void;
  errors: EmailFieldErrors;
  failure: AuthFailure | null;
  busy: boolean;
  confirmationEmail: string | null;
  onSubmit: () => void;
  onBack: () => void;
};

function companionState(props: EmailGateProps): CompanionState {
  if (props.confirmationEmail !== null) return 'success';
  if (props.busy) return 'busy';
  return props.email.length + props.password.length > 0 ? 'typing' : 'idle';
}

function fieldMessages(errors: EmailFieldErrors) {
  return {
    email: errors.email ? emailMessages[errors.email] : null,
    password: errors.password === 'password_too_short' ? emailMessages.password_too_short(minPasswordLength) : errors.password ? emailMessages[errors.password] : null,
    confirm: errors.confirm ? emailMessages[errors.confirm] : null,
  };
}

export function EmailGate(props: EmailGateProps) {
  const { role, mode, busy, confirmationEmail } = props;
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const signUp = mode === emailModes.signUp;
  const otherMode: EmailMode = signUp ? emailModes.signIn : emailModes.signUp;
  const messages = fieldMessages(props.errors);
  const ready = props.email.length > 0 && props.password.length > 0 && (!signUp || props.confirm.length > 0);
  const ctaLabel = signUp ? emailCopy.signUp : emailCopy.signIn;
  const ctaDisabled = !ready || busy;

  return (
    <View style={styles.root}>
      <AuroraBackdrop role={role} />
      <SafeAreaView style={styles.safe}>
        <Pressable accessibilityRole="button" accessibilityLabel={signInCopy.back} onPress={props.onBack} style={styles.back}>
          <Icon name="back" size={metrics.backIconSize} color={colors.backIcon} />
        </Pressable>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <KaelCompanion state={companionState(props)} role={role} />
            <GlassSurface variant="sheet" radius={metrics.sheetRadius} style={styles.sheet}>
              <View style={styles.sheetBody}>
                {confirmationEmail !== null ? (
                  <>
                    <View style={styles.copy}>
                      <Text accessibilityRole="header" style={styles.title}>{emailCopy.sentTitle}</Text>
                      <Text style={styles.subtitle}>{emailCopy.sentBody(confirmationEmail)}</Text>
                    </View>
                    <PressScale accessibilityRole="button" accessibilityLabel={emailCopy.signIn} onPress={() => props.onModeChange(emailModes.signIn)} style={[styles.cta, styles.ctaOn]}>
                      <Text style={styles.ctaLabel}>{emailCopy.signIn}</Text>
                      <Icon name="arrowRight" size={metrics.ctaIconSize} color={colors.ctaLabel} />
                    </PressScale>
                  </>
                ) : (
                  <>
                    <View style={styles.copy}>
                      <Text accessibilityRole="header" style={styles.title}>{signUp ? emailCopy.signUpTitle : emailCopy.signInTitle}</Text>
                      <Text style={styles.subtitle}>{signUp ? emailCopy.signUpSubtitle : emailCopy.signInSubtitle}</Text>
                    </View>
                    <RoleSwitch role={role} onChange={props.onRoleChange} disabled={busy} />
                    <View style={styles.fields}>
                      <TextField
                        label={emailCopy.emailLabel}
                        placeholder={emailCopy.emailPlaceholder}
                        value={props.email}
                        onChange={props.onEmailChange}
                        role={role}
                        error={messages.email}
                        disabled={busy}
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        autoComplete="email"
                        autoCapitalize="none"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                      />
                      <TextField
                        inputRef={passwordRef}
                        label={emailCopy.passwordLabel}
                        placeholder={emailCopy.passwordPlaceholder}
                        value={props.password}
                        onChange={props.onPasswordChange}
                        role={role}
                        error={messages.password}
                        disabled={busy}
                        secure
                        textContentType={signUp ? 'newPassword' : 'password'}
                        autoComplete={signUp ? 'new-password' : 'current-password'}
                        autoCapitalize="none"
                        returnKeyType={signUp ? 'next' : 'go'}
                        onSubmitEditing={signUp ? () => confirmRef.current?.focus() : props.onSubmit}
                      />
                      {signUp && (
                        <TextField
                          inputRef={confirmRef}
                          label={emailCopy.confirmLabel}
                          placeholder={emailCopy.confirmPlaceholder}
                          value={props.confirm}
                          onChange={props.onConfirmChange}
                          role={role}
                          error={messages.confirm}
                          disabled={busy}
                          secure
                          textContentType="newPassword"
                          autoComplete="new-password"
                          autoCapitalize="none"
                          returnKeyType="go"
                          onSubmitEditing={props.onSubmit}
                        />
                      )}
                    </View>
                    <View accessibilityLiveRegion="polite" role="alert">
                      {props.failure ? <Text style={styles.error}>{authMessages[props.failure]}</Text> : null}
                    </View>
                    <PressScale
                      accessibilityRole="button"
                      accessibilityLabel={ctaLabel}
                      accessibilityState={{ disabled: ctaDisabled, busy }}
                      disabled={ctaDisabled}
                      onPress={props.onSubmit}
                      style={[styles.cta, ready ? styles.ctaOn : styles.ctaOff]}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.ctaLabel} />
                      ) : (
                        <>
                          <Text style={[styles.ctaLabel, !ready && styles.ctaLabelOff]}>{ctaLabel}</Text>
                          <Icon name="arrowRight" size={metrics.ctaIconSize} color={ready ? colors.ctaLabel : colors.ctaOffLabel} />
                        </>
                      )}
                    </PressScale>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => props.onModeChange(otherMode)} style={styles.link}>
                      <Text style={[styles.linkLabel, { color: colors.accentText[role] }]}>{signUp ? emailCopy.haveAccount : emailCopy.needAccount}</Text>
                    </Pressable>
                    {signUp && <Text style={styles.footnote}>{emailCopy.footnote}</Text>}
                  </>
                )}
              </View>
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
  fields: { gap: metrics.copyGap },
  title: { fontSize: metrics.titleSize, lineHeight: metrics.titleLineHeight, fontWeight: metrics.titleWeight, letterSpacing: metrics.titleTracking, color: colors.title },
  subtitle: { fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight, color: colors.body },
  error: { fontSize: metrics.noteSize, lineHeight: metrics.noteLineHeight, color: colors.error },
  cta: { minHeight: metrics.ctaHeight, borderRadius: metrics.ctaRadius, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.ctaGap },
  ctaOn: { backgroundColor: colors.cta },
  ctaOff: { backgroundColor: colors.ctaOff },
  ctaLabel: { fontSize: metrics.ctaSize, fontWeight: metrics.ctaWeight, color: colors.ctaLabel },
  ctaLabelOff: { color: colors.ctaOffLabel },
  link: { minHeight: metrics.linkHeight, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { fontSize: metrics.linkSize, fontWeight: metrics.linkWeight },
  footnote: { fontSize: metrics.footnoteSize, lineHeight: metrics.footnoteLineHeight, color: colors.muted, textAlign: 'center' },
});
