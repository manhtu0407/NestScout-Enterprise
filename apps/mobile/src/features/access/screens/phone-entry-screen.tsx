import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { ActionButton, BodyText, ErrorText, Heading, Screen } from '@/features/shared';
import { usePalette } from '@/theme/palette';
import { layout, typography } from '@/theme/layout';

import { authMessages, phoneMessages } from '../auth/auth-messages';
import { usePhoneSignIn } from '../auth/use-phone-sign-in';
import { useAccess } from '../state/access-provider';

export function PhoneEntryScreen() {
  const router = useRouter();
  const palette = usePalette();
  const signIn = usePhoneSignIn();
  const { cancelHorizonTransfer } = useAccess();
  const [phone, setPhone] = useState('');

  useEffect(() => () => cancelHorizonTransfer(), [cancelHorizonTransfer]);

  const submit = () => {
    void signIn.submitPhone(phone).then((sent) => {
      if (sent) router.push('/verify');
    });
  };

  return (
    <Screen>
      <Heading>Sign in with your phone</Heading>
      <BodyText>Enter your Vietnamese mobile number. We will send a one-time code by text message.</BodyText>
      <Text nativeID="phone-label" style={{ color: palette.text }}>
        Mobile number
      </Text>
      <TextInput
        accessibilityLabel="Mobile number"
        accessibilityLabelledBy="phone-label"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoCorrect={false}
        editable={!signIn.busy}
        placeholder="0912 345 678"
        placeholderTextColor={palette.mutedText}
        onSubmitEditing={submit}
        returnKeyType="send"
        style={[styles.input, { color: palette.text, borderColor: palette.border }]}
      />
      {signIn.phoneError ? <ErrorText>{phoneMessages[signIn.phoneError]}</ErrorText> : null}
      {signIn.failure ? <ErrorText>{authMessages[signIn.failure]}</ErrorText> : null}
      <ActionButton label="Send code" onPress={submit} busy={signIn.busy} />
      <ActionButton secondary label="Back" onPress={() => router.back()} disabled={signIn.busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: layout.control.minHeight, borderWidth: layout.input.borderWidth, borderRadius: layout.control.radius, paddingHorizontal: layout.input.horizontalPadding, ...typography.phoneInput },
});
