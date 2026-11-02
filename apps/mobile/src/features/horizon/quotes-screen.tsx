import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, isFixtureBasis, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney, type QuoteItem, type QuoteStatus } from './content';
import { SlideToConfirm } from './slide-to-confirm';
import { SupportEmpty, SupportSection, SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Decision = Exclude<QuoteStatus, 'pending'>;

type Props = { items?: readonly QuoteItem[]; onBack: () => void; onAskKael?: () => void };

type Entry = { quote: QuoteItem; status: QuoteStatus; earlier?: QuoteItem };

function latestPerRequest(items: readonly QuoteItem[]): QuoteItem[] {
  const latest = new Map<string, QuoteItem>();
  for (const item of items) {
    const current = latest.get(item.requestId);
    if (!current || item.version > current.version) latest.set(item.requestId, item);
  }
  return [...latest.values()];
}

export function QuotesScreen({ items = [], onBack, onAskKael }: Props) {
  const [decisions, setDecisions] = useState<Readonly<Record<string, Decision>>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const entries: Entry[] = latestPerRequest(items).map(quote => ({
    quote,
    status: decisions[quote.id] ?? quote.status,
    earlier: items.filter(item => item.requestId === quote.requestId && item.version < quote.version).sort((a, b) => b.version - a.version)[0],
  }));
  const actionable = (entry: Entry) => entry.status === 'pending' && !entry.quote.expired;
  const waiting = entries.filter(actionable);
  const expired = entries.filter(entry => entry.status === 'pending' && entry.quote.expired);
  const answered = entries.filter(entry => entry.status !== 'pending');
  const decide = (id: string, status: Decision) => {
    setDecisions(current => ({ ...current, [id]: status }));
    setConfirming(null);
  };
  const render = (entry: Entry) => (
    <QuoteCard
      key={entry.quote.id}
      entry={entry}
      confirming={confirming === entry.quote.id}
      onReview={() => setConfirming(entry.quote.id)}
      onCancelReview={() => setConfirming(null)}
      onDecide={decide}
      onAskKael={onAskKael}
    />
  );
  return (
    <SupportShell title="Báo giá" onBack={onBack}>
      {items.length === 0 ? (
        <SupportEmpty icon="receipt" title="Chưa có báo giá" body="Báo giá cho yêu cầu của bạn sẽ hiện ở đây để bạn xem kỹ trước khi quyết định." />
      ) : (
        <>
          {waiting.length > 0 ? <SupportSection title={`Chờ bạn quyết định · ${waiting.length}`}><View style={styles.list}>{waiting.map(render)}</View></SupportSection> : null}
          {expired.length > 0 ? <SupportSection title="Đã hết hạn"><View style={styles.list}>{expired.map(render)}</View></SupportSection> : null}
          {answered.length > 0 ? <SupportSection title="Đã trả lời"><View style={styles.list}>{answered.map(render)}</View></SupportSection> : null}
        </>
      )}
    </SupportShell>
  );
}

type CardProps = {
  entry: Entry;
  confirming: boolean;
  onReview: () => void;
  onCancelReview: () => void;
  onDecide: (id: string, status: Decision) => void;
  onAskKael?: () => void;
};

function QuoteCard({ entry, confirming, onReview, onCancelReview, onDecide, onAskKael }: CardProps) {
  const { quote, status, earlier } = entry;
  const recognised = isFixtureBasis(quote.basis);
  const amount = formatMoney(quote.amountMinor, quote.currency);
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text numberOfLines={2} style={styles.requestTitle}>{quote.requestTitle}</Text>
        <View style={styles.versionChip}>
          <Text style={styles.versionText}>Phiên bản {quote.version}</Text>
        </View>
      </View>
      <Text style={styles.notice}>
        {recognised ? 'Báo giá thử nghiệm — không phải giá hay cam kết thật.' : 'Báo giá có nguồn không xác định nên không thể chấp nhận tại đây.'}
      </Text>
      <View>
        <Text style={styles.label}>Giá báo</Text>
        <Text accessibilityLabel={`Giá báo ${amount}`} style={styles.amount}>{amount}</Text>
        {earlier ? <Text style={styles.earlier}>Thay phiên bản {earlier.version} ({formatMoney(earlier.amountMinor, earlier.currency)})</Text> : null}
      </View>
      <View>
        <Text style={styles.label}>Báo giá này gồm</Text>
        <Text style={styles.scope}>{quote.scope}</Text>
      </View>
      <View style={styles.expiryRow}>
        <Icon name="clock" size={metrics.noteIconSize} color={quote.expired ? colors.danger : colors.chevron} />
        <Text style={[styles.expiry, quote.expired && styles.expiryExpired]}>{quote.expiresLabel}</Text>
      </View>
      <Text style={styles.changeNote}>Nếu phát sinh thêm việc hoặc đổi giá, bạn sẽ được hỏi và phải đồng ý trước.</Text>
      {status === 'accepted' ? (
        <View style={styles.resultBlock}>
          <View style={[styles.statusChip, styles.statusAccepted]}><Text style={[styles.statusText, styles.statusTextAccepted]}>Đã chấp nhận</Text></View>
          <Text style={styles.changeNote}>Chưa thu tiền và chưa có thợ được giao. Bước ghép thợ sẽ làm sau.</Text>
        </View>
      ) : null}
      {status === 'rejected' ? (
        <View style={[styles.statusChip, styles.statusRejected]}><Text style={[styles.statusText, styles.statusTextRejected]}>Đã từ chối</Text></View>
      ) : null}
      {status === 'pending' && quote.expired ? (
        <PressScale accessibilityRole="button" accessibilityLabel="Nhờ Kael cập nhật báo giá" onPress={() => onAskKael?.()} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Nhờ Kael cập nhật báo giá</Text>
        </PressScale>
      ) : null}
      {status === 'pending' && !quote.expired && !confirming ? (
        <View style={styles.actions}>
          <PressScale accessibilityRole="button" accessibilityLabel={`Từ chối báo giá phiên bản ${quote.version}`} onPress={() => onDecide(quote.id, 'rejected')} style={supportStyles.secondary} wrapperStyle={styles.action}>
            <Text style={supportStyles.secondaryLabel}>Từ chối</Text>
          </PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel={`Xem và chấp nhận báo giá phiên bản ${quote.version}`} accessibilityState={{ disabled: !recognised }} disabled={!recognised} onPress={onReview} style={[supportStyles.primary, !recognised && styles.disabled]} wrapperStyle={styles.action}>
            <Text style={supportStyles.primaryLabel}>Xem và chấp nhận</Text>
          </PressScale>
        </View>
      ) : null}
      {status === 'pending' && !quote.expired && confirming ? (
        <View style={styles.consent}>
          <Text style={styles.consentTitle}>Trước khi chấp nhận</Text>
          <Text style={styles.consentLine}>• Bạn đồng ý với phạm vi và số tiền {amount} ở trên.</Text>
          <Text style={styles.consentLine}>• Chấp nhận chưa thu tiền. Thanh toán chưa được kết nối.</Text>
          <Text style={styles.consentLine}>• Chưa có thợ được giao. Bước ghép thợ sẽ làm sau.</Text>
          <SlideToConfirm label="Trượt để chấp nhận" accessibilityLabel={`Xác nhận chấp nhận báo giá ${amount}`} onConfirm={() => onDecide(quote.id, 'accepted')} />
          <PressScale accessibilityRole="button" accessibilityLabel="Quay lại, chưa chấp nhận" onPress={onCancelReview} style={supportStyles.secondary}>
            <Text style={supportStyles.secondaryLabel}>Quay lại</Text>
          </PressScale>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: metrics.workerCardListGap },
  card: { padding: metrics.workerCardPadding, gap: metrics.workerCardGap, borderRadius: metrics.workerCardRadius, backgroundColor: colors.cardFill },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: metrics.rowGap },
  requestTitle: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: metrics.workerNameSize, fontWeight: metrics.workerNameWeight },
  versionChip: { height: metrics.quoteVersionHeight, paddingHorizontal: metrics.statusChipPaddingHorizontal, borderRadius: metrics.statusChipRadius, backgroundColor: colors.tileFill, justifyContent: 'center' },
  versionText: { color: colors.sectionTitle, fontSize: metrics.quoteLabelSize, fontWeight: metrics.heroChipWeight },
  notice: { color: colors.sectionTitle, fontSize: metrics.quoteLabelSize, lineHeight: metrics.quoteNoteLineHeight },
  label: { color: colors.sectionTitle, fontSize: metrics.quoteLabelSize, fontWeight: metrics.fieldLabelWeight, marginBottom: metrics.rowDetailGap },
  amount: { color: horizonColors.text, fontSize: metrics.quoteAmountSize, fontWeight: metrics.priceWeight, letterSpacing: metrics.quoteAmountTracking, fontVariant: ['tabular-nums'] },
  earlier: { color: horizonColors.muted, fontSize: metrics.quoteLabelSize, marginTop: metrics.rowDetailGap },
  scope: { color: horizonColors.text, fontSize: metrics.quoteScopeSize, lineHeight: metrics.quoteScopeLineHeight },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.noteGap },
  expiry: { flex: 1, color: horizonColors.muted, fontSize: metrics.noteSize },
  expiryExpired: { color: colors.danger },
  changeNote: { color: horizonColors.muted, fontSize: metrics.quoteLabelSize, lineHeight: metrics.quoteNoteLineHeight },
  actions: { flexDirection: 'row', gap: metrics.buttonGap },
  action: { flex: 1 },
  disabled: { opacity: metrics.saveDisabledOpacity },
  consent: { gap: metrics.consentGap, padding: metrics.consentPadding, borderRadius: metrics.consentRadius, backgroundColor: colors.searchFill },
  consentTitle: { color: horizonColors.text, fontSize: metrics.quoteScopeSize, fontWeight: metrics.fieldLabelWeight },
  consentLine: { color: horizonColors.text, fontSize: metrics.noteSize, lineHeight: metrics.rowDetailLineHeight },
  resultBlock: { gap: metrics.consentGap },
  statusChip: { alignSelf: 'flex-start', height: metrics.statusChipHeight, paddingHorizontal: metrics.statusChipPaddingHorizontal, borderRadius: metrics.statusChipRadius, justifyContent: 'center' },
  statusAccepted: { backgroundColor: colors.quoteAcceptedFill },
  statusRejected: { backgroundColor: colors.quoteDeclinedFill },
  statusText: { fontSize: metrics.statusChipSize, fontWeight: metrics.heroChipWeight },
  statusTextAccepted: { color: colors.quoteAccepted },
  statusTextRejected: { color: colors.quoteDeclined },
});
