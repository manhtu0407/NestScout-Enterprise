import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { formatSentAt } from './message-time';

const metrics = horizonLayout.chatHistory;
const composer = horizonLayout.chatComposer;
const colors = horizonColors.chatHistory;

export type ChatHistoryEntry = { id: string; text: string; sentAt?: number };

export function recentQuestions(messages: readonly { id: string; role: 'user' | 'assistant'; text: string; sentAt?: number }[]): ChatHistoryEntry[] {
  const seen = new Set<string>();
  const entries: ChatHistoryEntry[] = [];
  for (let index = messages.length - 1; index >= 0 && entries.length < metrics.maxItems; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'user') continue;
    const text = message.text.trim();
    if (text === '' || seen.has(text)) continue;
    seen.add(text);
    entries.push({ id: message.id, text, sentAt: message.sentAt });
  }
  return entries;
}

type Props = { entries: readonly ChatHistoryEntry[]; onPick: (text: string) => void; disabled?: boolean };

type Anchor = { right: number; bottom: number };

export function ChatHistory({ entries, onPick, disabled = false }: Props) {
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  if (entries.length === 0) return null;
  const open = () => {
    setAnchor({ right: metrics.edgeGap, bottom: metrics.fallbackBottom });
    trigger.current?.measureInWindow((x, y, width) => {
      const window = Dimensions.get('window');
      const widest = window.width - metrics.menuWidth - metrics.edgeGap;
      setAnchor({ right: Math.max(metrics.edgeGap, Math.min(window.width - x - width, widest)), bottom: window.height - y + metrics.anchorGap });
    });
  };
  const close = () => setAnchor(null);
  return <>
    <View ref={trigger} collapsable={false}>
      <PressScale accessibilityRole="button" accessibilityLabel="Lịch sử câu hỏi" accessibilityHint="Chọn lại một câu hỏi trước đó" accessibilityState={{ expanded: anchor !== null, disabled }} disabled={disabled} hitSlop={metrics.triggerHitSlop} onPress={open} style={styles.trigger}>
        <Icon name="history" size={composer.mediaIconSize} strokeWidth={composer.mediaIconStroke} color={horizonColors.chatComposer.mediaIcon}/>
      </PressScale>
    </View>
    {anchor && <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng lịch sử câu hỏi" onPress={close} style={styles.scrim}/>
      <View accessibilityRole="menu" accessibilityLabel="Lịch sử câu hỏi" pointerEvents="box-none" style={[styles.menu, anchor]}>
        <Text style={styles.header}>GẦN ĐÂY</Text>
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {entries.map(entry => <Pressable
            key={entry.id}
            accessibilityRole="menuitem"
            accessibilityLabel={entry.text}
            onPress={() => { close(); onPick(entry.text); }}
            style={({ hovered }: { hovered?: boolean }) => [styles.row, hovered && styles.rowActive]}
          >
            <View style={styles.iconSlot}>
              <Icon name="history" size={metrics.iconSize} strokeWidth={metrics.iconStroke} color={colors.icon}/>
            </View>
            <View style={styles.copy}>
              <Text numberOfLines={metrics.textLines} style={styles.text}>{entry.text}</Text>
              {entry.sentAt !== undefined && <Text style={styles.time}>{formatSentAt(entry.sentAt)}</Text>}
            </View>
          </Pressable>)}
        </ScrollView>
      </View>
    </Modal>}
  </>;
}

const styles = StyleSheet.create({
  trigger: { height: composer.mediaSize, width: composer.mediaSize, borderRadius: composer.mediaRadius, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  menu: { position: 'absolute', width: metrics.menuWidth, padding: metrics.menuPadding, borderRadius: metrics.menuRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.menuBorder, backgroundColor: colors.menuSurface, boxShadow: colors.menuShadow },
  header: { paddingHorizontal: metrics.headerPaddingHorizontal, paddingTop: metrics.headerPaddingTop, paddingBottom: metrics.headerPaddingBottom, color: colors.header, fontSize: metrics.headerFontSize, fontWeight: metrics.headerFontWeight, letterSpacing: metrics.headerTracking },
  list: { maxHeight: metrics.menuMaxHeight },
  row: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, padding: metrics.rowPadding, borderRadius: metrics.rowRadius },
  rowActive: { backgroundColor: colors.rowActive },
  iconSlot: { width: metrics.iconSlot, height: metrics.iconSlot, borderRadius: metrics.iconSlotRadius, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: metrics.copyGap },
  text: { color: colors.text, fontSize: metrics.textFontSize, lineHeight: metrics.textLineHeight },
  time: { color: colors.time, fontSize: metrics.timeFontSize },
});
