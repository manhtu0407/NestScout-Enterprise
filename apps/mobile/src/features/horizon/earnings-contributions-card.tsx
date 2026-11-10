import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { activityGrid, activityLevel, activityRanges, activityStats, activityTotal, formatDayKey, spacedMonthLabels, type ActivityRange } from './earnings-activity';
import { FadeIn } from './earnings-motion';
import { EarningsSegments } from './earnings-segments';
import type { EarningsView } from './worker-earnings';

const metrics = horizonLayout.workerEarnings;
const colors = horizonColors.workerEarnings;
const maxCell = 40;
const monthLabelSpan = 40;
const minScrollCell = 12;
const rowLabelWidth = 32;
const rowLabels = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'] as const;
const levelColors = [colors.plotTrack, colors.heat1, colors.heat2, colors.heat3, colors.heat4] as const;

type Props = { earnings: EarningsView };

export function EarningsContributionsCard({ earnings }: Props) {
  const [range, setRange] = useState<ActivityRange>('quarter');
  const [picked, setPicked] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const weeks = activityRanges.find(item => item.range === range)?.weeks ?? 13;
  const columns = activityGrid(earnings.activity, earnings.todayKey, weeks);
  const stats = activityStats(earnings.activity, earnings.todayKey);
  const total = activityTotal(columns);
  const showRows = range !== 'year';
  const gap = weeks > 20 ? 2 : weeks > 8 ? 4 : 6;
  const available = Math.max(0, width - (showRows ? rowLabelWidth + 8 : 0));
  const fitCell = Math.floor((available - (weeks - 1) * gap) / weeks);
  const cell = Math.max(minScrollCell, Math.min(maxCell, fitCell));
  const scroller = useRef<ScrollViewInstance>(null);
  const selectedKey = picked ?? earnings.todayKey;
  const selectedCount = earnings.activity[selectedKey] ?? 0;
  const showNumbers = cell >= 26;
  const monthLabels = spacedMonthLabels(columns, Math.ceil(monthLabelSpan / (cell + gap)) - 1, Math.ceil(monthLabelSpan / (cell + gap)));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.caption}>Việc đã xử lý</Text>
        <View style={styles.amountRow}>
          <Text accessibilityLabel={`${total} việc đã xử lý trong khoảng đang chọn`} style={styles.amount}>{total}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Hôm nay {stats.today}</Text>
          </View>
        </View>
      </View>
      <View style={styles.stats}>
        <Stat label="Tổng việc" value={String(stats.total)} />
        <Stat label="Chuỗi dài" value={`${stats.longestStreak} ngày`} />
        <Stat label="Cao nhất" value={stats.busiestKey === null ? '—' : `${stats.busiestCount} việc`} />
      </View>
      <EarningsSegments items={activityRanges.map(item => ({ key: item.range, label: item.label }))} selected={range} onSelect={setRange} />
      <View style={styles.readout}>
        <Text style={styles.readoutLabel}>{formatDayKey(selectedKey)}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.readoutValue}>{selectedCount} việc</Text>
      </View>
      <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.gridWrap}>
        {width > 0 ? (
          <FadeIn key={range} style={styles.gridRow}>
            {showRows ? (
              <View style={[styles.rowLabels, { width: rowLabelWidth, marginTop: 18, gap }]}>
                {rowLabels.map((label, index) => (
                  <View key={index} style={{ height: cell, justifyContent: 'center' }}>
                    <Text style={styles.rowLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })} style={styles.scroller}>
             <View>
              <View style={styles.months}>
                {monthLabels.map((label, index) => (
                  label === null ? null : <Text key={index} numberOfLines={1} style={[styles.month, { left: index * (cell + gap) }]}>{label}</Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap }}>
                {columns.map((column, index) => (
                  <View key={index} style={{ gap }}>
                    {column.cells.map(item => {
                      if (item.future) return <View key={item.key} style={{ width: cell, height: cell }} />;
                      const level = activityLevel(item.count);
                      const active = item.key === selectedKey;
                      return (
                        <Pressable
                          key={item.key}
                          accessibilityRole="button"
                          accessibilityLabel={`${formatDayKey(item.key)}, ${item.count} việc`}
                          accessibilityState={{ selected: active }}
                          onPress={() => setPicked(item.key)}
                          style={({ pressed }) => [{ width: cell, height: cell, borderRadius: Math.max(2, Math.round(cell / 4)), backgroundColor: levelColors[level], alignItems: 'center', justifyContent: 'center' }, active && styles.cellActive, pressed && styles.cellPressed]}
                        >
                          {showNumbers && item.count > 0 ? <Text style={[styles.cellText, level >= 3 && styles.cellTextOn]}>{item.count}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
             </View>
            </ScrollView>
          </FadeIn>
        ) : null}
      </View>
      <View style={styles.legend}>
        <Text style={styles.legendText}>Ít</Text>
        {levelColors.map((color, index) => <View key={index} style={[styles.legendCell, { backgroundColor: color }]} />)}
        <Text style={styles.legendText}>Nhiều</Text>
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
  caption: { color: colors.heroLabel, fontSize: metrics.heroLabelSize, fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  amount: { color: colors.heroAmount, fontSize: metrics.heroAmountSize, fontWeight: metrics.heroAmountWeight, letterSpacing: metrics.heroAmountTracking, fontVariant: ['tabular-nums'] },
  pill: { height: metrics.deltaHeight, borderRadius: metrics.deltaRadius, paddingHorizontal: metrics.deltaPaddingHorizontal, backgroundColor: colors.deltaFill, justifyContent: 'center' },
  pillText: { color: colors.deltaText, fontSize: metrics.deltaSize, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: metrics.statGap },
  stat: { flex: 1, minWidth: 0, gap: 4, alignItems: 'center', justifyContent: 'center', padding: metrics.statPadding, borderRadius: metrics.statRadius, backgroundColor: colors.statFill },
  statLabel: { color: colors.statLabel, fontSize: metrics.statLabelSize, textAlign: 'center' },
  statValue: { color: colors.statValue, fontSize: metrics.statValueSize, fontWeight: '600', fontVariant: ['tabular-nums'], textAlign: 'center' },
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  readoutLabel: { color: colors.axisLabel, fontSize: metrics.axisSize },
  readoutValue: { color: colors.heroAmount, fontSize: metrics.statValueSize, fontWeight: '600', fontVariant: ['tabular-nums'] },
  gridWrap: { alignItems: 'center' },
  gridRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  scroller: { flex: 1 },
  rowLabels: { justifyContent: 'flex-start' },
  rowLabel: { color: colors.axisLabel, fontSize: 10 },
  months: { height: 18, position: 'relative' },
  month: { position: 'absolute', top: 0, color: colors.axisLabel, fontSize: 10 },
  cellPressed: { transform: [{ scale: metrics.pressScale }] },
  cellActive: { borderWidth: 2, borderColor: colors.heroAmount },
  cellText: { color: colors.heroAmount, fontSize: 12, fontWeight: '600' },
  cellTextOn: { color: '#FFFFFF' },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  legendText: { color: colors.axisLabel, fontSize: 10 },
  legendCell: { width: 12, height: 12, borderRadius: 3 },
});
