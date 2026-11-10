import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney } from './content';
import { compactMoney, niceCeiling } from './earnings-scale';
import { GrowUp } from './earnings-motion';
import { EarningsSegments } from './earnings-segments';
import type { EarningsPeriod, EarningsView } from './worker-earnings';

const metrics = horizonLayout.workerEarnings;
const colors = horizonColors.workerEarnings;

type Props = { earnings: EarningsView };

export function EarningsChartCard({ earnings }: Props) {
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const [picked, setPicked] = useState<number | null>(null);
  const info = earnings.periods.find(item => item.period === period) ?? earnings.periods[0];
  const days = earnings.days;
  const peak = Math.max(0, ...days.map(day => day.amountMinor));
  const top = niceCeiling(peak);
  const ticks = [top, top / 2, 0];
  const todayIndex = days.findIndex(day => day.today);
  const selectedIndex = picked ?? (todayIndex >= 0 ? todayIndex : days.length - 1);
  const selected = days[selectedIndex];
  const best = peak > 0 ? days.find(day => day.amountMinor === peak) : undefined;
  const total = info?.totalMinor ?? 0;
  const count = info?.jobCount ?? 0;
  const average = count > 0 ? Math.round(total / count) : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.caption}>{info?.caption}</Text>
        <View style={styles.amountRow}>
          <Text accessibilityLabel={`${info?.caption} ${formatMoney(total, 'VND')}`} style={styles.amount}>{formatMoney(total, 'VND')}</Text>
          <View style={styles.delta}>
            <Text style={styles.deltaText}>{count} việc</Text>
          </View>
        </View>
      </View>
      <EarningsSegments items={earnings.periods.map(item => ({ key: item.period, label: item.label }))} selected={period} onSelect={key => setPeriod(key)} />
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>7 ngày gần nhất</Text>
        <Text accessibilityLiveRegion="polite" style={styles.readoutValue}>{selected ? `${selected.label} · ${formatMoney(selected.amountMinor, 'VND')}` : ''}</Text>
      </View>
      <View style={styles.plot}>
        <View style={styles.axis}>
          {ticks.map(tick => (
            <Text key={tick} style={styles.axisLabel}>{compactMoney(tick)}</Text>
          ))}
        </View>
        <View style={styles.columns}>
          {days.map((day, index) => {
            const active = index === selectedIndex;
            const fill = day.amountMinor > 0 ? Math.max(metrics.barMinHeight, (day.amountMinor / top) * metrics.plotHeight) : 0;
            return (
              <Pressable key={`${index}-${day.label}`} accessibilityRole="button" accessibilityLabel={`${day.label}, ${formatMoney(day.amountMinor, 'VND')}`} accessibilityState={{ selected: active }} onPress={() => setPicked(index)} style={styles.column}>
                <View style={styles.track}>
                  <GrowUp index={index} style={[styles.fill, active && styles.fillActive, { height: fill }]} />
                </View>
                <Text style={[styles.columnLabel, active && styles.columnLabelActive]}>{day.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label="Số việc" value={String(count)} />
        <Stat label="TB mỗi việc" value={average === null ? '—' : formatMoney(average, 'VND')} />
        <Stat label="Ngày cao nhất" value={best ? `${best.label} · ${compactMoney(best.amountMinor)}` : '—'} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={styles.stat}>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: metrics.cardGap, padding: metrics.cardPadding, borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill },
  head: { gap: metrics.heroGap },
  caption: { color: colors.heroLabel, fontSize: metrics.heroLabelSize, fontWeight: horizonLayout.earningsChartCardStyle.captionFontWeight },
  amountRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: horizonLayout.earningsChartCardStyle.amountRowGap },
  amount: { color: colors.heroAmount, fontSize: metrics.heroAmountSize, fontWeight: metrics.heroAmountWeight, letterSpacing: metrics.heroAmountTracking, fontVariant: ['tabular-nums'] },
  delta: { height: metrics.deltaHeight, borderRadius: metrics.deltaRadius, paddingHorizontal: metrics.deltaPaddingHorizontal, backgroundColor: colors.deltaFill, justifyContent: 'center' },
  deltaText: { color: colors.deltaText, fontSize: metrics.deltaSize, fontWeight: horizonLayout.earningsChartCardStyle.deltaTextFontWeight },
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: horizonLayout.earningsChartCardStyle.readoutGap },
  readoutLabel: { color: colors.axisLabel, fontSize: metrics.axisSize },
  readoutValue: { color: colors.heroAmount, fontSize: metrics.statValueSize, fontWeight: horizonLayout.earningsChartCardStyle.readoutValueFontWeight, fontVariant: ['tabular-nums'] },
  plot: { flexDirection: 'row', alignItems: 'flex-start', gap: metrics.plotGap },
  axis: { width: metrics.axisWidth, height: metrics.plotHeight, justifyContent: 'space-between' },
  axisLabel: { color: colors.axisLabel, fontSize: metrics.axisSize, fontVariant: ['tabular-nums'], lineHeight: horizonLayout.earningsChartCardStyle.axisLabelLineHeight },
  columns: { flex: 1, minWidth: 0, flexDirection: 'row', gap: metrics.columnGap },
  column: { flex: 1, minWidth: 0, gap: metrics.barLabelGap, alignItems: 'stretch' },
  track: { height: metrics.plotHeight, borderRadius: metrics.columnRadius, backgroundColor: colors.plotTrack, justifyContent: 'flex-end', overflow: 'hidden' },
  fill: { borderRadius: metrics.columnRadius, backgroundColor: colors.plotBar },
  fillActive: { backgroundColor: colors.plotBarActive },
  columnLabel: { color: colors.axisLabel, fontSize: metrics.barLabelSize, textAlign: 'center' },
  columnLabelActive: { color: colors.heroAmount, fontWeight: horizonLayout.earningsChartCardStyle.columnLabelActiveFontWeight },
  stats: { flexDirection: 'row', gap: metrics.statGap },
  stat: { flex: 1, minWidth: 0, gap: horizonLayout.earningsChartCardStyle.statGap, alignItems: 'center', justifyContent: 'center', padding: metrics.statPadding, borderRadius: metrics.statRadius, backgroundColor: colors.statFill },
  statLabel: { color: colors.statLabel, fontSize: metrics.statLabelSize, textAlign: 'center' },
  statValue: { color: colors.statValue, fontSize: metrics.statValueSize, fontWeight: horizonLayout.earningsChartCardStyle.statValueFontWeight, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
