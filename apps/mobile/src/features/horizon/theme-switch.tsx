import * as Haptics from 'expo-haptics';
import { Moon, Sun } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { PressScale, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.themeSwitch;
const colors = horizonColors.themeSwitch;

export type ThemeMode = 'light' | 'dark';

type Props = {
  theme: ThemeMode;
  onThemeChange: (next: ThemeMode) => void;
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
};

export function ThemeSwitch({ theme, onThemeChange, label, accessibilityLabel, disabled = false }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const dark = theme === 'dark';
  const [progress] = useState(() => new Animated.Value(dark ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(dark ? 1 : 0);
      return undefined;
    }
    const motion = Animated.spring(progress, { toValue: dark ? 1 : 0, damping: metrics.damping, stiffness: metrics.stiffness, mass: 1, useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [dark, progress, reduceMotion]);

  const press = () => {
    void Haptics.selectionAsync();
    onThemeChange(dark ? 'light' : 'dark');
  };

  const sunStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0, 0] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, metrics.rise] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-70deg'] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) },
    ],
  };
  const moonStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] }),
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-metrics.rise, 0] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['70deg', '0deg'] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
    ],
  };

  return (
    <PressScale accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked: dark, disabled }} disabled={disabled} onPress={press} style={[styles.button, disabled && styles.disabled]}>
      <View style={styles.glyph}>
        <Animated.View pointerEvents="none" style={[styles.layer, sunStyle]}>
          <Sun size={metrics.iconSize} color={colors.sun} strokeWidth={1.9} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.layer, moonStyle]}>
          <Moon size={metrics.iconSize} color={colors.moon} strokeWidth={1.9} />
        </Animated.View>
      </View>
      <Text style={styles.label}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: metrics.height, flexDirection: 'row', alignItems: 'center', gap: metrics.gap, paddingHorizontal: metrics.padding, borderRadius: metrics.radius, backgroundColor: colors.fill },
  disabled: { opacity: 0.5 },
  glyph: { width: metrics.iconSize, height: metrics.iconSize },
  layer: { position: 'absolute', left: 0, top: 0 },
  label: { flex: 1, color: colors.text, fontSize: metrics.labelSize, fontWeight: '600' },
});
