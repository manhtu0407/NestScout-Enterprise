import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip, DateCalendar, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;
const vietnamOffsetHours = 7;
const windowDays = 60;
const dayMs = 24 * 60 * 60 * 1000;

export const visitSlots: readonly { id: string; label: string; hour: number }[] = [
  { id: 'morning', label: 'Sáng · 9:00', hour: 9 },
  { id: 'noon', label: 'Trưa · 12:00', hour: 12 },
  { id: 'afternoon', label: 'Chiều · 15:00', hour: 15 },
  { id: 'evening', label: 'Tối · 18:00', hour: 18 },
];

export function visitInstant(day: Date, hour: number): Date {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour - vietnamOffsetHours));
}

export function visitAllowed(at: Date, now: Date): boolean {
  return at.getTime() >= now.getTime() + 60 * 60 * 1000 && at.getTime() <= now.getTime() + windowDays * dayMs;
}

export function formatVisit(value: string): string {
  return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

type Props = {
  value: string | null;
  onSave: (at: Date | null) => Promise<void>;
  now?: Date;
};

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; message: string };

export function PreferredVisitPicker({ value, onSave, now = new Date() }: Props) {
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const hour = visitSlots.find(item => item.id === slot)?.hour;
  const at = day !== null && hour !== undefined ? visitInstant(day, hour) : null;
  const valid = at !== null && visitAllowed(at, now);
  const busy = status.kind === 'saving';
  const save = (next: Date | null) => {
    setStatus({ kind: 'saving' });
    onSave(next).then(() => {
      setStatus({ kind: 'saved' });
      setDay(null);
      setSlot(null);
    }, (error: unknown) => setStatus({ kind: 'failed', message: error instanceof Error ? error.message : 'Chưa lưu được thời gian mong muốn.' }));
  };
  return <View style={styles.root}>
    <Text accessibilityRole="header" style={styles.title}>Thời gian bạn mong muốn thợ đến</Text>
    <Text style={styles.caption}>{value === null ? 'Chưa chọn thời gian mong muốn.' : `Đã lưu: ${formatVisit(value)}`}</Text>
    <Text style={styles.caption}>Đây chỉ là mong muốn của bạn để thợ cân nhắc, chưa phải lịch hẹn đã được thợ xác nhận.</Text>
    <DateCalendar value={day} onChange={setDay} today={now} label="Chọn ngày mong muốn thợ đến"/>
    <View accessibilityLabel="Chọn khung giờ" style={styles.slots}>
      {visitSlots.map(item => <Chip key={item.id} label={item.label} hue="gray" selected={slot === item.id} onPress={() => setSlot(item.id)}/>)}
    </View>
    {at !== null && !valid ? <Text accessibilityLiveRegion="polite" style={styles.error}>Hãy chọn thời gian cách hiện tại ít nhất 1 giờ và trong vòng 60 ngày.</Text> : null}
    <PressScale accessibilityRole="button" accessibilityLabel="Lưu thời gian mong muốn" accessibilityState={{ disabled: !valid || busy }} disabled={!valid || busy} onPress={() => at && save(at)} style={[supportStyles.primary, (!valid || busy) && styles.disabled]}>
      <Text style={supportStyles.primaryLabel}>{busy ? 'Đang lưu…' : 'Lưu thời gian mong muốn'}</Text>
    </PressScale>
    {value !== null ? <PressScale accessibilityRole="button" accessibilityLabel="Bỏ thời gian mong muốn" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => save(null)} style={supportStyles.secondary}>
      <Text style={supportStyles.secondaryLabel}>Bỏ thời gian mong muốn</Text>
    </PressScale> : null}
    {status.kind === 'saved' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Đã lưu thời gian mong muốn.</Text> : null}
    {status.kind === 'failed' ? <Text accessibilityLiveRegion="polite" style={styles.error}>{status.message}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  title: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  caption: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.rowGap },
  disabled: { opacity: metrics.lockedOpacity },
  success: { color: colors.successFg, fontSize: metrics.captionSize },
  error: { color: colors.dangerFg, fontSize: metrics.captionSize },
});
