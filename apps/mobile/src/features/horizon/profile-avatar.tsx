import { Image, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = { name?: string; uri?: string; size: number; initialSize: number };

export function ProfileAvatar({ name, uri, size, initialSize }: Props) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase('vi');
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Ảnh đại diện" />
      ) : initial ? (
        <Text style={[styles.initial, { fontSize: initialSize }]}>{initial}</Text>
      ) : (
        <Icon name="user" size={size * metrics.avatarIconRatio} color={colors.avatarInitial} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.avatarFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: colors.avatarInitial, fontWeight: metrics.avatarInitialWeight },
});
