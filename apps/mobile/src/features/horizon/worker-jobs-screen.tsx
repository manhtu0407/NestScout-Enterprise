import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, type IconName } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney } from './content';
import { Presence, useRetained } from './motion-presence';
import { SlideToConfirm } from './slide-to-confirm';
import { SlidingChips } from './sliding-chips';
import { ScreenHeader } from './support-shell';
import { ActionButton } from './worker-action-button';
import { workerJobStages, workerJobStepActions, workerJobSteps, type WorkerCommand, type WorkerJob, type WorkerJobStage, type WorkerPerform } from './worker-jobs';
import { workflowMessage } from './workflow-messages';
import { JobChangePanel, type JobChangesApi } from './job-change-panel';

const webField = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });
const metrics = horizonLayout.workerJobs;
const colors = horizonColors.workerJobs;
const card = horizonLayout.requestsScreen;
const cardColors = horizonColors.requestsScreen;

type Props = {
  initialStage: WorkerJobStage;
  jobs: readonly WorkerJob[];
  perform: WorkerPerform;
  jobChanges?: { userId: string; api: JobChangesApi };
  onBack: () => void;
  onAskKael?: (job: WorkerJob) => void;
  sample?: boolean;
};

type FormKind = 'submit' | 'propose' | 'report' | 'pause' | 'release';

type FormState = { jobId: string; kind: FormKind; key: string };

type Actions = {
  busy: boolean;
  refusals: number;
  onAccept: () => void;
  onDecline: () => void;
  onAdvance: () => void;
  onResume: () => void;
  onOpen: (kind: FormKind) => void;
  onAskKael?: () => void;
};

type FormProps = { job: WorkerJob; form: FormState; busy: boolean; error: string | null; onCancel: () => void; onRun: (command: WorkerCommand) => void; onInvalid: (message: string) => void };

type CardProps = { job: WorkerJob; actions: Actions; form: FormState | null; busy: boolean; error: string | null; onCancelForm: () => void; onRun: (command: WorkerCommand) => void; onInvalid: (message: string) => void; jobChanges?: { userId: string; api: JobChangesApi } };

const maxText = 4000;

export function WorkerJobsScreen({ initialStage, jobs, perform, jobChanges, onBack, onAskKael, sample = false }: Props) {
  const [stage, setStage] = useState(initialStage);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refusals, setRefusals] = useState(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const retainedNotice = useRetained(notice);
  const current = workerJobStages.find(info => info.stage === stage) ?? workerJobStages[0];
  const visible = jobs.filter(job => job.stage === stage);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const select = (next: WorkerJobStage) => {
    setStage(next);
    setNotice(null);
    setError(null);
    setForm(null);
  };

  const run = async (id: string, command: WorkerCommand) => {
    if (running.current) return;
    running.current = true;
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const message = await perform(id, command);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!mounted.current) return;
      setNotice(message);
      setForm(null);
    } catch (failure) {
      if (mounted.current) {
        setError(workflowMessage(failure));
        setRefusals(count => count + 1);
      }
    } finally {
      running.current = false;
      if (mounted.current) setBusyId(null);
    }
  };

  const open = (jobId: string, kind: FormKind) => {
    setError(null);
    setNotice(null);
    setForm({ jobId, kind, key: randomUUID() });
  };

  const actionsFor = (job: WorkerJob): Actions => ({
    busy: busyId !== null,
    refusals,
    onAccept: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void run(job.id, { type: 'accept' });
    },
    onDecline: () => void run(job.id, { type: 'decline' }),
    onAdvance: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void run(job.id, { type: 'advance' });
    },
    onResume: () => void run(job.id, { type: 'resume' }),
    onOpen: kind => open(job.id, kind),
    onAskKael: onAskKael ? () => onAskKael(job) : undefined,
  });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ScreenHeader title="Công việc" onBack={onBack} />
      </View>
      <View style={styles.chipsBlock}>
        <SlidingChips
          items={workerJobStages.map(info => ({ key: info.stage, label: info.label, count: jobs.filter(job => job.stage === info.stage).length }))}
          selectedKey={stage}
          onSelect={key => { const next = workerJobStages.find(info => info.stage === key); if (next) select(next.stage); }}
        />
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Presence visible={notice !== null}>
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <Icon name="check" size={metrics.noticeIconSize} color={colors.noticeText} strokeWidth={card.toggleStroke} />
            <Text style={styles.noticeText}>{retainedNotice}</Text>
          </View>
        </Presence>
        {error !== null && form === null ? (
          <View accessibilityRole="alert" style={styles.problem}>
            <Text style={styles.problemText}>{error}</Text>
          </View>
        ) : null}
        {visible.length > 0 ? (
          visible.map(job => (
            <JobCard
              key={job.id}
              job={job}
              actions={actionsFor(job)}
              form={form !== null && form.jobId === job.id ? form : null}
              busy={busyId === job.id}
              error={error}
              onCancelForm={() => { setForm(null); setError(null); }}
              onRun={command => void run(job.id, command)}
              onInvalid={setError}
              jobChanges={jobChanges}
            />
          ))
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.empty}>
            <Icon name={current?.emptyIcon ?? 'bolt'} size={card.emptyIconSize} color={cardColors.emptyIcon} />
            <Text style={styles.emptyTitle}>{current?.emptyTitle}</Text>
            <Text style={styles.emptyBody}>{current?.emptyBody}</Text>
          </View>
        )}
        {sample ? <Text style={styles.footnote}>Dữ liệu mẫu. Lời mời, giá và thanh toán chưa được kết nối.</Text> : null}
      </ScrollView>
    </View>
  );
}

function JobForm({ job, form, busy, error, onCancel, onRun, onInvalid }: FormProps) {
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const reportKind = job.step === 2 ? 'customer_absent' : 'delay';
  const field = (label: string, value: string, onChange: (value: string) => void, multiline = true, keyboardType: 'default' | 'number-pad' = 'default') => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.placeholder}
      value={value}
      onChangeText={onChange}
      editable={!busy}
      multiline={multiline}
      keyboardType={keyboardType}
      maxLength={maxText}
      style={[styles.field, multiline && styles.fieldMultiline]}
    />
  );
  const send = () => {
    if (form.kind === 'submit') {
      const evidence = text.trim();
      if (!evidence) return onInvalid('Hãy mô tả công việc đã làm, tối đa 4000 ký tự.');
      return onRun({ type: 'submit', evidence, key: form.key });
    }
    if (form.kind === 'report') {
      const details = text.trim();
      if (!details) return onInvalid('Hãy ghi rõ nội dung cần báo.');
      return onRun({ type: 'report', kind: reportKind, details, key: form.key });
    }
    const scope = text.trim();
    const rationale = reason.trim();
    const value = Number(amount);
    if (!scope || !rationale || !/^\d+$/.test(amount) || !Number.isSafeInteger(value)) return onInvalid('Nhập phạm vi mới, số tiền (chỉ chữ số) và lý do thay đổi.');
    return onRun({ type: 'propose', scope, amount: value, rationale, key: form.key });
  };
  if (form.kind === 'release') {
    return (
      <View style={styles.form}>
        <Text style={styles.formTitle}>Vì sao bạn rút khỏi việc?</Text>
        <ActionButton secondary disabled={busy} label="Tôi không rảnh nữa" accessibilityLabel={`Rút khỏi việc vì không rảnh ${job.title}`} onPress={() => onRun({ type: 'release', reason: 'unavailable', key: form.key })} />
        <ActionButton secondary disabled={busy} label="Trùng lịch" accessibilityLabel={`Rút khỏi việc vì trùng lịch ${job.title}`} onPress={() => onRun({ type: 'release', reason: 'schedule_conflict', key: form.key })} />
        <ActionButton secondary disabled={busy} label="Không thể đến nơi" accessibilityLabel={`Rút khỏi việc vì không thể đến ${job.title}`} onPress={() => onRun({ type: 'release', reason: 'cannot_reach', key: form.key })} />
        <ActionButton secondary disabled={busy} label="Lý do khác" accessibilityLabel={`Rút khỏi việc vì lý do khác ${job.title}`} onPress={() => onRun({ type: 'release', reason: 'other', key: form.key })} />
        <Text style={styles.footnoteInline}>Việc sẽ được mời cho thợ khác và khách được báo ngay. Bạn sẽ không được mời lại việc này. Chỉ rút được trước khi đến nơi.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.problemText}>{error}</Text> : null}
        <ActionButton secondary disabled={busy} label="Đóng" accessibilityLabel="Đóng lựa chọn rút khỏi việc" onPress={onCancel} />
      </View>
    );
  }
  if (form.kind === 'pause') {
    return (
      <View style={styles.form}>
        <Text style={styles.formTitle}>Vì sao bạn tạm dừng?</Text>
        <ActionButton secondary disabled={busy} label="Gián đoạn thông thường" accessibilityLabel={`Tạm dừng thông thường ${job.title}`} onPress={() => onRun({ type: 'pause', category: 'ordinary_interruption' })} />
        <ActionButton secondary disabled={busy} label="Lo ngại về an toàn" accessibilityLabel={`Tạm dừng vì an toàn ${job.title}`} onPress={() => onRun({ type: 'pause', category: 'safety_concern' })} />
        <Text style={styles.footnoteInline}>Tạm dừng vì an toàn là quyết định cuối: việc đó không thể làm tiếp.</Text>
        {error ? <Text accessibilityRole="alert" style={styles.problemText}>{error}</Text> : null}
        <ActionButton secondary disabled={busy} label="Đóng" accessibilityLabel="Đóng lựa chọn tạm dừng" onPress={onCancel} />
      </View>
    );
  }
  const title = form.kind === 'submit' ? 'Mô tả công việc đã làm' : form.kind === 'propose' ? 'Đề xuất đổi phạm vi hoặc giá' : reportKind === 'delay' ? 'Báo chậm' : 'Khách không trả lời';
  const hint = form.kind === 'propose'
    ? 'Khách phải đồng ý thì phạm vi và giá mới mới có hiệu lực.'
    : form.kind === 'report' ? 'Ghi nhận này chưa được xác minh độc lập và không hứa giờ đến cụ thể.' : null;
  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{title}</Text>
      {form.kind === 'propose' ? field('Phạm vi mới', text, setText) : field(form.kind === 'submit' ? 'Kết quả công việc' : 'Nội dung báo', text, setText)}
      {form.kind === 'propose' ? field('Tổng tiền mới (VND)', amount, setAmount, false, 'number-pad') : null}
      {form.kind === 'propose' ? field('Lý do thay đổi', reason, setReason) : null}
      {hint ? <Text style={styles.footnoteInline}>{hint}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={styles.problemText}>{error}</Text> : null}
      <View style={styles.actions}>
        <ActionButton secondary disabled={busy} label="Hủy" accessibilityLabel={`Hủy ${title}`} onPress={onCancel} />
        <ActionButton disabled={busy} label={busy ? 'Đang gửi…' : 'Gửi'} accessibilityLabel={`Gửi: ${title}`} onPress={send} />
      </View>
    </View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={metrics.factIconSize} color={colors.factIcon} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

type Tag = { label: string; waiting: boolean };

function statusOf(job: WorkerJob): string {
  switch (job.stage) {
    case 'offer': return job.expiresLabel ?? '';
    case 'assigned': return workerJobSteps[job.step ?? 0] ?? '';
    case 'active': return job.pause === 'paused' ? 'Đang tạm dừng' : job.pause === 'resume' ? 'Chờ khách đồng ý làm tiếp' : job.pause === 'safety' ? 'Đã tạm dừng vì an toàn' : job.stageLabel ?? 'Đang thực hiện';
    case 'review': return job.stageLabel ?? 'Chờ khách duyệt';
    default: return `Hoàn tất · ${job.stageLabel ?? ''}`.trim();
  }
}

function tagOf(job: WorkerJob): Tag | null {
  if (job.stage === 'offer') return job.photoCount > 0 ? { label: `${job.photoCount} ảnh`, waiting: false } : null;
  if (job.stage === 'assigned') return job.delayReported ? { label: 'Đã báo chậm', waiting: true } : null;
  if (job.stage === 'active') return job.pause ? { label: job.pause === 'resume' ? 'Chờ khách' : 'Tạm dừng', waiting: true } : null;
  if (job.stage === 'review') return { label: job.correctionNote ? 'Cần sửa' : 'Chờ khách', waiting: true };
  return null;
}

function noteOf(job: WorkerJob): string | null {
  switch (job.stage) {
    case 'offer': return 'Khách đã chấp nhận giá này trước khi mời bạn. Nhận việc nghĩa là nhận đúng phạm vi và giá đó.';
    case 'active': return job.pause === 'safety' ? 'Việc đã tạm dừng vì lo ngại an toàn và không thể làm tiếp. Hãy liên hệ hỗ trợ nếu cần.' : job.pause ? 'Việc đang tạm dừng. Cần khách đồng ý thì mới làm tiếp.' : null;
    case 'review': return job.correctionNote ? null : 'Kết quả đã nộp. Khách sẽ nghiệm thu hoặc yêu cầu chỉnh sửa. Nếu có tranh chấp, việc được xử lý ngoài ứng dụng.';
    case 'done': return 'Thanh toán chưa được kết nối nên chưa có khoản thu thật.';
    default: return null;
  }
}

function JobActions({ job, actions }: { job: WorkerJob; actions: Actions }) {
  const { title } = job;
  const { busy } = actions;
  const advanceLabel = workerJobStepActions[job.step ?? 0] ?? '';
  const delayLabel = job.step === 2 ? 'Khách không trả lời' : 'Báo chậm';
  switch (job.stage) {
    case 'offer':
      return (
        <View style={styles.offerActions}>
          <SlideToConfirm key={actions.refusals} label="Trượt để nhận việc" accessibilityLabel={`Nhận việc ${title}`} disabled={busy} onConfirm={actions.onAccept} />
          <ActionButton secondary disabled={busy} label="Từ chối" accessibilityLabel={`Từ chối ${title}`} onPress={actions.onDecline} />
        </View>
      );
    case 'assigned':
      return (
        <View style={styles.actions}>
          <ActionButton secondary disabled={busy || job.delayReported === true} label={job.delayReported ? 'Đã ghi nhận' : delayLabel} accessibilityLabel={`${delayLabel} ${title}`} onPress={() => actions.onOpen('report')} />
          <ActionButton disabled={busy} label={advanceLabel} accessibilityLabel={`${advanceLabel}, ${title}`} onPress={actions.onAdvance} />
          {(job.step ?? 0) < 2 ? <ActionButton secondary disabled={busy} label="Rút khỏi việc" accessibilityLabel={`Rút khỏi việc ${title}`} onPress={() => actions.onOpen('release')} /> : null}
        </View>
      );
    case 'active':
      if (job.pause === 'paused') {
        return (
          <View style={styles.actions}>
            <ActionButton disabled={busy} label="Xin làm tiếp" accessibilityLabel={`Xin làm tiếp ${title}`} onPress={actions.onResume} />
            {job.canRelease === true ? <ActionButton secondary disabled={busy} label="Rút khỏi việc" accessibilityLabel={`Rút khỏi việc ${title}`} onPress={() => actions.onOpen('release')} /> : null}
          </View>
        );
      }
      if (job.pause === 'resume' || job.pause === 'safety') {
        const label = job.pause === 'resume' ? 'Chờ khách đồng ý' : 'Không thể làm tiếp';
        return (
          <View style={styles.actions}>
            <ActionButton disabled label={label} accessibilityLabel={`${label} ${title}`} onPress={actions.onResume} />
            {job.canRelease === true ? <ActionButton secondary disabled={busy} label="Rút khỏi việc" accessibilityLabel={`Rút khỏi việc ${title}`} onPress={() => actions.onOpen('release')} /> : null}
          </View>
        );
      }
      return (
        <View style={styles.offerActions}>
          <View style={styles.actions}>
            <ActionButton secondary disabled={busy} label="Tạm dừng" accessibilityLabel={`Tạm dừng ${title}`} onPress={() => actions.onOpen('pause')} />
            <ActionButton disabled={busy} label="Nộp kết quả" accessibilityLabel={`Nộp kết quả ${title}`} onPress={() => actions.onOpen('submit')} />
          </View>
          {job.canPropose === false ? null : (
            <ActionButton secondary disabled={busy} label="Đề xuất đổi phạm vi" accessibilityLabel={`Đề xuất đổi phạm vi ${title}`} onPress={() => actions.onOpen('propose')} />
          )}
        </View>
      );
    case 'review':
      return (
        <View style={styles.actions}>
          {actions.onAskKael ? <ActionButton secondary label="Hỏi Kael" accessibilityLabel={`Hỏi Kael về ${title}`} onPress={actions.onAskKael} /> : null}
          {job.correctionNote ? <ActionButton disabled={busy} label="Nộp lại" accessibilityLabel={`Nộp lại ${title}`} onPress={() => actions.onOpen('submit')} /> : null}
        </View>
      );
    default:
      return null;
  }
}

function JobCard({ job, actions, form, busy, error, onCancelForm, onRun, onInvalid, jobChanges }: CardProps) {
  const { stage } = job;
  const step = job.step ?? 0;
  const amount = formatMoney(job.amountMinor, 'VND');
  const tag = tagOf(job);
  const note = noteOf(job);
  const caption = `Bước ${step + 1}/${workerJobSteps.length} · ${workerJobSteps[step]}`;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.tile}>
          <Icon name={job.icon} size={card.tileIconSize} />
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={2} style={styles.cardTitle}>{job.title}</Text>
          <Text numberOfLines={1} style={styles.cardMeta}>{job.area || (stage === 'offer' ? 'Địa chỉ hiện sau khi nhận việc' : '')}</Text>
        </View>
      </View>
      <View style={styles.cardBottom}>
        <Text style={styles.status}>{statusOf(job)}</Text>
        {tag ? (
          <View style={[styles.chipTag, tag.waiting && styles.chipTagWaiting]}>
            <Text style={[styles.chipTagText, tag.waiting && styles.chipTagWaitingText]}>{tag.label}</Text>
          </View>
        ) : null}
      </View>
      {stage === 'offer' ? <Text numberOfLines={3} style={styles.description}>{job.description}</Text> : null}
      {job.preferredVisitLabel ? <Text style={styles.description}>{`Khách mong muốn: ${job.preferredVisitLabel} · chưa phải lịch hẹn đã xác nhận`}</Text> : null}
      <View style={styles.amountBlock}>
        <Text style={styles.amountLabel}>Giá khách đã chấp nhận</Text>
        <Text accessibilityLabel={`Giá khách đã chấp nhận ${amount}`} style={styles.amount}>{amount}</Text>
      </View>
      {stage === 'assigned' || stage === 'active' ? (
        <View style={styles.facts}>
          <Fact icon="pin" text={job.address} />
          <Fact icon="user" text={job.clientName} />
        </View>
      ) : null}
      {(stage === 'assigned' || stage === 'active') && jobChanges ? <JobChangePanel jobId={job.id} userId={jobChanges.userId} api={jobChanges.api} /> : null}
      {stage === 'assigned' ? (
        <View style={styles.block}>
          <View accessibilityRole="progressbar" accessibilityLabel={caption} style={styles.segments}>
            {workerJobSteps.map((label, index) => (
              <View key={label} style={[styles.segment, index <= step && styles.segmentDone]} />
            ))}
          </View>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      ) : null}
      {job.correctionNote ? (
        <View style={styles.correction}>
          <Text style={styles.correctionText}>{`Khách yêu cầu chỉnh sửa: ${job.correctionNote}`}</Text>
        </View>
      ) : null}
      {note ? <Text style={styles.footnoteInline}>{note}</Text> : null}
      {form ? <JobForm key={form.key} job={job} form={form} busy={busy} error={error} onCancel={onCancelForm} onRun={onRun} onInvalid={onInvalid} /> : <JobActions job={job} actions={actions} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: card.paddingHorizontal },
  chipsBlock: { marginTop: metrics.chipsMarginTop },
  list: { flex: 1 },
  listContent: { gap: card.listGap, paddingHorizontal: card.paddingHorizontal, paddingTop: card.listPaddingTop, paddingBottom: card.listPaddingBottom },
  notice: { flexDirection: 'row', alignItems: 'center', gap: metrics.noticeGap, padding: metrics.noticePadding, borderRadius: metrics.noticeRadius, backgroundColor: colors.noticeFill },
  noticeText: { flex: 1, minWidth: 0, color: colors.noticeText, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight, fontWeight: card.stepCaptionWeight },
  card: { padding: card.cardPadding, gap: card.cardGap, borderRadius: card.cardRadius, backgroundColor: cardColors.cardFill },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: card.cardGap },
  tile: { width: card.tileSize, height: card.tileSize, borderRadius: card.tileRadius, backgroundColor: cardColors.tileFill, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: horizonColors.text, fontSize: card.cardTitleSize, fontWeight: card.cardTitleWeight },
  cardMeta: { color: horizonColors.muted, fontSize: card.metaSize, marginTop: card.metaGap },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: card.cardGap },
  status: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: card.statusSize, fontWeight: card.statusWeight },
  chipTag: { height: card.chipHeight, paddingHorizontal: card.chipPaddingHorizontal, borderRadius: card.chipRadius, backgroundColor: cardColors.chipFill, justifyContent: 'center' },
  chipTagText: { color: cardColors.chipText, fontSize: card.chipFontSize, fontWeight: card.chipFontWeight },
  chipTagWaiting: { backgroundColor: colors.waitingFill },
  chipTagWaitingText: { color: colors.waitingText },
  description: { color: horizonColors.text, fontSize: metrics.descriptionSize, lineHeight: metrics.descriptionLineHeight },
  amountBlock: { gap: metrics.amountGap },
  amountLabel: { color: cardColors.infoLabel, fontSize: metrics.amountLabelSize, fontWeight: card.stepCaptionWeight },
  amount: { color: horizonColors.text, fontSize: metrics.amountSize, fontWeight: metrics.amountWeight, letterSpacing: metrics.amountTracking, fontVariant: ['tabular-nums'] },
  facts: { gap: metrics.factsGap },
  fact: { flexDirection: 'row', alignItems: 'center', gap: metrics.factGap },
  factText: { flex: 1, minWidth: 0, color: horizonColors.muted, fontSize: metrics.factSize, lineHeight: metrics.factLineHeight },
  block: { gap: card.blockGap },
  segments: { flexDirection: 'row', gap: card.stepSegmentGap },
  segment: { flex: 1, height: card.stepSegmentHeight, borderRadius: card.stepSegmentRadius, backgroundColor: cardColors.stepTrack },
  segmentDone: { backgroundColor: cardColors.stepFill },
  caption: { color: cardColors.stepCaption, fontSize: card.stepCaptionSize, fontWeight: card.stepCaptionWeight },
  problem: { padding: metrics.noticePadding, borderRadius: metrics.noticeRadius, backgroundColor: colors.waitingFill },
  problemText: { color: colors.waitingText, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight },
  form: { gap: metrics.composerGap },
  formTitle: { color: horizonColors.text, fontSize: card.statusSize, fontWeight: card.statusWeight },
  field: { ...webField, minHeight: metrics.fieldHeight, paddingHorizontal: metrics.fieldPaddingHorizontal, paddingVertical: metrics.composerPadding, borderRadius: metrics.fieldRadius, backgroundColor: colors.fieldFill, color: colors.fieldText, fontSize: metrics.fieldFontSize },
  fieldMultiline: { minHeight: metrics.fieldMultilineHeight, textAlignVertical: 'top' },
  correction: { padding: metrics.noticePadding, borderRadius: metrics.noticeRadius, backgroundColor: colors.waitingFill },
  correctionText: { color: colors.waitingText, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight },
  footnoteInline: { color: horizonColors.muted, fontSize: metrics.footnoteSize, lineHeight: metrics.footnoteLineHeight },
  actions: { flexDirection: 'row', gap: card.actionGap },
  offerActions: { gap: card.actionGap },
  empty: { alignItems: 'center', paddingTop: card.emptyPaddingTop, paddingHorizontal: card.emptyPaddingHorizontal, gap: card.emptyGap },
  emptyTitle: { color: horizonColors.text, fontSize: card.emptyTitleSize, fontWeight: card.emptyTitleWeight, textAlign: 'center' },
  emptyBody: { color: horizonColors.muted, fontSize: card.emptyBodySize, lineHeight: card.emptyBodyLineHeight, textAlign: 'center' },
  footnote: { color: horizonColors.muted, fontSize: metrics.footnoteSize, lineHeight: metrics.footnoteLineHeight, textAlign: 'center' },
});
