import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { FadeIn } from './earnings-motion';
import { Presence } from './motion-presence';
import { formatTime, nearestSlot, timeSlots, type MinuteStep, type TimeFormat } from './time-slots';

const metrics = horizonLayout.timePicker;
const colors = horizonColors.timePicker;

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  minuteStep?: MinuteStep;
  format?: TimeFormat;
  placeholder?: string;
  description?: string;
  disabled?: boolean;
};

export function TimePicker({ label, value, onChange, minuteStep = 15, format = '24h', placeholder = 'Chọn giờ', description, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);
  const slots = timeSlots(minuteStep);
  const active = nearestSlot(value, minuteStep);
  const shown = value === null ? placeholder : formatTime(value, format);

  useEffect(() => {
    if (!open) return;
    const index = active === null ? slots.indexOf('09:00') : slots.indexOf(active);
    const offset = Math.max(0, index * metrics.rowHeight - (metrics.listHeight - metrics.rowHeight) / 2);
    const frame = requestAnimationFrame(() => scroller.current?.scrollTo({ y: offset, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [open, active, slots]);

  const choose = (slot: string) => {
    void Haptics.selectionAsync();
    onChange(slot);
    setOpen(false);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        accessibilityState={{ expanded: open, disabled }}
        accessibilityHint="Mở danh sách giờ"
        disabled={disabled}
        onPress={() => setOpen(current => !current)}
        style={[styles.field, open && styles.fieldOpen, disabled && styles.disabled]}
      >
        <FadeIn key={shown} style={styles.valueWrap}>
          <Text numberOfLines={1} style={[styles.value, value === null && styles.placeholder]}>{shown}</Text>
        </FadeIn>
        <Icon name="clock" size={metrics.iconSize} color={colors.icon} />
      </Pressable>
      {description !== undefined ? <Text style={styles.description}>{description}</Text> : null}
      <Presence visible={open} style={styles.menu}>
        <ScrollView ref={scroller} accessibilityRole="list" showsVerticalScrollIndicator={false} nestedScrollEnabled style={styles.list}>
          {slots.map(slot => {
            const on = slot === active;
            return (
              <Pressable key={slot} accessibilityRole="button" accessibilityLabel={formatTime(slot, format)} accessibilityState={{ selected: on }} onPress={() => choose(slot)} style={[styles.row, on && styles.rowOn]}>
                <Text style={[styles.rowText, on && styles.rowTextOn]}>{formatTime(slot, format)}</Text>
                {on ? <Icon name="check" size={metrics.checkSize} color={colors.accent} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Presence>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: metrics.gap },
  label: { color: colors.label, fontSize: metrics.labelSize, fontWeight: '600' },
  field: { minHeight: metrics.fieldHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.gap, paddingHorizontal: metrics.fieldPadding, borderRadius: metrics.radius, borderWidth: metrics.edge, borderColor: colors.border, backgroundColor: colors.surface },
  fieldOpen: { borderColor: colors.accent },
  disabled: { opacity: 0.5 },
  valueWrap: { flex: 1, minWidth: 0 },
  value: { color: colors.text, fontSize: metrics.valueSize, fontWeight: '600', fontVariant: ['tabular-nums'] },
  placeholder: { color: colors.placeholder, fontWeight: '400' },
  description: { color: colors.label, fontSize: metrics.descriptionSize },
  menu: { borderRadius: metrics.radius, borderWidth: metrics.edge, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  list: { maxHeight: metrics.listHeight },
  row: { height: metrics.rowHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: metrics.fieldPadding },
  rowOn: { backgroundColor: colors.accentSoft },
  rowText: { color: colors.text, fontSize: metrics.valueSize, fontVariant: ['tabular-nums'] },
  rowTextOn: { fontWeight: '700' },
});
