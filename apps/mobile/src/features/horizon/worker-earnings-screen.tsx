import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { StorageSource } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney } from './content';
import { EarningsChartCard } from './earnings-chart-card';
import { EarningsContributionsCard } from './earnings-contributions-card';
import { ScreenHeader, SupportCard, SupportRow, SupportSection } from './support-shell';
import { ActionButton } from './worker-action-button';
import { WorkerPayoutSection } from './worker-payout-section';
import type { WorkerPayoutPerform, WorkerPayoutView } from './worker-payout';
import type { EarningsView } from './worker-earnings';

const metrics = horizonLayout.workerEarnings;
const colors = horizonColors.workerEarnings;
const jobs = horizonLayout.workerJobs;
const card = horizonLayout.requestsScreen;

export type EarningsMode = 'overview' | 'payout';

type Props = {
  initialMode: EarningsMode;
  earnings: EarningsView;
  payout: WorkerPayoutView | null;
  performPayout: WorkerPayoutPerform;
  loadQr?: (path: string, version: string, signal: AbortSignal) => Promise<StorageSource>;
  sample?: boolean;
  onBack: () => void;
};

type PayoutStep = { icon: 'receipt' | 'wallet' | 'help'; title: string; detail: string; state: string; done: boolean };

function payoutSteps(payout: WorkerPayoutView | null): readonly PayoutStep[] {
  return [
    { icon: 'receipt', title: 'Xác nhận thanh toán', detail: 'Khách thanh toán và hệ thống ghi nhận', state: 'Chưa kết nối', done: false },
    { icon: 'wallet', title: 'Tài khoản ngân hàng', detail: payout === null ? 'Nơi nhận tiền khi rút' : `${payout.bankName} · ${payout.accountHolder}`, state: payout === null ? 'Chưa liên kết' : payout.statusLabel, done: payout?.status === 'verified' },
    { icon: 'help', title: 'Quy trình chi trả', detail: 'Được NestScout phê duyệt', state: 'Chưa duyệt', done: false },
  ];
}

export function WorkerEarningsScreen({ initialMode, earnings, payout, performPayout, loadQr, onBack }: Props) {
  const entries = earnings.entries.month;
  const payoutMode = initialMode === 'payout';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ScreenHeader title={payoutMode ? 'Rút tiền' : 'Thu nhập'} onBack={onBack} />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {payoutMode ? (
          <>
            <View style={styles.balance}>
              <Text style={styles.balanceLabel}>Số dư có thể rút</Text>
              <Text accessibilityLabel={`Số dư có thể rút ${formatMoney(0, 'VND')}`} style={styles.balanceAmount}>{formatMoney(0, 'VND')}</Text>
              <Text style={styles.balanceMeta}>Việc được khách nghiệm thu chưa tạo ra số dư. Số dư chỉ có khi thanh toán được xác nhận.</Text>
              <ActionButton disabled label="Rút về ngân hàng" accessibilityLabel="Rút về ngân hàng, chưa mở" onPress={() => undefined} />
            </View>
            <SupportSection title="Tài khoản nhận tiền">
              <WorkerPayoutSection payout={payout} perform={performPayout} loadQr={loadQr} />
            </SupportSection>
            <SupportSection title="Điều kiện để rút tiền">
              <SupportCard>
                {payoutSteps(payout).map(step => (
                  <SupportRow key={step.title} icon={step.icon} title={step.title} detail={step.detail} trailing={<View style={[styles.state, step.done && styles.stateDone]}><Text style={[styles.stateText, step.done && styles.stateDoneText]}>{step.state}</Text></View>} />
                ))}
              </SupportCard>
            </SupportSection>
          </>
        ) : (
          <>
            <EarningsChartCard earnings={earnings} />
            <EarningsContributionsCard earnings={earnings} />
            {entries.length > 0 ? (
              <SupportSection title="Việc khách đã nghiệm thu trong tháng">
                <SupportCard>
                  {entries.map(entry => (
                    <SupportRow key={entry.id} icon="check" title={entry.title} detail={`${entry.dayLabel} · chưa xác nhận thanh toán`} trailing={<Text style={styles.entryAmount}>{formatMoney(entry.amountMinor, 'VND')}</Text>} />
                  ))}
                </SupportCard>
              </SupportSection>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: card.paddingHorizontal },
  list: { flex: 1 },
  listContent: { gap: metrics.cardGap, paddingHorizontal: card.paddingHorizontal, paddingTop: card.listPaddingTop, paddingBottom: card.listPaddingBottom },
  balance: { gap: horizonLayout.workerEarningsScreenStyle.balanceGap, padding: metrics.cardPadding, borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill },
  balanceLabel: { color: colors.heroLabel, fontSize: metrics.heroLabelSize, fontWeight: horizonLayout.workerEarningsScreenStyle.balanceLabelFontWeight },
  balanceAmount: { color: colors.heroAmount, fontSize: metrics.payoutAmountSize, fontWeight: metrics.heroAmountWeight, letterSpacing: metrics.heroAmountTracking, fontVariant: ['tabular-nums'] },
  balanceMeta: { color: colors.heroMeta, fontSize: metrics.heroMetaSize, lineHeight: horizonLayout.workerEarningsScreenStyle.balanceMetaLineHeight, marginBottom: horizonLayout.workerEarningsScreenStyle.balanceMetaMarginBottom },
  state: { height: metrics.stateHeight, borderRadius: metrics.stateRadius, paddingHorizontal: metrics.statePaddingHorizontal, backgroundColor: colors.stateFill, justifyContent: 'center' },
  stateDone: { backgroundColor: colors.stateDoneFill },
  stateDoneText: { color: colors.stateDoneText },
  stateText: { color: colors.stateText, fontSize: metrics.stateSize, fontWeight: horizonLayout.workerEarningsScreenStyle.stateTextFontWeight },
  entryAmount: { color: colors.amount, fontSize: metrics.listAmountSize, fontWeight: metrics.listAmountWeight, fontVariant: ['tabular-nums'] },
  footnote: { color: horizonColors.muted, fontSize: jobs.footnoteSize, lineHeight: jobs.footnoteLineHeight, textAlign: 'center' },
});
