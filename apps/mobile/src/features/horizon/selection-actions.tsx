import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputSelectionChangeEvent } from 'react-native';
import { AlignLeft, BookOpen, Languages, Minimize2, Sparkles } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;
const webReset = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0, cursor: 'text', scrollbarWidth: 'none' } as const, default: undefined });

export type SelectionAction = 'explain' | 'improve' | 'shorten' | 'tone' | 'grammar';

export type SelectionRange = Readonly<{ start: number; end: number }>;

export const selectionActions: readonly Readonly<{ id: SelectionAction; label: string; icon: LucideIcon }>[] = [
  { id: 'explain', label: 'Giải thích', icon: BookOpen },
  { id: 'improve', label: 'Cải thiện', icon: Sparkles },
  { id: 'shorten', label: 'Rút gọn', icon: Minimize2 },
  { id: 'tone', label: 'Giọng điệu', icon: Languages },
  { id: 'grammar', label: 'Ngữ pháp', icon: AlignLeft },
];

const verbs: Readonly<Record<SelectionAction, string>> = {
  explain: 'Giải thích',
  improve: 'Cải thiện',
  shorten: 'Rút gọn',
  tone: 'Đổi giọng điệu',
  grammar: 'Sửa ngữ pháp',
};

export function selectedText(text: string, range: SelectionRange): string {
  return text.slice(Math.min(range.start, range.end), Math.max(range.start, range.end)).trim();
}

export function selectionPrompt(action: SelectionAction, text: string): string {
  return `${verbs[action]} đoạn: “${text}”`;
}

type Props = {
  text: string;
  onAction: (action: SelectionAction, selection: string) => void;
};

export function SelectionActions({ text, onAction }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [range, setRange] = useState<SelectionRange>({ start: 0, end: 0 });
  const [sent, setSent] = useState<string | null>(null);
  const [show] = useState(() => new Animated.Value(0));
  const picked = selectedText(text, range);
  const visible = picked !== '';
  useEffect(() => {
    if (reduceMotion) {
      show.setValue(visible ? 1 : 0);
      return;
    }
    const run = Animated.timing(show, { toValue: visible ? 1 : 0, duration: metrics.selectionEnter, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [reduceMotion, show, visible]);
  const lift = show.interpolate({ inputRange: [0, 1], outputRange: [metrics.selectionLift, 0] });
  const track = (event: TextInputSelectionChangeEvent) => {
    setRange(event.nativeEvent.selection);
    setSent(null);
  };
  const choose = (action: SelectionAction) => {
    setSent(selectionPrompt(action, picked));
    onAction(action, picked);
  };
  return <View style={styles.root}>
    <TextInput
      accessibilityLabel="Đoạn văn có thể bôi đen"
      multiline
      editable={false}
      value={text}
      onSelectionChange={track}
      selectionColor={colors.accentSoft}
      style={[styles.text, webReset]}
    />
    {visible && <Animated.View accessibilityRole="toolbar" accessibilityLabel="Hành động với đoạn đã chọn" style={[styles.bar, { opacity: show, transform: [{ translateY: lift }] }]}>
      {selectionActions.map(({ id, label, icon: Glyph }) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label} onPress={() => choose(id)} style={styles.action}>
        <Glyph size={metrics.selectionIcon} color={colors.text}/>
        <Text style={styles.actionText}>{label}</Text>
      </Pressable>)}
    </Animated.View>}
    {sent !== null && <Text accessibilityLiveRegion="polite" style={styles.sent}>Đã gửi cho Kael: {sent}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.gap },
  text: { minHeight: metrics.selectionMin, padding: metrics.taskPadding, borderRadius: metrics.radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: metrics.bodySize, lineHeight: metrics.bodyLine },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', gap: metrics.quarter, padding: metrics.selectionPad, borderRadius: metrics.selectionBarRadius, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, boxShadow: metrics.selectionShadow },
  action: { flexDirection: 'row', alignItems: 'center', gap: metrics.quarter, height: metrics.selectionButtonHeight, paddingHorizontal: metrics.taskGap, borderRadius: metrics.smallRadius },
  actionText: { color: colors.text, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  sent: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
});
