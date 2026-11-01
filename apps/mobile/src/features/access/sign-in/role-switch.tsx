import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { signInCopy } from '../auth/auth-messages';
import { signInRoles, type SignInRole } from './sign-in-types';

const metrics = horizonLayout.signIn;
const colors = horizonColors.signIn;
const icons = { client: 'user', worker: 'briefcase' } as const;

type Props = { role: SignInRole; onChange: (role: SignInRole) => void; disabled?: boolean };

export function RoleSwitch({ role, onChange, disabled = false }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [trackWidth, setTrackWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(signInRoles.indexOf(role)));
  const thumbWidth = trackWidth > 0 ? (trackWidth - metrics.switchPadding * signInRoles.length) / signInRoles.length : 0;

  useEffect(() => {
    const target = signInRoles.indexOf(role);
    if (reduceMotion) {
      position.setValue(target);
      return;
    }
    const spring = Animated.spring(position, { toValue: target, ...metrics.switchSpring, useNativeDriver: true });
    spring.start();
    return () => spring.stop();
  }, [position, reduceMotion, role]);

  const translateX = position.interpolate({ inputRange: [0, 1], outputRange: [0, thumbWidth] });

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={signInCopy.switchLabel}
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.track}
    >
      {thumbWidth > 0 && <Animated.View pointerEvents="none" style={[styles.thumb, { width: thumbWidth, transform: [{ translateX }] }]} />}
      {signInRoles.map((entry) => {
        const selected = entry === role;
        return (
          <Pressable
            key={entry}
            disabled={disabled}
            onPress={() => onChange(entry)}
            accessibilityRole="radio"
            accessibilityLabel={signInCopy.roles[entry].label}
            accessibilityState={{ checked: selected, disabled }}
            aria-checked={selected}
            style={styles.segment}
          >
            <Icon name={icons[entry]} size={metrics.switchIconSize} color={selected ? colors.accentText[entry] : colors.switchIdle} />
            <Text style={[styles.label, { color: selected ? colors.switchActive : colors.switchIdle }]}>{signInCopy.roles[entry].label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: metrics.switchHeight, borderRadius: metrics.switchRadius, padding: metrics.switchPadding, flexDirection: 'row', backgroundColor: colors.switchTrack },
  thumb: { position: 'absolute', top: metrics.switchPadding, bottom: metrics.switchPadding, left: metrics.switchPadding, borderRadius: metrics.switchRadius, backgroundColor: colors.switchThumb, boxShadow: colors.switchThumbShadow },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.switchGap },
  label: { fontSize: metrics.switchLabelSize, fontWeight: metrics.switchLabelWeight },
});
