import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

const weekdayShort: readonly string[] = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const weekdayLong: readonly string[] = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export type CalendarCell = Readonly<{ date: Date; inMonth: boolean }>;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sameDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

export function monthTitle(year: number, month: number): string {
  return `Tháng ${month + 1} năm ${year}`;
}

export function dayLabel(date: Date): string {
  return `${weekdayLong[date.getDay()]}, ${date.getDate()} tháng ${date.getMonth() + 1}`;
}

export function buildMonth(year: number, month: number): readonly (readonly CalendarCell[])[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  return Array.from({ length: metrics.calWeeks }, (_, week) => Array.from({ length: metrics.calDays }, (_, day) => {
    const date = new Date(year, month, 1 - lead + week * metrics.calDays + day);
    return { date, inMonth: date.getMonth() === month };
  }));
}

type Props = {
  value: Date | null;
  onChange: (date: Date) => void;
  today?: Date;
  minDate?: Date;
  isUnavailable?: (date: Date) => boolean;
  label?: string;
};

export function DateCalendar({ value, onChange, today = new Date(), minDate = today, isUnavailable, label = 'Chọn ngày thợ đến' }: Props) {
  const anchor = value ?? today;
  const [cursor, setCursor] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });
  const weeks = buildMonth(cursor.year, cursor.month);
  const floor = startOfDay(minDate);
  const atFloor = cursor.year * metrics.calMonths + cursor.month <= floor.getFullYear() * metrics.calMonths + floor.getMonth();
  const shift = (step: number) => setCursor(current => {
    const next = new Date(current.year, current.month + step, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });
  return <View accessibilityLabel={label} style={styles.root}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Tháng trước" accessibilityState={{ disabled: atFloor }} disabled={atFloor} onPress={() => shift(-1)} style={[styles.nav, atFloor && styles.navOff]}>
        <ChevronLeft size={metrics.inputIcon} color={colors.text}/>
      </Pressable>
      <Text accessibilityLiveRegion="polite" style={styles.title}>{monthTitle(cursor.year, cursor.month)}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Tháng sau" onPress={() => shift(1)} style={styles.nav}>
        <ChevronRight size={metrics.inputIcon} color={colors.text}/>
      </Pressable>
    </View>
    <View style={styles.row}>
      {weekdayShort.map(name => <Text key={name} style={styles.weekday}>{name}</Text>)}
    </View>
    {weeks.map((week, index) => <View key={index} style={styles.row}>
      {week.map(({ date, inMonth }) => {
        const past = date < floor;
        const busy = !past && isUnavailable?.(date) === true;
        const selected = value !== null && sameDay(date, value);
        const isToday = sameDay(date, today);
        const blocked = past || busy;
        return <Pressable
          key={date.getTime()}
          accessibilityRole="button"
          accessibilityLabel={`${dayLabel(date)}${busy ? ', thợ bận' : ''}`}
          accessibilityState={{ selected, disabled: blocked }}
          disabled={blocked}
          onPress={() => onChange(date)}
          style={[styles.cell, selected && styles.cellOn, !inMonth && styles.cellOut]}
        >
          <Text style={[styles.day, selected && styles.dayOn, past && styles.dayPast, busy && styles.dayBusy]}>{date.getDate()}</Text>
          {isToday && <View style={[styles.todayDot, selected && styles.todayDotOn]}/>}
        </Pressable>;
      })}
    </View>)}
    <Text accessibilityLiveRegion="polite" style={styles.summary}>{value === null ? 'Chưa chọn ngày' : `Thợ đến ${dayLabel(value)}`}</Text>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.calGap, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', height: metrics.calHeader, marginBottom: metrics.quarter },
  nav: { width: metrics.calNav, height: metrics.calNav, borderRadius: metrics.pillRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralBg },
  navOff: { opacity: metrics.calOffOpacity },
  title: { color: colors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  row: { flexDirection: 'row', gap: metrics.calGap },
  weekday: { width: metrics.calCell, textAlign: 'center', color: colors.faint, fontSize: metrics.calWeekday, fontWeight: metrics.titleWeight, paddingVertical: metrics.quarter },
  cell: { width: metrics.calCell, height: metrics.calCell, borderRadius: metrics.calRadius, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: colors.solidBg },
  cellOut: { opacity: metrics.calOffOpacity },
  day: { color: colors.text, fontSize: metrics.calDayFont },
  dayOn: { color: colors.solidFg, fontWeight: metrics.titleWeight },
  dayPast: { color: colors.calendarOff },
  dayBusy: { color: colors.faint, textDecorationLine: 'line-through' },
  todayDot: { position: 'absolute', bottom: metrics.calToday, width: metrics.calToday, height: metrics.calToday, borderRadius: metrics.pillRadius, backgroundColor: colors.calendarToday },
  todayDotOn: { backgroundColor: colors.solidFg },
  summary: { alignSelf: 'stretch', marginTop: metrics.rowGap, color: colors.muted, fontSize: metrics.captionSize },
});
