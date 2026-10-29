import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { layout, typography } from '@/theme/layout';
import { usePalette } from '@/theme/palette';

import { BodyText, ErrorText } from './text';

type Props = TextInputProps & { label: string; error?: string; hint?: string };

export function TextField({ label, error, hint, editable = true, style, onFocus, onBlur, ...props }: Props) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <BodyText>{label}</BodyText>
      <TextInput
        {...props}
        accessibilityLabel={label}
        accessibilityHint={[hint, error].filter(Boolean).join('. ') || undefined}
        accessibilityState={{ disabled: !editable }}
        editable={editable}
        placeholderTextColor={palette.mutedText}
        selectionColor={palette.accent}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[styles.input, { color: palette.text, backgroundColor: palette.background, borderColor: error ? palette.danger : focused ? palette.accent : palette.border }, !editable && styles.disabled, style]}
      />
      {error ? <ErrorText>{error}</ErrorText> : hint ? <BodyText muted>{hint}</BodyText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: layout.spacing.sm },
  input: { minHeight: layout.control.minHeight, borderWidth: layout.border.thin, borderRadius: layout.radius.medium, paddingHorizontal: layout.input.horizontalPadding, paddingVertical: layout.spacing.md, ...typography.body },
  disabled: { opacity: layout.opacity.disabled },
});
