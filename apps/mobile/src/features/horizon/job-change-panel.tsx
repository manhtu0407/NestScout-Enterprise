import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { PressScale, type JobChange, type JobChangeKind } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { parseProposedTime } from './job-change-time';
import { supportStyles } from './support-shell';

const requestMetrics = horizonLayout.requestsScreen;
const requestColors = horizonColors.requestsScreen;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

export type JobChangesApi = {
  read: (jobId: string) => Promise<JobChange[]>;
  request: (jobId: string, kind: JobChangeKind, proposedFor: string | null, reason: string | null) => Promise<string>;
  decide: (changeId: string, decision: 'agreed' | 'declined' | 'withdrawn') => Promise<void>;
};

type Props = { jobId: string; userId: string; api: JobChangesApi; now?: () => Date };

const kindLabels: Record<JobChangeKind, string> = { cancel: 'huỷ việc', reschedule: 'đổi lịch' };
const statusLabels = { pending: 'Đang chờ phản hồi', agreed: 'Đã được đồng ý', declined: 'Đã bị từ chối', withdrawn: 'Đã được rút lại' } as const;
const maxReason = 500;

function formatLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function JobChangePanel({ jobId, userId, api, now = () => new Date() }: Props) {
  const [changes, setChanges] = useState<JobChange[] | null>(null);
  const [composing, setComposing] = useState<JobChangeKind | null>(null);
  const [reason, setReason] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.read(jobId).then(setChanges, () => setError('Chưa tải được các đề nghị thay đổi. Kiểm tra kết nối rồi thử lại.'));
  }, [api, jobId]);

  useEffect(() => { load(); }, [load]);

  const run = async (action: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      setComposing(null);
      setReason('');
      setTime('');
      load();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (composing === null) return;
    const proposedFor = composing === 'reschedule' ? parseProposedTime(time, now()) : null;
    if (composing === 'reschedule' && proposedFor === null) {
      setError('Nhập thời gian mới theo dạng ngày/tháng/năm giờ:phút, ví dụ 20/11/2026 09:30, và phải ở tương lai.');
      return;
    }
    const kind = composing;
    void run(async () => { await api.request(jobId, kind, proposedFor, reason.trim() || null); }, 'Chưa gửi được đề nghị. Có thể đã có đề nghị đang chờ hoặc việc đã đóng.');
  };

  if (changes === null && error === null) return null;
  const latest = changes?.[0] ?? null;
  const pending = latest !== null && latest.status === 'pending' ? latest : null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Thay đổi lịch hoặc huỷ việc</Text>
      {latest !== null ? (
        <View accessibilityLiveRegion="polite" style={styles.latest}>
          <Text style={styles.body}>
            {`Đề nghị ${kindLabels[latest.kind]}${latest.proposedFor ? ` sang ${formatLocal(latest.proposedFor)}` : ''}: ${statusLabels[latest.status]}.`}
          </Text>
          {latest.reason ? <Text style={styles.note}>{`Lý do: ${latest.reason}`}</Text> : null}
          {latest.status === 'agreed' ? <Text style={styles.note}>Hai bên đã thống nhất. NestScout chưa tự đổi lịch, đóng việc hay hoàn tiền; hãy xác nhận lại với nhau.</Text> : null}
        </View>
      ) : null}
      {pending !== null ? (
        pending.requestedBy === userId ? (
          <PressScale accessibilityRole="button" accessibilityLabel="Rút lại đề nghị" accessibilityState={{ disabled: busy, busy }} onPress={() => void run(() => api.decide(pending.id, 'withdrawn'), 'Chưa rút lại được đề nghị. Kiểm tra kết nối rồi thử lại.')} style={styles.action}>
            <Text style={styles.actionLabel}>Rút lại đề nghị</Text>
          </PressScale>
        ) : (
          <View style={styles.row}>
            <PressScale accessibilityRole="button" accessibilityLabel="Đồng ý đề nghị" accessibilityState={{ disabled: busy, busy }} onPress={() => void run(() => api.decide(pending.id, 'agreed'), 'Chưa trả lời được đề nghị. Kiểm tra kết nối rồi thử lại.')} style={supportStyles.primary}>
              <Text style={supportStyles.primaryLabel}>Đồng ý</Text>
            </PressScale>
            <PressScale accessibilityRole="button" accessibilityLabel="Từ chối đề nghị" accessibilityState={{ disabled: busy, busy }} onPress={() => void run(() => api.decide(pending.id, 'declined'), 'Chưa trả lời được đề nghị. Kiểm tra kết nối rồi thử lại.')} style={styles.action}>
              <Text style={styles.actionLabel}>Từ chối</Text>
            </PressScale>
          </View>
        )
      ) : composing === null ? (
        <View style={styles.row}>
          <PressScale accessibilityRole="button" accessibilityLabel="Đề nghị đổi lịch" onPress={() => setComposing('reschedule')} style={styles.action}>
            <Text style={styles.actionLabel}>Đề nghị đổi lịch</Text>
          </PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel="Đề nghị huỷ việc" onPress={() => setComposing('cancel')} style={styles.action}>
            <Text style={styles.actionLabel}>Đề nghị huỷ việc</Text>
          </PressScale>
        </View>
      ) : (
        <View style={styles.form}>
          {composing === 'reschedule' ? (
            <View style={styles.box}>
              <TextInput accessibilityLabel="Thời gian mới" placeholder="Thời gian mới, ví dụ 20/11/2026 09:30" placeholderTextColor={horizonColors.muted} value={time} onChangeText={setTime} style={[styles.input, webInputStyle]} />
            </View>
          ) : null}
          <View style={styles.box}>
            <TextInput accessibilityLabel="Lý do" placeholder="Lý do (không bắt buộc)" placeholderTextColor={horizonColors.muted} value={reason} onChangeText={setReason} maxLength={maxReason} multiline style={[styles.input, webInputStyle]} />
          </View>
          <View style={styles.row}>
            <PressScale accessibilityRole="button" accessibilityLabel="Gửi đề nghị" accessibilityState={{ disabled: busy, busy }} onPress={submit} style={supportStyles.primary}>
              <Text style={supportStyles.primaryLabel}>{busy ? 'Đang gửi…' : 'Gửi đề nghị'}</Text>
            </PressScale>
            <PressScale accessibilityRole="button" accessibilityLabel="Huỷ soạn đề nghị" onPress={() => { setComposing(null); setError(null); }} style={styles.action}>
              <Text style={styles.actionLabel}>Đóng</Text>
            </PressScale>
          </View>
        </View>
      )}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: requestMetrics.infoGap },
  title: { color: requestColors.infoLabel, fontSize: requestMetrics.detailTitleSize, fontWeight: requestMetrics.detailTitleWeight },
  latest: { gap: requestMetrics.metaGap },
  body: { color: horizonColors.text, fontSize: requestMetrics.noteSize },
  note: { color: horizonColors.muted, fontSize: requestMetrics.noteSize },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: requestMetrics.cardGap },
  form: { gap: requestMetrics.infoGap },
  box: { borderRadius: requestMetrics.actionRadius, backgroundColor: requestColors.actionSecondaryFill, paddingHorizontal: requestMetrics.cardPadding },
  input: { minHeight: requestMetrics.actionHeight, color: horizonColors.text, fontSize: requestMetrics.noteSize },
  action: {
    height: requestMetrics.actionHeight,
    paddingHorizontal: requestMetrics.cardPadding,
    borderRadius: requestMetrics.actionRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: requestColors.actionSecondaryFill,
  },
  actionLabel: { color: requestColors.actionSecondaryLabel, fontSize: requestMetrics.actionSize, fontWeight: requestMetrics.actionWeight },
  error: { color: horizonColors.supportScreens.danger, fontSize: requestMetrics.noteSize },
});
