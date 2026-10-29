import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet } from 'react-native';

import { layout } from '@/theme/layout';
import { usePalette } from '@/theme/palette';

export function IconButton({ label, hint, children, onPress, disabled = false, selected = false }: { label: string; hint?: string; children: ReactNode; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));
  const [previousDisabled, setPreviousDisabled] = useState(disabled);
  if (disabled !== previousDisabled) {
    setPreviousDisabled(disabled);
    if (disabled) {
      setFocused(false);
      setPressed(false);
    }
  }

  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { changed = true; setReduceMotion(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active && !changed) setReduceMotion(value); }, () => undefined);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(opacity, { toValue: pressed && !disabled ? layout.opacity.pressed : 1, duration: reduceMotion ? layout.motion.instant : layout.motion.quick, easing: Easing.out(Easing.ease), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [disabled, opacity, pressed, reduceMotion]);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} style={[styles.button, { borderColor: focused || selected ? palette.accent : palette.border, backgroundColor: palette.surface }, disabled && styles.disabled]}>
      <Animated.View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity }}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: layout.dimensions.touch, minHeight: layout.dimensions.touch, borderRadius: layout.radius.medium, borderWidth: layout.border.focus, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: layout.opacity.disabled },
});
