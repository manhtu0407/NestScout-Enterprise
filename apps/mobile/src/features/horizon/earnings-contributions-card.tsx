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
const grid = horizonLayout.earningsContributionsCardStyle;
const rowLabels = ['T2', '', 'T4', '', 'T6', '', 'CN'] as const;
const levelColors = [colors.plotTrack, colors.heat1, colors.heat2, colors.heat3, colors.heat4] as const;

type Props = { earnings: EarningsView };

function rowLabelsVisible(range: ActivityRange): boolean {
  return range !== 'year';
}

function gridGap(weeks: number): number {
  return weeks > grid.gridDenseWeeks ? grid.gridGapDense : weeks > grid.gridMediumWeeks ? grid.gridGapMedium : grid.gridGapWide;
}

function gridCell(width: number, weeks: number, showRows: boolean): number {
  const available = Math.max(0, width - (showRows ? grid.gridRowLabelWidth + grid.gridRowLabelGutter : 0));
  const fit = Math.floor((available - (weeks - 1) * gridGap(weeks)) / weeks);
  return Math.max(grid.gridMinScrollCell, Math.min(grid.gridMaxCell, fit));
}

function cellRadius(cell: number): number {
  return Math.max(grid.gridCellRadiusMin, Math.round(cell / grid.gridCellRadiusDivisor));
}

export function EarningsContributionsCard({ earnings }: Props) {
  const [range, setRange] = useState<ActivityRange>('quarter');
  const [picked, setPicked] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const weeks = activityRanges.find(item => item.range === range)?.weeks ?? grid.gridDefaultWeeks;
  const columns = activityGrid(earnings.activity, earnings.todayKey, weeks);
  const stats = activityStats(earnings.activity, earnings.todayKey);
  const total = activityTotal(columns);
  const showRows = rowLabelsVisible(range);
  const gap = gridGap(weeks);
  const cell = gridCell(width, weeks, showRows);
  const scroller = useRef<ScrollViewInstance>(null);
  const selectedKey = picked ?? earnings.todayKey;
  const selectedCount = earnings.activity[selectedKey] ?? 0;
  const showNumbers = cell >= grid.gridNumbersMinCell;
  const monthLabels = spacedMonthLabels(columns, Math.ceil(grid.gridMonthLabelSpan / (cell + gap)) - 1, Math.ceil(grid.gridMonthLabelSpan / (cell + gap)));

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
              <View style={[styles.rowLabels, { width: grid.gridRowLabelWidth, marginTop: horizonLayout.earningsContributionsCardStyle.inlineMarginTop, gap }]}>
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
                          style={({ pressed }) => [{ width: cell, height: cell, borderRadius: cellRadius(cell), backgroundColor: levelColors[level], alignItems: 'center', justifyContent: 'center' }, active && styles.cellActive, pressed && styles.cellPressed]}
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
  caption: { color: colors.heroLabel, fontSize: metrics.heroLabelSize, fontWeight: horizonLayout.earningsContributionsCardStyle.captionFontWeight },
  amountRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: horizonLayout.earningsContributionsCardStyle.amountRowGap },
  amount: { color: colors.heroAmount, fontSize: metrics.heroAmountSize, fontWeight: metrics.heroAmountWeight, letterSpacing: metrics.heroAmountTracking, fontVariant: ['tabular-nums'] },
  pill: { height: metrics.deltaHeight, borderRadius: metrics.deltaRadius, paddingHorizontal: metrics.deltaPaddingHorizontal, backgroundColor: colors.deltaFill, justifyContent: 'center' },
  pillText: { color: colors.deltaText, fontSize: metrics.deltaSize, fontWeight: horizonLayout.earningsContributionsCardStyle.pillTextFontWeight },
  stats: { flexDirection: 'row', gap: metrics.statGap },
  stat: { flex: 1, minWidth: 0, gap: horizonLayout.earningsContributionsCardStyle.statGap, alignItems: 'center', justifyContent: 'center', padding: metrics.statPadding, borderRadius: metrics.statRadius, backgroundColor: colors.statFill },
  statLabel: { color: colors.statLabel, fontSize: metrics.statLabelSize, textAlign: 'center' },
  statValue: { color: colors.statValue, fontSize: metrics.statValueSize, fontWeight: horizonLayout.earningsContributionsCardStyle.statValueFontWeight, fontVariant: ['tabular-nums'], textAlign: 'center' },
  readout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: horizonLayout.earningsContributionsCardStyle.readoutGap },
  readoutLabel: { color: colors.axisLabel, fontSize: metrics.axisSize },
  readoutValue: { color: colors.heroAmount, fontSize: metrics.statValueSize, fontWeight: horizonLayout.earningsContributionsCardStyle.readoutValueFontWeight, fontVariant: ['tabular-nums'] },
  gridWrap: { alignItems: 'center' },
  gridRow: { flexDirection: 'row', gap: horizonLayout.earningsContributionsCardStyle.gridRowGap, alignSelf: 'stretch' },
  scroller: { flex: 1 },
  rowLabels: { justifyContent: 'flex-start' },
  rowLabel: { color: colors.axisLabel, fontSize: horizonLayout.earningsContributionsCardStyle.rowLabelFontSize },
  months: { height: horizonLayout.earningsContributionsCardStyle.monthsHeight, position: 'relative' },
  month: { position: 'absolute', top: 0, color: colors.axisLabel, fontSize: horizonLayout.earningsContributionsCardStyle.monthFontSize },
  cellPressed: { transform: [{ scale: metrics.pressScale }] },
  cellActive: { borderWidth: horizonLayout.earningsContributionsCardStyle.cellActiveBorderWidth, borderColor: colors.heroAmount },
  cellText: { color: colors.heroAmount, fontSize: horizonLayout.earningsContributionsCardStyle.cellTextFontSize, fontWeight: horizonLayout.earningsContributionsCardStyle.cellTextFontWeight },
  cellTextOn: { color: horizonColors.earningsContributionsCardStyle.cellTextOnColor },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: horizonLayout.earningsContributionsCardStyle.legendGap },
  legendText: { color: colors.axisLabel, fontSize: horizonLayout.earningsContributionsCardStyle.legendTextFontSize },
  legendCell: { width: horizonLayout.earningsContributionsCardStyle.legendCellWidth, height: horizonLayout.earningsContributionsCardStyle.legendCellHeight, borderRadius: horizonLayout.earningsContributionsCardStyle.legendCellBorderRadius },
});
