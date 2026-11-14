import { useState, type ComponentRef, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { emailCopy } from '../auth/auth-messages';
import type { SignInRole } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;
const webField = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0, transition: metrics.webTransition } as const, default: undefined });

type Props = Pick<TextInputProps, 'keyboardType' | 'textContentType' | 'autoComplete' | 'returnKeyType' | 'autoCapitalize' | 'onSubmitEditing'> & {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  role: SignInRole;
  error: string | null;
  disabled: boolean;
  secure?: boolean;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
};

export function TextField({ label, placeholder, value, onChange, role, error, disabled, secure = false, inputRef, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const ring = error ? colors.error : focused ? colors.fieldFocusBorder : colors.fieldBorder;
  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.field,
          webField,
          { borderColor: ring },
          focused && { backgroundColor: colors.fieldFocusFill, boxShadow: colors.fieldFocusShadow },
          error !== null && { backgroundColor: colors.errorSoft },
        ]}
      >
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={secure && !revealed}
          editable={!disabled}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.accent[role]}
          style={[styles.input, webField]}
          {...input}
        />
        {secure && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? emailCopy.hidePassword : emailCopy.showPassword}
            accessibilityState={{ selected: revealed }}
            disabled={disabled}
            hitSlop={8}
            onPress={() => setRevealed((current) => !current)}
            style={styles.reveal}
          >
            <Icon name="eye" size={metrics.switchIconSize} color={revealed ? colors.accentText[role] : colors.muted} />
          </Pressable>
        )}
      </View>
      {error !== null && (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: metrics.noteGap },
  field: { height: metrics.fieldHeight, borderRadius: metrics.fieldRadius, borderWidth: metrics.fieldBorder, paddingLeft: metrics.fieldPadding + metrics.fieldGap, paddingRight: metrics.fieldPadding, flexDirection: 'row', alignItems: 'center', gap: metrics.fieldGap, backgroundColor: colors.fieldFill },
  input: { flex: 1, height: metrics.fieldHeight, fontSize: metrics.subtitleSize, fontWeight: metrics.inputWeight, color: colors.inputText },
  reveal: { width: metrics.linkHeight, height: metrics.linkHeight, alignItems: 'center', justifyContent: 'center', marginRight: -metrics.revealOffset },
  error: { fontSize: metrics.noteSize, lineHeight: metrics.noteLineHeight, color: colors.error, paddingHorizontal: metrics.fieldGap },
});
