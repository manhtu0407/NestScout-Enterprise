import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { ActionButton, BodyText, ErrorText, Heading, Screen } from '@/features/shared';
import { usePalette } from '@/theme/palette';
import { layout, typography } from '@/theme/layout';

import { authMessages } from '../auth/auth-messages';
import { otpLength, usePhoneSignIn } from '../auth/use-phone-sign-in';
import { maskPhone } from '../phone/vietnam-phone';
import { useAccess } from '../state/access-provider';

export function OtpVerificationScreen() {
  const router = useRouter();
  const palette = usePalette();
  const access = useAccess();
  const signIn = usePhoneSignIn();
  const [code, setCode] = useState('');

  if (access.otpPhone === null) return <Redirect href="/phone" />;

  const submit = () => {
    void signIn.submitCode(code);
  };
  const cancel = () => {
    signIn.cancel();
    router.replace('/phone');
  };

  return (
    <Screen>
      <Heading>Enter the code</Heading>
      <BodyText>We sent a {otpLength}-digit code to {maskPhone(access.otpPhone)}.</BodyText>
      <Text nativeID="code-label" style={{ color: palette.text }}>
        One-time code
      </Text>
      <TextInput
        accessibilityLabel="One-time code"
        accessibilityLabelledBy="code-label"
        value={code}
        onChangeText={(next) => setCode(next.replace(/\D/g, '').slice(0, otpLength))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoCorrect={false}
        maxLength={otpLength}
        editable={!signIn.busy}
        onSubmitEditing={submit}
        returnKeyType="done"
        style={[styles.input, { color: palette.text, borderColor: palette.border }]}
      />
      {signIn.codeInvalid ? <ErrorText>{`Enter all ${otpLength} digits.`}</ErrorText> : null}
      {signIn.failure ? <ErrorText>{authMessages[signIn.failure]}</ErrorText> : null}
      <ActionButton label="Verify code" onPress={submit} busy={signIn.busy} />
      <ActionButton
        secondary
        label={signIn.resendSeconds > 0 ? `Resend code in ${signIn.resendSeconds}s` : 'Resend code'}
        onPress={() => void signIn.resend()}
        disabled={signIn.busy || signIn.resendSeconds > 0}
      />
      <ActionButton secondary label="Use a different number" onPress={cancel} disabled={signIn.busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: layout.control.minHeight, borderWidth: layout.input.borderWidth, borderRadius: layout.control.radius, paddingHorizontal: layout.input.horizontalPadding, ...typography.codeInput },
});
