import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Icon, isFixtureBasis, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney, type QuoteItem, type QuoteStatus } from './content';
import { SlideToConfirm } from './slide-to-confirm';
import { SupportEmpty, SupportSection, SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Decision = Exclude<QuoteStatus, 'pending'>;

type Props = { items?: readonly QuoteItem[]; onBack: () => void; onAskKael?: () => void; onDecide?: (quote: QuoteItem, status: Decision) => Promise<void> };

type Entry = { quote: QuoteItem; status: QuoteStatus; earlier?: QuoteItem };

function latestPerRequest(items: readonly QuoteItem[]): QuoteItem[] {
  const latest = new Map<string, QuoteItem>();
  for (const item of items) {
    const current = latest.get(item.requestId);
    if (!current || item.version > current.version) latest.set(item.requestId, item);
  }
  return [...latest.values()];
}

export function QuotesScreen({ items = [], onBack, onAskKael, onDecide }: Props) {
  const [decisions, setDecisions] = useState<Readonly<Record<string, Decision>>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const entries: Entry[] = latestPerRequest(items).map(quote => ({
    quote,
    status: decisions[quote.id] ?? quote.status,
    earlier: items.filter(item => item.requestId === quote.requestId && item.version < quote.version).sort((a, b) => b.version - a.version)[0],
  }));
  const actionable = (entry: Entry) => entry.status === 'pending' && !entry.quote.expired;
  const waiting = entries.filter(actionable);
  const expired = entries.filter(entry => entry.status === 'pending' && entry.quote.expired);
  const answered = entries.filter(entry => entry.status !== 'pending');
  const decide = async (id: string, status: Decision) => {
    const quote = items.find(item => item.id === id);
    if (!onDecide || !quote) {
      setDecisions(current => ({ ...current, [id]: status }));
      setConfirming(null);
      return;
    }
    setBusyId(id);
    setFailure(null);
    try {
      await onDecide(quote, status);
      setConfirming(null);
    } catch (error) {
      setFailure({ id, message: error instanceof Error ? error.message : 'Chưa gửi được quyết định. Vui lòng thử lại.' });
    } finally {
      setBusyId(null);
    }
  };
  const render = (entry: Entry) => (
    <QuoteCard
      key={entry.quote.id}
      entry={entry}
      confirming={confirming === entry.quote.id}
      busy={busyId === entry.quote.id}
      failure={failure?.id === entry.quote.id ? failure.message : null}
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
  busy: boolean;
  failure: string | null;
  onReview: () => void;
  onCancelReview: () => void;
  onDecide: (id: string, status: Decision) => void;
  onAskKael?: () => void;
};

function QuoteCard({ entry, confirming, busy, failure, onReview, onCancelReview, onDecide, onAskKael }: CardProps) {
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
      {failure ? <Text accessibilityLiveRegion="polite" style={[styles.changeNote, styles.expiryExpired]}>{failure}</Text> : null}
      {status === 'accepted' ? (
        <View style={styles.resultBlock}>
          <Badge label="Đã chấp nhận" tone="success" dot />
          <Text style={styles.changeNote}>Chưa thu tiền và chưa có thợ được giao. Bước ghép thợ sẽ làm sau.</Text>
        </View>
      ) : null}
      {status === 'rejected' ? (
        <Badge label="Đã từ chối" tone="danger" dot />
      ) : null}
      {status === 'pending' && quote.expired ? (
        <PressScale accessibilityRole="button" accessibilityLabel="Nhờ Kael cập nhật báo giá" onPress={() => onAskKael?.()} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Nhờ Kael cập nhật báo giá</Text>
        </PressScale>
      ) : null}
      {status === 'pending' && !quote.expired && !confirming ? (
        <View style={styles.actions}>
          <PressScale accessibilityRole="button" accessibilityLabel={`Từ chối báo giá phiên bản ${quote.version}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onDecide(quote.id, 'rejected')} style={supportStyles.secondary} wrapperStyle={styles.action}>
            <Text style={supportStyles.secondaryLabel}>Từ chối</Text>
          </PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel={`Xem và chấp nhận báo giá phiên bản ${quote.version}`} accessibilityState={{ disabled: !recognised || busy }} disabled={!recognised || busy} onPress={onReview} style={[supportStyles.primary, !recognised && styles.disabled]} wrapperStyle={styles.action}>
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
          <SlideToConfirm label="Trượt để chấp nhận" accessibilityLabel={`Xác nhận chấp nhận báo giá ${amount}`} disabled={busy} onConfirm={() => onDecide(quote.id, 'accepted')} />
          <PressScale accessibilityRole="button" accessibilityLabel="Quay lại, chưa chấp nhận" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onCancelReview} style={supportStyles.secondary}>
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
});
