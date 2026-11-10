import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type SubmissionDecision = 'accepted' | 'revision_requested' | 'disputed';

type Props = {
  evidence: string;
  onDecide: (decision: SubmissionDecision, reason: string | null) => Promise<void>;
};

type Mode = 'idle' | 'accept' | 'revision_requested' | 'disputed';

const reasonTitles: Readonly<Record<'revision_requested' | 'disputed', string>> = {
  revision_requested: 'Thợ cần sửa lại điều gì?',
  disputed: 'Vì sao bạn khiếu nại kết quả này?',
};

export function SubmissionDecisionPanel({ evidence, onDecide }: Props) {
  const [mode, setMode] = useState<Mode>('idle');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const decide = (decision: SubmissionDecision) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    onDecide(decision, decision === 'accepted' ? null : trimmed).then(() => {
      setMode('idle');
      setReason('');
    }, (failure: unknown) => setError(failure instanceof Error ? failure.message : 'Chưa gửi được quyết định.')).finally(() => setBusy(false));
  };
  const open = (next: Mode) => { setMode(next); setError(null); };
  return <View style={styles.root}>
    <Text accessibilityRole="header" style={styles.title}>Kết quả thợ gửi</Text>
    <Text style={styles.evidence}>{evidence}</Text>
    {mode === 'idle' ? <>
      <PressScale accessibilityRole="button" accessibilityLabel="Nghiệm thu công việc" onPress={() => open('accept')} style={supportStyles.primary}>
        <Text style={supportStyles.primaryLabel}>Nghiệm thu</Text>
      </PressScale>
      <PressScale accessibilityRole="button" accessibilityLabel="Yêu cầu thợ sửa lại" onPress={() => open('revision_requested')} style={supportStyles.secondary}>
        <Text style={supportStyles.secondaryLabel}>Yêu cầu sửa lại</Text>
      </PressScale>
      <PressScale accessibilityRole="button" accessibilityLabel="Khiếu nại kết quả" onPress={() => open('disputed')} style={supportStyles.secondary}>
        <Text style={supportStyles.secondaryLabel}>Khiếu nại</Text>
      </PressScale>
    </> : null}
    {mode === 'accept' ? <>
      <Text style={styles.caption}>Nghiệm thu xác nhận công việc đã xong theo phạm vi đã thỏa thuận. Đây không phải là thanh toán; thanh toán chưa được kết nối trong ứng dụng.</Text>
      <PressScale accessibilityRole="button" accessibilityLabel="Xác nhận nghiệm thu" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => decide('accepted')} style={[supportStyles.primary, busy && styles.disabled]}>
        <Text style={supportStyles.primaryLabel}>{busy ? 'Đang gửi…' : 'Xác nhận nghiệm thu'}</Text>
      </PressScale>
    </> : null}
    {mode === 'revision_requested' || mode === 'disputed' ? <>
      <Text style={styles.caption}>{reasonTitles[mode]}</Text>
      <TextInput accessibilityLabel={reasonTitles[mode]} value={reason} onChangeText={setReason} multiline maxLength={1000} placeholder="Mô tả ngắn gọn" placeholderTextColor={colors.faint} style={styles.input} />
      {mode === 'disputed' ? <Text style={styles.caption}>Khiếu nại tạo một hồ sơ riêng và giữ nguyên bằng chứng. Việc giải quyết cần nhân viên NestScout; không có hoàn tiền hay phí tự động.</Text> : null}
      <PressScale accessibilityRole="button" accessibilityLabel={mode === 'disputed' ? 'Gửi khiếu nại' : 'Gửi yêu cầu sửa lại'} accessibilityState={{ disabled: busy || trimmed === '' }} disabled={busy || trimmed === ''} onPress={() => decide(mode)} style={[supportStyles.primary, (busy || trimmed === '') && styles.disabled]}>
        <Text style={supportStyles.primaryLabel}>{busy ? 'Đang gửi…' : mode === 'disputed' ? 'Gửi khiếu nại' : 'Gửi yêu cầu sửa lại'}</Text>
      </PressScale>
    </> : null}
    {mode !== 'idle' ? <PressScale accessibilityRole="button" accessibilityLabel="Quay lại, chưa quyết định" disabled={busy} onPress={() => { open('idle'); setReason(''); }} style={supportStyles.secondary}>
      <Text style={supportStyles.secondaryLabel}>Quay lại</Text>
    </PressScale> : null}
    {error !== null ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  title: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  evidence: { color: colors.text, fontSize: metrics.bodySize, lineHeight: metrics.bodyLine },
  caption: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  input: { minHeight: metrics.inputMin, borderRadius: metrics.smallRadius, borderWidth: metrics.hair, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, padding: metrics.inputPadding, fontSize: metrics.bodySize },
  disabled: { opacity: metrics.lockedOpacity },
  error: { color: colors.dangerFg, fontSize: metrics.captionSize },
});
