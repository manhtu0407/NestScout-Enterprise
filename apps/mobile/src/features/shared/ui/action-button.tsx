import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { usePalette } from '@/theme/palette';
import { layout, typography } from '@/theme/layout';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  hint?: string;
};

export function ActionButton({ label, onPress, disabled = false, busy = false, secondary = false, hint }: Props) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.button,
        secondary ? { borderColor: palette.border, borderWidth: layout.input.borderWidth } : { backgroundColor: palette.accent },
        !inactive && (focused || pressed) && { borderColor: secondary ? palette.accent : palette.onAccent, borderWidth: layout.control.feedbackBorderWidth },
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? palette.text : palette.onAccent} />
      ) : (
        <Text style={[styles.label, { color: secondary ? palette.text : palette.onAccent }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: layout.control.minHeight, borderRadius: layout.control.radius, paddingHorizontal: layout.control.horizontalPadding, alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: layout.control.inactiveOpacity },
  label: typography.control,
});
