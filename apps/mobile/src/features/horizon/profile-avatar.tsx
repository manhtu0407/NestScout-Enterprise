import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { AvatarImage } from './avatar-image';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = { name?: string; uri?: string; headers?: Readonly<Record<string, string>>; size: number; initialSize: number };

export function ProfileAvatar({ name, uri, headers, size, initialSize }: Props) {
  const initial = name?.trim().charAt(0).toLocaleUpperCase('vi');
  const placeholder = initial
    ? <Text style={[styles.initial, { fontSize: initialSize }]}>{initial}</Text>
    : <Icon name="user" size={size * metrics.avatarIconRatio} color={colors.avatarInitial} />;
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size }]}>
      {uri ? <AvatarImage uri={uri} headers={headers} fallback={placeholder} /> : placeholder}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: colors.avatarFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial: { color: colors.avatarInitial, fontWeight: metrics.avatarInitialWeight },
});
