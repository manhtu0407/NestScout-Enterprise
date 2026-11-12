import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { SlideToConfirm } from './slide-to-confirm';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

type Props = {
  title: string;
  canRetry: boolean;
  canCancel: boolean;
  onRetry: () => Promise<void>;
  onCancel: () => Promise<void>;
};

export function RequestDispatchPanel({ title, canRetry, canCancel, onRetry, onCancel }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  if (!canRetry && !canCancel) return null;

  const run = (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    action().then(() => setConfirming(false), (failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'Chưa gửi được thao tác.');
      setAttempt(count => count + 1);
    }).finally(() => setBusy(false));
  };

  return <View style={styles.root}>
    {confirming ? <>
      <Text style={styles.caption}>Hủy yêu cầu này? Các lời mời đang mở sẽ được rút lại. Bạn không thể hoàn tác, nhưng có thể gửi yêu cầu mới.</Text>
      <SlideToConfirm key={attempt} label="Trượt để hủy yêu cầu" accessibilityLabel={`Xác nhận hủy yêu cầu ${title}`} disabled={busy} onConfirm={() => run(onCancel)} />
      <PressScale accessibilityRole="button" accessibilityLabel="Giữ yêu cầu, không hủy" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setConfirming(false); setError(null); }} style={supportStyles.secondary}>
        <Text style={supportStyles.secondaryLabel}>Giữ yêu cầu</Text>
      </PressScale>
    </> : <>
      {canRetry ? (
        <PressScale accessibilityRole="button" accessibilityLabel={`Mời thợ lại cho ${title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => run(onRetry)} style={[supportStyles.primary, busy && styles.disabled]}>
          <Text style={supportStyles.primaryLabel}>{busy ? 'Đang mời…' : 'Mời thợ lại'}</Text>
        </PressScale>
      ) : null}
      {canCancel ? (
        <PressScale accessibilityRole="button" accessibilityLabel={`Hủy yêu cầu ${title}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setConfirming(true); setError(null); }} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Hủy yêu cầu</Text>
        </PressScale>
      ) : null}
    </>}
    {error !== null ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  caption: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  disabled: { opacity: metrics.lockedOpacity },
  error: { color: colors.dangerFg, fontSize: metrics.captionSize },
});
