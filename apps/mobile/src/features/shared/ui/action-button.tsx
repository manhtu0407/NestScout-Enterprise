import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { usePalette } from '@/theme/palette';

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
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={[
        styles.button,
        secondary ? { borderColor: palette.border, borderWidth: 1 } : { backgroundColor: palette.accent },
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
  button: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '600' },
});
