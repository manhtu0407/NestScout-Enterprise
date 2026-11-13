import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dispatchServiceIds, PressScale, type DispatchServiceId } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { clockLabel, serviceLabels } from './dispatch-copy';
import { SlideToConfirm } from './slide-to-confirm';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

type Props = {
  title: string;
  canRetry: boolean;
  canCancel: boolean;
  canReclassify?: boolean;
  canReassign?: boolean;
  reassignAt?: string | null;
  nextRetryAt?: string | null;
  retriesLeft?: number | null;
  onRetry: () => Promise<void | string>;
  onSetService?: (serviceId: DispatchServiceId) => Promise<void>;
  onCancel: () => Promise<void>;
  onReassign?: () => Promise<void>;
};

export function RequestDispatchPanel({ title, canRetry, canCancel, canReclassify = false, canReassign = false, reassignAt = null, nextRetryAt = null, retriesLeft = null, onRetry, onSetService, onCancel, onReassign }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reassignWaiting = !canReassign && reassignAt !== null;
  if (!canRetry && !canCancel && !canReclassify && !canReassign && !reassignWaiting && notice === null) return null;

  const run = (action: () => Promise<void | string>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    action().then(result => {
      setConfirming(false);
      setReassigning(false);
      if (typeof result === 'string') setNotice(result);
    }, (failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'Chưa gửi được thao tác.');
      setAttempt(count => count + 1);
    }).finally(() => setBusy(false));
  };

  const reassignHint = reassignWaiting ? `Nếu thợ chưa đến, bạn có thể mời thợ khác sau ${clockLabel(reassignAt)}.` : null;
  const waitHint = !canRetry && !canReclassify && nextRetryAt !== null ? `Bạn có thể mời thợ lại sau ${clockLabel(nextRetryAt)}.` : null;
  const budgetHint = canRetry && retriesLeft !== null ? `Còn ${retriesLeft} lượt mời lại.` : null;

  return <View style={styles.root}>
    {reassigning && onReassign ? <>
      <Text style={styles.caption}>Mời thợ khác? Thợ hiện tại sẽ được báo là không còn việc này và hệ thống mời thợ mới. Bạn không thể hoàn tác.</Text>
      <SlideToConfirm key={attempt} label="Trượt để mời thợ khác" accessibilityLabel={`Xác nhận mời thợ khác cho yêu cầu ${title}`} disabled={busy} onConfirm={() => run(async () => { await onReassign(); })} />
      <PressScale accessibilityRole="button" accessibilityLabel="Giữ thợ hiện tại" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setReassigning(false); setError(null); }} style={supportStyles.secondary}>
        <Text style={supportStyles.secondaryLabel}>Giữ thợ hiện tại</Text>
      </PressScale>
    </> : confirming ? <>
      <Text style={styles.caption}>Hủy yêu cầu này? Các lời mời đang mở sẽ được rút lại. Bạn không thể hoàn tác, nhưng có thể gửi yêu cầu mới.</Text>
      <SlideToConfirm key={attempt} label="Trượt để hủy yêu cầu" accessibilityLabel={`Xác nhận hủy yêu cầu ${title}`} disabled={busy} onConfirm={() => run(onCancel)} />
      <PressScale accessibilityRole="button" accessibilityLabel="Giữ yêu cầu, không hủy" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setConfirming(false); setError(null); }} style={supportStyles.secondary}>
        <Text style={supportStyles.secondaryLabel}>Giữ yêu cầu</Text>
      </PressScale>
    </> : <>
      {canReassign && onReassign ? <>
        <Text style={styles.caption}>Thợ đã nhận việc nhưng chưa thấy đến?</Text>
        <PressScale accessibilityRole="button" accessibilityLabel={`Mời thợ khác cho ${title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setReassigning(true); setError(null); setNotice(null); }} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Mời thợ khác</Text>
        </PressScale>
      </> : null}
      {canReclassify && onSetService ? <>
        <Text style={styles.caption}>Chọn loại dịch vụ của yêu cầu này:</Text>
        {dispatchServiceIds.map(serviceId => (
          <PressScale key={serviceId} accessibilityRole="button" accessibilityLabel={`Chọn loại dịch vụ ${serviceLabels[serviceId]} cho ${title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => run(async () => { await onSetService(serviceId); })} style={supportStyles.secondary}>
            <Text style={supportStyles.secondaryLabel}>{serviceLabels[serviceId]}</Text>
          </PressScale>
        ))}
      </> : null}
      {canRetry ? (
        <PressScale accessibilityRole="button" accessibilityLabel={`Mời thợ lại cho ${title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => run(onRetry)} style={[supportStyles.primary, busy && styles.disabled]}>
          <Text style={supportStyles.primaryLabel}>{busy ? 'Đang mời…' : 'Mời thợ lại'}</Text>
        </PressScale>
      ) : null}
      {budgetHint !== null ? <Text style={styles.caption}>{budgetHint}</Text> : null}
      {reassignHint !== null ? <Text style={styles.caption}>{reassignHint}</Text> : null}
      {waitHint !== null ? <Text style={styles.caption}>{waitHint}</Text> : null}
      {canCancel ? (
        <PressScale accessibilityRole="button" accessibilityLabel={`Hủy yêu cầu ${title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setConfirming(true); setError(null); setNotice(null); }} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Hủy yêu cầu</Text>
        </PressScale>
      ) : null}
    </>}
    {notice !== null ? <Text accessibilityLiveRegion="polite" style={styles.caption}>{notice}</Text> : null}
    {error !== null ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  caption: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  disabled: { opacity: metrics.lockedOpacity },
  error: { color: colors.dangerFg, fontSize: metrics.captionSize },
});
