import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/theme/palette';
import { layout, typography } from '@/theme/layout';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  hint?: string;
  selected?: boolean;
};

export function ActionButton({ label, onPress, disabled = false, busy = false, secondary = false, hint, selected }: Props) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const inactive = disabled || busy;
  const [previousInactive, setPreviousInactive] = useState(inactive);
  if (inactive !== previousInactive) {
    setPreviousInactive(inactive);
    if (inactive) {
      setFocused(false);
      setPressed(false);
    }
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy, selected }}
      disabled={inactive}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.button,
        secondary ? { borderColor: palette.border, borderWidth: layout.input.borderWidth } : { backgroundColor: palette.accent },
        inactive && styles.inactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? palette.text : palette.onAccent} />
      ) : (
        <Text style={[styles.label, { color: secondary ? palette.text : palette.onAccent }]}>{label}</Text>
      )}
      {!inactive && (focused || pressed || selected) && (
        <View testID="action-feedback" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.feedback, { borderColor: secondary ? palette.accent : palette.onAccent }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: layout.control.minHeight, borderRadius: layout.control.radius, paddingHorizontal: layout.control.horizontalPadding, alignItems: 'center', justifyContent: 'center' },
  feedback: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: layout.control.radius, borderWidth: layout.control.feedbackBorderWidth },
  inactive: { opacity: layout.control.inactiveOpacity },
  label: typography.control,
});
