import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { randomUUID } from 'expo-crypto';

import { useAccess } from '@/features/access';
import { PressScale, operatorNoteLimit, readOperatorCases, resolveOperatorCase, reviewOperatorCase, type EscalationResolution, type JobStage, type OperatorCase } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { relativeTimeLabel } from './request-views';
import { SlideToConfirm } from './slide-to-confirm';
import { SupportCard, SupportEmpty, SupportRow, SupportSection, SupportShell, supportStyles } from './support-shell';
import { workflowMessage } from './workflow-messages';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;
const fieldMetrics = horizonLayout.supportScreens;
const fieldColors = horizonColors.supportScreens;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

const stageLabels: Record<JobStage, string> = {
  assigned: 'Đã nhận việc',
  en_route: 'Đang đến',
  arrived: 'Đã đến nơi',
  working: 'Đang làm',
  paused: 'Tạm dừng',
  submitted: 'Chờ khách duyệt',
  completed: 'Hoàn tất',
};

const statusLabels: Record<OperatorCase['status'], string> = { open: 'Chờ xem xét', reviewing: 'Đang xem xét' };
const defaultNote = 'Khách báo thợ đã đến nhưng chưa bắt đầu việc.';

type CardProps = {
  item: OperatorCase;
  now: Date;
  onReview: (item: OperatorCase) => Promise<void>;
  onResolve: (item: OperatorCase, resolution: EscalationResolution, note: string) => Promise<void>;
};

function OperatorCaseCard({ item, now, onReview, onResolve }: CardProps) {
  const [note, setNote] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    action().then(() => setReplacing(false), (failure: unknown) => {
      setError(workflowMessage(failure));
      setAttempt(count => count + 1);
    }).finally(() => setBusy(false));
  };

  return <SupportSection title={item.description}>
    <SupportCard>
      <SupportRow icon="help" title={statusLabels[item.status]} detail={`${item.note ?? defaultNote}\n${relativeTimeLabel(item.createdAt, now)}`} danger={item.status === 'open'} />
      <SupportRow icon="user" title={item.workerName ?? 'Thợ'} detail={item.jobStage === null ? undefined : stageLabels[item.jobStage]} />
      <SupportRow icon="pin" title={item.location} />
    </SupportCard>
    <View style={styles.actions}>
      {item.status === 'open' ? (
        <PressScale accessibilityRole="button" accessibilityLabel={`Nhận xem xét sự cố ${item.description}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => run(() => onReview(item))} style={[supportStyles.primary, busy && styles.disabled]}>
          <Text style={supportStyles.primaryLabel}>{busy ? 'Đang nhận…' : 'Nhận xem xét'}</Text>
        </PressScale>
      ) : replacing ? <>
        <Text style={styles.caption}>Đổi thợ khác? Thợ hiện tại sẽ được báo là không còn việc này và hệ thống mời thợ mới. Khách hàng được báo kết quả. Không thể hoàn tác.</Text>
        <SlideToConfirm key={attempt} label="Trượt để đổi thợ" accessibilityLabel={`Xác nhận đổi thợ cho ${item.description}`} disabled={busy} onConfirm={() => run(() => onResolve(item, 'replace_worker', note))} />
        <PressScale accessibilityRole="button" accessibilityLabel="Chưa đổi thợ" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setReplacing(false); setError(null); }} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Chưa đổi</Text>
        </PressScale>
      </> : <>
        <TextInput
          accessibilityLabel={`Ghi chú gửi khách và thợ cho ${item.description}`}
          style={[styles.noteInput, webInputStyle]}
          value={note}
          onChangeText={setNote}
          placeholder="Ghi chú gửi khách và thợ (không bắt buộc)"
          placeholderTextColor={fieldColors.searchPlaceholder}
          maxLength={operatorNoteLimit}
          multiline
          editable={!busy}
        />
        <PressScale accessibilityRole="button" accessibilityLabel={`Cho thợ tiếp tục ${item.description}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => run(() => onResolve(item, 'proceed', note))} style={[supportStyles.primary, busy && styles.disabled]}>
          <Text style={supportStyles.primaryLabel}>Cho thợ tiếp tục</Text>
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel={`Đổi thợ khác ${item.description}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => { setReplacing(true); setError(null); }} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Đổi thợ khác</Text>
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel={`Đóng sự cố ${item.description}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => run(() => onResolve(item, 'dismiss', note))} style={supportStyles.secondary}>
          <Text style={supportStyles.secondaryLabel}>Đóng, không cần xử lý thêm</Text>
        </PressScale>
      </>}
      {error !== null ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  </SupportSection>;
}

type ScreenProps = {
  cases: readonly OperatorCase[];
  loaded: boolean;
  failure: string | null;
  now: Date;
  onBack: () => void;
  onRefresh: () => void;
  onReview: CardProps['onReview'];
  onResolve: CardProps['onResolve'];
};

export function OperatorEscalationsScreen({ cases, loaded, failure, now, onBack, onRefresh, onReview, onResolve }: ScreenProps) {
  return <SupportShell title="Xử lý sự cố" subtitle="Các báo cáo thợ đã đến nhưng chưa bắt đầu việc." onBack={onBack}>
    {failure !== null ? <>
      <SupportEmpty icon="clock" title="Không mở được hàng đợi" body={failure} />
      <PressScale accessibilityRole="button" accessibilityLabel="Tải lại" onPress={onRefresh} style={supportStyles.primary}>
        <Text style={supportStyles.primaryLabel}>Tải lại</Text>
      </PressScale>
    </> : !loaded ? <SupportEmpty icon="clock" title="Đang tải" body="Vui lòng chờ trong giây lát." />
      : cases.length === 0 ? <SupportEmpty icon="check" title="Không có sự cố nào đang chờ" body="Khi khách báo sự cố, báo cáo sẽ hiện ở đây." />
      : cases.map(item => <OperatorCaseCard key={item.escalationId} item={item} now={now} onReview={onReview} onResolve={onResolve} />)}
  </SupportShell>;
}

type Keys = Map<string, string>;

function keyFor(keys: Keys, scope: string): string {
  const existing = keys.get(scope);
  if (existing !== undefined) return existing;
  const created = randomUUID();
  keys.set(scope, created);
  return created;
}

export function OperatorEscalationsSection({ onBack }: { onBack: () => void }) {
  const access = useAccess();
  const userId = access.identity === 'verified' ? access.userId : null;
  const [now] = useState(() => new Date());
  const [cases, setCases] = useState<readonly OperatorCase[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  const keys = useRef<Keys>(new Map());

  useEffect(() => {
    if (userId === null) return undefined;
    const controller = new AbortController();
    readOperatorCases(userId, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      setCases(next);
      setFailure(null);
      setLoaded(true);
    }, (error: unknown) => {
      if (!controller.signal.aborted) setFailure(workflowMessage(error));
    });
    return () => controller.abort();
  }, [userId, reads]);

  const reload = useCallback(() => {
    setFailure(null);
    setReads(count => count + 1);
  }, []);

  const review = useCallback(async (item: OperatorCase) => {
    if (userId === null) return;
    const scope = `${item.escalationId}:review`;
    await reviewOperatorCase(userId, item.escalationId, keyFor(keys.current, scope), new AbortController().signal);
    keys.current.delete(scope);
    reload();
  }, [reload, userId]);

  const resolve = useCallback(async (item: OperatorCase, resolution: EscalationResolution, note: string) => {
    if (userId === null) return;
    const scope = `${item.escalationId}:${resolution}`;
    await resolveOperatorCase(userId, item.escalationId, resolution, note, keyFor(keys.current, scope), new AbortController().signal);
    keys.current.delete(scope);
    reload();
  }, [reload, userId]);

  if (userId === null) {
    return <SupportShell title="Xử lý sự cố" onBack={onBack}>
      <SupportEmpty icon="user" title="Cần đăng nhập" body="Đăng nhập bằng tài khoản được cấp quyền xử lý sự cố để xem mục này." />
    </SupportShell>;
  }
  return <OperatorEscalationsScreen cases={cases} loaded={loaded} failure={failure} now={now} onBack={onBack} onRefresh={reload} onReview={review} onResolve={resolve} />;
}

const styles = StyleSheet.create({
  actions: { gap: metrics.rowGap, marginTop: metrics.rowGap },
  caption: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  disabled: { opacity: metrics.lockedOpacity },
  error: { color: colors.dangerFg, fontSize: metrics.captionSize },
  noteInput: {
    borderRadius: fieldMetrics.searchRadius, paddingHorizontal: fieldMetrics.searchPaddingHorizontal, backgroundColor: fieldColors.searchFill,
    color: horizonColors.text, fontSize: fieldMetrics.searchFontSize, minHeight: fieldMetrics.searchHeight,
  },
});
