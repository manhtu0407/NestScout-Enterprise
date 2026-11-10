import * as Haptics from 'expo-haptics';
import { BadgeCheck, FileText, Heart, SmilePlus, ThumbsUp, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useGlassAccessibility, type ReviewReactionCount, type ReviewReactionId } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { RollingNumber } from './motion-count';
import { Presence } from './motion-presence';

const metrics = horizonLayout.reactions;
const colors = horizonColors.reactions;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export type ReactionOption = { id: ReviewReactionId; label: string; icon: LucideIcon };

export const reviewReactionOptions: readonly ReactionOption[] = [
  { id: 'helpful', label: 'Hữu ích', icon: ThumbsUp },
  { id: 'thanks', label: 'Cảm ơn', icon: Heart },
  { id: 'accurate', label: 'Chính xác', icon: BadgeCheck },
  { id: 'detailed', label: 'Chi tiết', icon: FileText },
];

type Props = {
  value: readonly ReviewReactionCount[];
  onToggle: (id: ReviewReactionId) => void;
  disabled?: boolean;
};

export function Reactions({ value, onToggle, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const shown = reviewReactionOptions.filter(option => (value.find(item => item.id === option.id)?.count ?? 0) > 0);
  const total = value.reduce((sum, item) => sum + item.count, 0);

  const toggle = (id: ReviewReactionId) => {
    void Haptics.selectionAsync();
    onToggle(id);
  };

  return (
    <View accessibilityRole="toolbar" accessibilityLabel={`Phản ứng, ${total} lượt`} style={styles.root}>
      <View style={styles.bar}>
        {shown.map(option => {
          const item = value.find(entry => entry.id === option.id);
          return <Pill key={option.id} option={option} count={item?.count ?? 0} reacted={item?.reacted ?? false} disabled={disabled} onPress={() => toggle(option.id)} />;
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thêm phản ứng"
          accessibilityState={{ expanded: open, disabled }}
          disabled={disabled}
          onPress={() => setOpen(current => !current)}
          style={[styles.add, open && styles.addOpen]}
        >
          <SmilePlus size={metrics.iconSize} color={colors.icon} strokeWidth={1.8} />
        </Pressable>
      </View>
      <Presence visible={open} style={styles.tray}>
        {reviewReactionOptions.map(option => {
          const reacted = value.find(item => item.id === option.id)?.reacted ?? false;
          const Glyph = option.icon;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: reacted }}
              onPress={() => { toggle(option.id); setOpen(false); }}
              style={[styles.choice, reacted && styles.choiceOn]}
            >
              <Glyph size={metrics.iconSize} color={reacted ? colors.reactedText : colors.icon} strokeWidth={1.8} />
              <Text style={[styles.choiceText, reacted && styles.choiceTextOn]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </Presence>
    </View>
  );
}

type PillProps = { option: ReactionOption; count: number; reacted: boolean; disabled: boolean; onPress: () => void };

function Pill({ option, count, reacted, disabled, onPress }: PillProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [scale] = useState(() => new Animated.Value(reduceMotion ? 1 : metrics.enterScale));
  const [kick] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduceMotion) return undefined;
    const motion = Animated.timing(scale, { toValue: 1, duration: metrics.enterDuration, easing: easeOut, useNativeDriver: true });
    motion.start();
    return () => motion.stop();
  }, [reduceMotion, scale]);
  useEffect(() => {
    if (reduceMotion || !reacted) return;
    Animated.sequence([
      Animated.timing(kick, { toValue: metrics.kickScale, duration: metrics.kickDuration, easing: easeOut, useNativeDriver: true }),
      Animated.timing(kick, { toValue: 1, duration: metrics.kickDuration, easing: easeOut, useNativeDriver: true }),
    ]).start();
  }, [reacted, reduceMotion, kick]);
  const Glyph = option.icon;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${option.label}, ${count} lượt${reacted ? ', gồm bạn' : ''}`}
        accessibilityState={{ selected: reacted, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.pill, reacted && styles.pillOn]}
      >
        <Animated.View style={{ transform: [{ scale: kick }] }}>
          <Glyph size={metrics.pillIcon} color={reacted ? colors.reactedText : colors.icon} strokeWidth={1.9} />
        </Animated.View>
        <RollingNumber value={count} style={[styles.count, reacted && styles.countOn]} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: metrics.gap },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: metrics.gap },
  pill: { height: metrics.pillHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.inner, paddingHorizontal: metrics.pillPadding, borderRadius: metrics.pillHeight / 2, borderWidth: metrics.edge, borderColor: colors.border, backgroundColor: colors.fill },
  pillOn: { borderColor: colors.reactedBorder, backgroundColor: colors.reactedFill },
  count: { color: colors.text, fontSize: metrics.countSize, fontWeight: '600', fontVariant: ['tabular-nums'] },
  countOn: { color: colors.reactedText },
  add: { width: metrics.pillHeight, height: metrics.pillHeight, borderRadius: metrics.pillHeight / 2, alignItems: 'center', justifyContent: 'center', borderWidth: metrics.edge, borderColor: colors.border, backgroundColor: colors.fill },
  addOpen: { backgroundColor: colors.reactedFill, borderColor: colors.reactedBorder },
  tray: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.gap, padding: metrics.trayPadding, borderRadius: metrics.trayRadius, backgroundColor: colors.trayFill },
  choice: { height: metrics.pillHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.inner, paddingHorizontal: metrics.pillPadding, borderRadius: metrics.pillHeight / 2, backgroundColor: colors.fill },
  choiceOn: { backgroundColor: colors.reactedFill },
  choiceText: { color: colors.text, fontSize: metrics.countSize, fontWeight: '500' },
  choiceTextOn: { color: colors.reactedText, fontWeight: '700' },
});
