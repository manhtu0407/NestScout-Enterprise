import { StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const sizes: Readonly<Record<AvatarSize, number>> = { xs: metrics.avatarXs, sm: metrics.avatarSm, md: metrics.avatarMd, lg: metrics.avatarLg };

export type Person = Readonly<{ name: string }>;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(part => part !== '');
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1] ?? '' : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function toneOf(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) % 997;
  return colors.avatars[hash % colors.avatars.length] ?? colors.neutralBg;
}

export function Avatar({ name, size = 'md', ringed = false }: Person & { size?: AvatarSize; ringed?: boolean }) {
  const box = sizes[size];
  const frame = { width: box, height: box, borderRadius: metrics.pillRadius };
  return <View accessibilityRole="image" accessibilityLabel={name} style={[styles.base, frame, { backgroundColor: toneOf(name) }, ringed && styles.ringed]}>
    <Text style={[styles.initials, { fontSize: box * metrics.avatarFontRatio }]}>{initialsOf(name)}</Text>
  </View>;
}

type GroupProps = { people: readonly Person[]; max?: number; size?: AvatarSize };

export function AvatarGroup({ people, max = 3, size = 'md' }: GroupProps) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const box = sizes[size];
  return <View accessibilityLabel={`${people.length} thợ`} style={styles.group}>
    {shown.map((person, index) => <View key={person.name} style={index > 0 ? { marginLeft: -metrics.avatarOverlap } : undefined}>
      <Avatar name={person.name} size={size} ringed/>
    </View>)}
    {rest > 0 && <View style={[styles.base, styles.ringed, styles.more, { width: box, height: box, borderRadius: metrics.pillRadius, marginLeft: -metrics.avatarOverlap }]}>
      <Text style={[styles.moreText, { fontSize: box * metrics.avatarFontRatio }]}>+{rest}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  ringed: { borderWidth: metrics.avatarRing, borderColor: colors.ring },
  initials: { color: colors.text, fontWeight: metrics.titleWeight },
  group: { flexDirection: 'row', alignItems: 'center' },
  more: { backgroundColor: colors.neutralBg },
  moreText: { color: colors.neutralFg, fontWeight: metrics.titleWeight },
});
