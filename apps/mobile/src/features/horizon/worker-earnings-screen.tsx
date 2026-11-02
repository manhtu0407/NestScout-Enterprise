import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney } from './content';
import { SlidingChips } from './sliding-chips';
import { ScreenHeader, SupportCard, SupportRow, SupportSection } from './support-shell';
import { earningsDays, earningsEntries, earningsPeriods, type EarningsPeriod } from './worker-earnings';

const metrics = horizonLayout.workerEarnings;
const colors = horizonColors.workerEarnings;
const jobs = horizonLayout.workerJobs;
const card = horizonLayout.requestsScreen;
const support = horizonLayout.supportScreens;

export type EarningsMode = 'overview' | 'payout';

const modes: readonly { mode: EarningsMode; label: string }[] = [
  { mode: 'overview', label: 'Thu nhập' },
  { mode: 'payout', label: 'Rút tiền' },
];

const peakMinor = Math.max(...earningsDays.map(day => day.amountMinor));

function barHeight(amountMinor: number): number {
  if (peakMinor <= 0) return metrics.barMinHeight;
  return Math.max(metrics.barMinHeight, (amountMinor / peakMinor) * metrics.chartHeight);
}

type Props = { initialMode: EarningsMode; onBack: () => void };

export function WorkerEarningsScreen({ initialMode, onBack }: Props) {
  const [mode, setMode] = useState(initialMode);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ScreenHeader title="Thu nhập" onBack={onBack} />
      </View>
      <View style={styles.modes}>
        <SlidingChips items={modes.map(item => ({ key: item.mode, label: item.label }))} selectedKey={mode} onSelect={key => { const next = modes.find(item => item.mode === key); if (next) setMode(next.mode); }} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {mode === 'overview' ? <Overview /> : <Payout />}
        <Text style={styles.footnote}>Dữ liệu mẫu. Chưa có thanh toán nào được xác nhận nên đây không phải tiền đã nhận.</Text>
      </ScrollView>
    </View>
  );
}

function Overview() {
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const info = earningsPeriods.find(item => item.period === period) ?? earningsPeriods[0];
  const entries = period === 'today' ? earningsEntries.filter(entry => entry.today) : earningsEntries;
  return (
    <>
      <SlidingChips inset={false} items={earningsPeriods.map(item => ({ key: item.period, label: item.label }))} selectedKey={period} onSelect={key => { const next = earningsPeriods.find(item => item.period === key); if (next) setPeriod(next.period); }} />
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{info?.caption}</Text>
        <Text accessibilityLabel={`${info?.caption} ${formatMoney(info?.totalMinor ?? 0, 'VND')}`} style={styles.heroAmount}>{formatMoney(info?.totalMinor ?? 0, 'VND')}</Text>
        <Text style={styles.heroMeta}>{info?.jobCount} việc khách đã nghiệm thu. Chưa xác nhận thanh toán.</Text>
      </View>
      <View style={styles.chart}>
        <Text style={styles.chartTitle}>Giá trị việc đã nghiệm thu, 7 ngày gần nhất</Text>
        <View style={styles.bars}>
          {earningsDays.map(day => {
            const height = barHeight(day.amountMinor);
            return (
              <View key={day.label} accessibilityLabel={`${day.label}, ${formatMoney(day.amountMinor, 'VND')}`} style={styles.barColumn}>
                <View style={[styles.bar, day.today && styles.barToday, { height }]} />
                <Text style={[styles.barLabel, day.today && styles.barLabelToday]}>{day.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <SupportSection title="Việc khách đã nghiệm thu">
        {entries.length > 0 ? (
          <SupportCard>
            {entries.map(entry => (
              <SupportRow key={entry.id} icon="check" title={entry.title} detail={`${entry.dayLabel} · chưa xác nhận thanh toán`} trailing={<Text style={styles.entryAmount}>{formatMoney(entry.amountMinor, 'VND')}</Text>} />
            ))}
          </SupportCard>
        ) : (
          <Text style={styles.footnote}>Chưa có việc nào được khách nghiệm thu.</Text>
        )}
      </SupportSection>
    </>
  );
}

function Payout() {
  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Số dư có thể rút</Text>
        <Text accessibilityLabel="Số dư có thể rút, chưa có" style={styles.heroAmount}>Chưa có</Text>
        <Text style={styles.heroMeta}>Việc được khách nghiệm thu chưa tạo ra số dư.</Text>
      </View>
      <SupportSection title="Điều kiện để rút tiền">
        <SupportCard>
          <SupportRow icon="receipt" title="Xác nhận thanh toán" detail="Chưa kết nối" />
          <SupportRow icon="wallet" title="Tài khoản ngân hàng" detail="Chưa liên kết" />
          <SupportRow icon="help" title="Quy trình chi trả" detail="Chưa được phê duyệt" />
        </SupportCard>
      </SupportSection>
      <PressScale accessibilityRole="button" accessibilityLabel="Gửi yêu cầu rút tiền, chưa khả dụng" accessibilityState={{ disabled: true }} disabled onPress={() => undefined} style={[styles.primary, styles.disabled]}>
        <Text style={styles.primaryLabel}>Gửi yêu cầu rút tiền</Text>
      </PressScale>
      <View style={styles.note}>
        <Icon name="clock" size={jobs.noticeIconSize} color={horizonColors.muted} />
        <Text style={styles.noteText}>Việc hoàn tất không có nghĩa là đã được thanh toán. Rút tiền chỉ mở khi thanh toán được xác nhận và quy trình chi trả được phê duyệt.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: card.paddingHorizontal },
  modes: { marginTop: jobs.chipsMarginTop },
  list: { flex: 1 },
  listContent: { gap: card.listGap, paddingHorizontal: card.paddingHorizontal, paddingTop: card.listPaddingTop, paddingBottom: card.listPaddingBottom },
  hero: { gap: metrics.heroGap, padding: support.heroPadding, borderRadius: support.heroRadius, backgroundColor: colors.heroFill },
  heroLabel: { color: colors.heroLabel, fontSize: metrics.heroLabelSize, fontWeight: card.stepCaptionWeight },
  heroAmount: { color: colors.heroAmount, fontSize: metrics.heroAmountSize, fontWeight: metrics.heroAmountWeight, letterSpacing: metrics.heroAmountTracking, fontVariant: ['tabular-nums'] },
  heroMeta: { color: colors.heroMeta, fontSize: metrics.heroMetaSize },
  chart: { gap: metrics.chartTitleGap, padding: metrics.chartPadding, borderRadius: card.cardRadius, backgroundColor: colors.chartFill },
  chartTitle: { color: colors.chartTitle, fontSize: metrics.chartTitleSize, fontWeight: metrics.chartTitleWeight },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: metrics.chartGap },
  barColumn: { flex: 1, minWidth: 0, justifyContent: 'flex-end', alignItems: 'stretch', gap: metrics.barLabelGap },
  bar: { borderRadius: metrics.barRadius, backgroundColor: colors.barFill },
  barToday: { backgroundColor: colors.barToday },
  barLabel: { color: colors.barLabel, fontSize: metrics.barLabelSize, textAlign: 'center' },
  barLabelToday: { color: colors.barLabelToday, fontWeight: metrics.chartTitleWeight },
  entryAmount: { color: colors.amount, fontSize: metrics.listAmountSize, fontWeight: metrics.listAmountWeight, fontVariant: ['tabular-nums'] },
  primary: { height: support.primaryHeight, borderRadius: support.primaryRadius, backgroundColor: horizonColors.supportScreens.primaryFill, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: horizonColors.supportScreens.primaryLabel, fontSize: support.primarySize, fontWeight: support.primaryWeight },
  disabled: { opacity: jobs.disabledOpacity },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: jobs.noticeGap },
  noteText: { flex: 1, minWidth: 0, color: horizonColors.muted, fontSize: jobs.footnoteSize, lineHeight: jobs.footnoteLineHeight },
  footnote: { color: horizonColors.muted, fontSize: jobs.footnoteSize, lineHeight: jobs.footnoteLineHeight, textAlign: 'center' },
});
