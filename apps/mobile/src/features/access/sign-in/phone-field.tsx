import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { signInCopy } from '../auth/auth-messages';
import { formatNational, toNationalDigits } from './phone-format';
import type { SignInRole } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;
const webField = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0, transition: metrics.webTransition } as const, default: undefined });

type Props = {
  digits: string;
  onChange: (digits: string) => void;
  onSubmit: () => void;
  role: SignInRole;
  invalid: boolean;
  disabled: boolean;
};

export function PhoneField({ digits, onChange, onSubmit, role, invalid, disabled }: Props) {
  const [focused, setFocused] = useState(false);
  const ring = invalid ? colors.error : focused ? colors.fieldFocusBorder : colors.fieldBorder;
  return (
    <View
      style={[
        styles.field,
        webField,
        { borderColor: ring },
        focused && { backgroundColor: colors.fieldFocusFill, boxShadow: colors.fieldFocusShadow },
        invalid && { backgroundColor: colors.errorSoft },
      ]}
    >
      <View style={styles.prefix} accessible={false}>
        <Text style={styles.prefixText}>{signInCopy.phonePrefix}</Text>
      </View>
      <TextInput
        accessibilityLabel={signInCopy.phoneLabel}
        value={formatNational(digits)}
        onChangeText={(text) => onChange(toNationalDigits(text))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoCorrect={false}
        returnKeyType="send"
        editable={!disabled}
        placeholder={signInCopy.phonePlaceholder}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.accent[role]}
        style={[styles.input, webField]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { height: metrics.fieldHeight, borderRadius: metrics.fieldRadius, borderWidth: metrics.fieldBorder, paddingHorizontal: metrics.fieldPadding, flexDirection: 'row', alignItems: 'center', gap: metrics.fieldGap, backgroundColor: colors.fieldFill },
  prefix: { height: metrics.prefixHeight, borderRadius: metrics.prefixRadius, paddingHorizontal: metrics.prefixPadding, justifyContent: 'center', backgroundColor: colors.prefixFill, boxShadow: colors.prefixShadow },
  prefixText: { fontSize: metrics.prefixSize, fontWeight: metrics.prefixWeight, color: colors.prefixText },
  input: { flex: 1, height: metrics.fieldHeight, fontSize: metrics.inputSize, fontWeight: metrics.inputWeight, letterSpacing: metrics.inputTracking, color: colors.inputText },
});
