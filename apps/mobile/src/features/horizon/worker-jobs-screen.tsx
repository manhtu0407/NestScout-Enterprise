import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName, PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatMoney } from './content';
import { Presence, useRetained } from './motion-presence';
import { SlidingChips } from './sliding-chips';
import { ScreenHeader } from './support-shell';
import { workerJobStages, workerJobStepActions, workerJobSteps, type WorkerJob, type WorkerJobStage } from './worker-jobs';

const metrics = horizonLayout.workerJobs;
const colors = horizonColors.workerJobs;
const card = horizonLayout.requestsScreen;
const cardColors = horizonColors.requestsScreen;

type Change = Partial<Pick<WorkerJob, 'stage' | 'step' | 'stageLabel' | 'pause' | 'delayReported' | 'correctionNote'>>;

type Props = { initialStage: WorkerJobStage; jobs?: readonly WorkerJob[]; onBack: () => void; onAskKael?: () => void };

type Actions = {
  onAccept: () => void;
  onDecline: () => void;
  onAdvance: () => void;
  onDelay: () => void;
  onPause: () => void;
  onRequestResume: () => void;
  onSubmit: () => void;
  onResubmit: () => void;
  onAskKael?: () => void;
};

export function WorkerJobsScreen({ initialStage, jobs = [], onBack, onAskKael }: Props) {
  const [stage, setStage] = useState(initialStage);
  const [changes, setChanges] = useState<Readonly<Record<string, Change>>>({});
  const [dismissed, setDismissed] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const retainedNotice = useRetained(notice);
  const live = jobs.filter(job => !dismissed.includes(job.id)).map(job => ({ ...job, ...changes[job.id] }));
  const current = workerJobStages.find(info => info.stage === stage) ?? workerJobStages[0];
  const visible = live.filter(job => job.stage === stage);

  const select = (next: WorkerJobStage) => {
    setStage(next);
    setNotice(null);
  };
  const move = (id: string, change: Change, message: string) => {
    setChanges(existing => ({ ...existing, [id]: { ...existing[id], ...change } }));
    setNotice(message);
  };
  const actionsFor = (job: WorkerJob): Actions => ({
    onAccept: () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      move(job.id, { stage: 'assigned', step: 0 }, 'Đã nhận việc. Xem trong mục Đã nhận.');
    },
    onDecline: () => {
      setDismissed(existing => [...existing, job.id]);
      setNotice('Đã từ chối lời mời này.');
    },
    onAdvance: () => {
      const step = job.step ?? 0;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (step + 1 < workerJobSteps.length) {
        move(job.id, { step: step + 1 }, `Đã cập nhật: ${workerJobSteps[step + 1]}.`);
        return;
      }
      move(job.id, { stage: 'active', step: undefined, stageLabel: 'Vừa bắt đầu' }, 'Đã bắt đầu làm. Xem trong mục Đang làm.');
    },
    onDelay: () => move(job.id, { delayReported: true }, 'Đã ghi nhận báo chậm. Không có khoản phí hay thay đổi lịch tự động.'),
    onPause: () => move(job.id, { pause: 'paused' }, 'Đã tạm dừng việc. Muốn làm tiếp cần khách đồng ý.'),
    onRequestResume: () => move(job.id, { pause: 'resume' }, 'Đã gửi yêu cầu làm tiếp. Chờ khách đồng ý.'),
    onSubmit: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      move(job.id, { stage: 'review', pause: undefined, stageLabel: 'Vừa nộp' }, 'Đã nộp kết quả. Xem trong mục Chờ duyệt.');
    },
    onResubmit: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      move(job.id, { correctionNote: undefined, stageLabel: 'Vừa nộp lại' }, 'Đã nộp lại kết quả. Chờ khách duyệt.');
    },
    onAskKael,
  });

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <ScreenHeader title="Công việc" onBack={onBack} />
      </View>
      <View style={styles.chipsBlock}>
        <SlidingChips
          items={workerJobStages.map(info => ({ key: info.stage, label: info.label, count: live.filter(job => job.stage === info.stage).length }))}
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
        {visible.length > 0 ? (
          visible.map(job => <JobCard key={job.id} job={job} actions={actionsFor(job)} />)
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.empty}>
            <Icon name={current?.emptyIcon ?? 'bolt'} size={card.emptyIconSize} color={cardColors.emptyIcon} />
            <Text style={styles.emptyTitle}>{current?.emptyTitle}</Text>
            <Text style={styles.emptyBody}>{current?.emptyBody}</Text>
          </View>
        )}
        <Text style={styles.footnote}>Dữ liệu mẫu. Lời mời, giá và thanh toán chưa được kết nối.</Text>
      </ScrollView>
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
    case 'offer': return `${job.clientName} · ${job.expiresLabel ?? ''}`.trim();
    case 'assigned': return workerJobSteps[job.step ?? 0] ?? '';
    case 'active': return job.pause === 'paused' ? 'Đang tạm dừng' : job.pause === 'resume' ? 'Chờ khách đồng ý làm tiếp' : job.stageLabel ?? 'Đang thực hiện';
    case 'review': return job.stageLabel ?? 'Chờ khách duyệt';
    default: return `Hoàn tất · ${job.stageLabel ?? ''}`.trim();
  }
}

function tagOf(job: WorkerJob): Tag | null {
  if (job.stage === 'offer') return job.photoCount > 0 ? { label: `${job.photoCount} ảnh`, waiting: false } : null;
  if (job.stage === 'assigned') return job.delayReported ? { label: 'Đã báo chậm', waiting: true } : null;
  if (job.stage === 'active') return job.pause ? { label: job.pause === 'paused' ? 'Tạm dừng' : 'Chờ khách', waiting: true } : null;
  if (job.stage === 'review') return { label: job.correctionNote ? 'Cần sửa' : 'Chờ khách', waiting: true };
  return null;
}

function noteOf(job: WorkerJob): string | null {
  switch (job.stage) {
    case 'offer': return 'Khách đã chấp nhận giá này trước khi mời bạn. Nhận việc nghĩa là nhận đúng phạm vi và giá đó.';
    case 'active': return job.pause === 'paused' ? 'Việc đang tạm dừng. Cần khách đồng ý thì mới làm tiếp.' : null;
    case 'review': return job.correctionNote ? null : 'Kết quả đã nộp. Khách sẽ nghiệm thu hoặc yêu cầu chỉnh sửa. Nếu có tranh chấp, việc được xử lý ngoài ứng dụng.';
    case 'done': return 'Thanh toán chưa được kết nối nên chưa có khoản thu thật.';
    default: return null;
  }
}

type ActionButtonProps = { label: string; accessibilityLabel: string; onPress: () => void; secondary?: boolean; disabled?: boolean };

function ActionButton({ label, accessibilityLabel, onPress, secondary = false, disabled = false }: ActionButtonProps) {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, secondary && styles.actionSecondary, disabled && styles.disabled]}
      wrapperStyle={styles.actionWrap}
    >
      <Text style={[styles.actionLabel, secondary && styles.actionSecondaryLabel]}>{label}</Text>
    </PressScale>
  );
}

function JobActions({ job, actions }: { job: WorkerJob; actions: Actions }) {
  const { title } = job;
  const advanceLabel = workerJobStepActions[job.step ?? 0] ?? '';
  switch (job.stage) {
    case 'offer':
      return (
        <View style={styles.actions}>
          <ActionButton secondary label="Từ chối" accessibilityLabel={`Từ chối ${title}`} onPress={actions.onDecline} />
          <ActionButton label="Nhận việc" accessibilityLabel={`Nhận việc ${title}`} onPress={actions.onAccept} />
        </View>
      );
    case 'assigned':
      return (
        <View style={styles.actions}>
          <ActionButton secondary disabled={job.delayReported === true} label="Báo chậm" accessibilityLabel={`Báo chậm ${title}`} onPress={actions.onDelay} />
          <ActionButton label={advanceLabel} accessibilityLabel={`${advanceLabel}, ${title}`} onPress={actions.onAdvance} />
        </View>
      );
    case 'active':
      if (job.pause === 'paused') {
        return (
          <View style={styles.actions}>
            <ActionButton label="Xin làm tiếp" accessibilityLabel={`Xin làm tiếp ${title}`} onPress={actions.onRequestResume} />
          </View>
        );
      }
      if (job.pause === 'resume') {
        return (
          <View style={styles.actions}>
            <ActionButton disabled label="Chờ khách đồng ý" accessibilityLabel={`Chờ khách đồng ý làm tiếp ${title}`} onPress={actions.onRequestResume} />
          </View>
        );
      }
      return (
        <View style={styles.actions}>
          <ActionButton secondary label="Tạm dừng" accessibilityLabel={`Tạm dừng ${title}`} onPress={actions.onPause} />
          <ActionButton label="Nộp kết quả" accessibilityLabel={`Nộp kết quả ${title}`} onPress={actions.onSubmit} />
        </View>
      );
    case 'review':
      return (
        <View style={styles.actions}>
          <ActionButton secondary label="Hỏi Kael" accessibilityLabel={`Hỏi Kael về ${title}`} onPress={() => actions.onAskKael?.()} />
          {job.correctionNote ? <ActionButton label="Nộp lại" accessibilityLabel={`Nộp lại ${title}`} onPress={actions.onResubmit} /> : null}
        </View>
      );
    default:
      return null;
  }
}

function JobCard({ job, actions }: { job: WorkerJob; actions: Actions }) {
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
          <Text numberOfLines={1} style={styles.cardMeta}>{job.area} · {job.distanceLabel}</Text>
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
      <JobActions job={job} actions={actions} />
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
  correction: { padding: metrics.noticePadding, borderRadius: metrics.noticeRadius, backgroundColor: colors.waitingFill },
  correctionText: { color: colors.waitingText, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight },
  footnoteInline: { color: horizonColors.muted, fontSize: metrics.footnoteSize, lineHeight: metrics.footnoteLineHeight },
  actions: { flexDirection: 'row', gap: card.actionGap },
  actionWrap: { flex: 1 },
  action: { height: card.actionHeight, borderRadius: card.actionRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: cardColors.actionFill },
  actionSecondary: { backgroundColor: cardColors.actionSecondaryFill },
  actionLabel: { color: cardColors.actionLabel, fontSize: card.actionSize, fontWeight: card.actionWeight },
  actionSecondaryLabel: { color: cardColors.actionSecondaryLabel },
  disabled: { opacity: metrics.disabledOpacity },
  empty: { alignItems: 'center', paddingTop: card.emptyPaddingTop, paddingHorizontal: card.emptyPaddingHorizontal, gap: card.emptyGap },
  emptyTitle: { color: horizonColors.text, fontSize: card.emptyTitleSize, fontWeight: card.emptyTitleWeight, textAlign: 'center' },
  emptyBody: { color: horizonColors.muted, fontSize: card.emptyBodySize, lineHeight: card.emptyBodyLineHeight, textAlign: 'center' },
  footnote: { color: horizonColors.muted, fontSize: metrics.footnoteSize, lineHeight: metrics.footnoteLineHeight, textAlign: 'center' },
});
