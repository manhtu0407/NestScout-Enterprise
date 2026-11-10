import { useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Chip, Icon, type IconName, type JobReview, PressScale, StatusDot, useGlassAccessibility, type StatusDotColor } from '@/features/shared';
import { ScreenHeader } from './support-shell';
import { JobChangePanel, type JobChangesApi } from './job-change-panel';
import { formatVisit, PreferredVisitPicker } from './preferred-visit-picker';
import { WorkerReviewPanel, type RequestWorker } from './worker-review-panel';

const metrics = horizonLayout.requestsScreen;
const colors = horizonColors.requestsScreen;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

export type RequestStage = 'waiting' | 'active' | 'done';

const stageDots: Readonly<Record<RequestStage, StatusDotColor>> = { waiting: 'yellow', active: 'indigo', done: 'green' };

export type PhotoSource = { uri: string; headers: Readonly<Record<string, string>> };

export type ServiceRequest = {
  id: string;
  title: string;
  icon: IconName;
  meta: string;
  status: string;
  stage: RequestStage;
  quoteCount?: number;
  step: number;
  nextAction: string;
  description: string;
  location?: string;
  createdLabel: string;
  photoCount?: number;
  photos?: readonly PhotoSource[];
  worker?: RequestWorker;
  preferredVisitAt?: string | null;
};

export const workflowSteps: readonly string[] = ['Đã gửi', 'Có báo giá', 'Chấp nhận', 'Ghép thợ', 'Thực hiện', 'Nghiệm thu'];

const tabs: readonly { stage: RequestStage; label: string; emptyTitle: string; emptyBody: string }[] = [
  { stage: 'waiting', label: 'Đang chờ', emptyTitle: 'Chưa có yêu cầu đang chờ', emptyBody: 'Hỏi Kael để tạo yêu cầu mới, báo giá sẽ về đây.' },
  { stage: 'active', label: 'Đang làm', emptyTitle: 'Chưa có việc đang làm', emptyBody: 'Việc đang được thợ thực hiện sẽ hiện ở đây.' },
  { stage: 'done', label: 'Đã xong', emptyTitle: 'Chưa có việc hoàn tất', emptyBody: 'Các việc đã hoàn tất sẽ được lưu lại ở đây.' },
];

type Props = {
  requests?: readonly ServiceRequest[];
  onBack: () => void;
  onViewQuotes?: () => void;
  onAskKael?: (request: ServiceRequest) => void;
  onSetPreferredVisit?: (request: ServiceRequest, at: Date | null) => Promise<void>;
  onToggleSaveWorker?: (worker: RequestWorker) => Promise<void>;
  onReviewWorker?: (worker: RequestWorker, review: JobReview) => Promise<void>;
  jobChanges?: { userId: string; api: JobChangesApi };
  focusId?: string;
};

function RequestCard({ request, expanded, onToggle, onViewQuotes, onAskKael, onSetPreferredVisit, onToggleSaveWorker, onReviewWorker, jobChanges }: CardProps) {
  const finished = request.step >= workflowSteps.length;
  const caption = finished ? `Đủ ${workflowSteps.length}/${workflowSteps.length} bước` : `Bước ${request.step + 1}/${workflowSteps.length} · ${workflowSteps[request.step]}`;
  const needsYou = Boolean(request.quoteCount);
  return (
    <View style={styles.card}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${request.title}, ${request.meta}, ${request.status}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.cardTop}
      >
        <View style={styles.tile}>
          <Icon name={request.icon} size={metrics.tileIconSize} />
        </View>
        <View style={styles.cardCopy}>
          <Text numberOfLines={1} style={styles.cardTitle}>{request.title}</Text>
          <Text numberOfLines={1} style={styles.cardMeta}>{request.meta}</Text>
        </View>
        <View style={[styles.toggle, { transform: [{ rotate: expanded ? metrics.toggleOpenRotation : metrics.toggleClosedRotation }] }]}>
          <Icon name="chevron" size={metrics.toggleSize} color={colors.toggleIcon} strokeWidth={metrics.toggleStroke} />
        </View>
      </PressScale>
      <View style={styles.cardBottom}>
        <View style={styles.statusRow}>
          <StatusDot tone={stageDots[request.stage]} />
          <Text style={styles.status}>{request.status}</Text>
        </View>
        {request.quoteCount ? <Chip label={`${request.quoteCount} báo giá`} variant="bold" hue="lime" /> : null}
      </View>
      <View style={styles.block}>
        <View accessibilityRole="progressbar" accessibilityLabel={caption} style={styles.segments}>
          {workflowSteps.map((label, index) => (
            <View key={label} style={[styles.segment, index < request.step && styles.segmentDone]} />
          ))}
        </View>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <View style={styles.next}>
        <View style={[styles.nextIcon, needsYou && styles.nextIconActive]}>
          <Icon name={needsYou ? 'receipt' : 'clock'} size={metrics.nextIconSize} color={needsYou ? colors.nextAccent : colors.stepCaption} />
        </View>
        <View style={styles.nextCopy}>
          <Text style={styles.nextLabel}>{needsYou ? 'Việc của bạn' : 'Hiện tại'}</Text>
          <Text style={styles.nextText}>{request.nextAction}</Text>
        </View>
      </View>
      {expanded ? (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>Thông tin yêu cầu</Text>
          <Info label="Mô tả" value={request.description} />
          {request.location ? <Info label="Địa điểm" value={request.location} /> : null}
          <Info label="Gửi lúc" value={request.createdLabel} />
          {request.photoCount !== undefined ? <Info label="Ảnh đính kèm" value={request.photoCount > 0 ? `${request.photoCount} ảnh` : 'Không có'} /> : null}
          {request.photos && request.photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
              {request.photos.map((photo, index) => (
                <Image key={photo.uri} source={{ uri: photo.uri, headers: { ...photo.headers } }} style={styles.photo} resizeMode="cover" accessibilityLabel={`Ảnh đính kèm ${index + 1}`} />
              ))}
            </ScrollView>
          ) : null}
          {request.worker && onToggleSaveWorker && onReviewWorker ? (
            <WorkerReviewPanel worker={request.worker} finished={request.stage === 'done'} onToggleSave={onToggleSaveWorker} onReview={onReviewWorker} />
          ) : null}
          {request.worker && jobChanges && request.stage !== 'done' ? <JobChangePanel jobId={request.worker.jobId} userId={jobChanges.userId} api={jobChanges.api} /> : null}
          {request.stage === 'waiting' && !request.worker && onSetPreferredVisit
            ? <PreferredVisitPicker value={request.preferredVisitAt ?? null} onSave={at => onSetPreferredVisit(request, at)} />
            : request.preferredVisitAt ? <Info label="Thời gian bạn mong muốn" value={`${formatVisit(request.preferredVisitAt)} · chưa phải lịch hẹn đã xác nhận`} /> : null}
          <Text style={styles.detailTitle}>Tiến trình</Text>
          <View>
            {workflowSteps.map((label, index) => {
              const done = index < request.step;
              const current = index === request.step;
              const last = index === workflowSteps.length - 1;
              return (
                <View key={label} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, done && styles.timelineDotDone, current && styles.timelineDotCurrent]}>
                      {done ? <Icon name="check" size={metrics.timelineDotIcon} color={colors.timelineDoneIcon} strokeWidth={metrics.timelineDotStroke} /> : null}
                    </View>
                    {last ? null : <View style={[styles.timelineLine, done && styles.timelineLineDone]} />}
                  </View>
                  <Text style={[styles.timelineLabel, !done && !current && styles.timelineLabelPending, current && styles.timelineLabelCurrent]}>{label}</Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.note}>Chấp nhận báo giá chưa thu tiền. Thanh toán chưa được kết nối.</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {request.quoteCount ? (
          <PressScale accessibilityRole="button" accessibilityLabel={`Xem báo giá của ${request.title}`} onPress={() => onViewQuotes?.()} style={styles.action} wrapperStyle={styles.actionWrap}>
            <Text style={styles.actionLabel}>Xem báo giá</Text>
          </PressScale>
        ) : null}
        {onAskKael ? <PressScale accessibilityRole="button" accessibilityLabel={`Hỏi Kael về ${request.title}`} onPress={() => onAskKael(request)} style={[styles.action, styles.actionSecondary]} wrapperStyle={styles.actionWrap}>
          <Text style={[styles.actionLabel, styles.actionSecondaryLabel]}>Hỏi Kael</Text>
        </PressScale> : null}
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

type CardProps = {
  request: ServiceRequest;
  expanded: boolean;
  onToggle: () => void;
  onViewQuotes?: () => void;
  onAskKael?: (request: ServiceRequest) => void;
  onSetPreferredVisit?: (request: ServiceRequest, at: Date | null) => Promise<void>;
  onToggleSaveWorker?: (worker: RequestWorker) => Promise<void>;
  onReviewWorker?: (worker: RequestWorker, review: JobReview) => Promise<void>;
  jobChanges?: { userId: string; api: JobChangesApi };
};

export function RequestsScreen({ requests = [], onBack, onViewQuotes, onAskKael, onSetPreferredVisit, onToggleSaveWorker, onReviewWorker, jobChanges, focusId }: Props) {
  const focused = requests.find(request => request.id === focusId);
  const [expandedIds, setExpandedIds] = useState<readonly string[]>(focused ? [focused.id] : []);
  const { reduceMotion } = useGlassAccessibility();
  const [index, setIndex] = useState(() => Math.max(0, tabs.findIndex(tab => tab.stage === focused?.stage)));
  const [trackWidth, setTrackWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(Math.max(0, tabs.findIndex(tab => tab.stage === focused?.stage))));

  useEffect(() => {
    if (reduceMotion) {
      position.setValue(index);
      return;
    }
    const slide = Animated.timing(position, {
      toValue: index,
      duration: metrics.indicatorDuration,
      easing: easeOut,
      useNativeDriver: true,
    });
    slide.start();
    return () => slide.stop();
  }, [index, position, reduceMotion]);

  const tabWidth = trackWidth / tabs.length;
  const current = tabs[index] ?? tabs[0];
  const visible = requests.filter(request => request.stage === current?.stage);
  const handleLayout = (event: LayoutChangeEvent) =>
    setTrackWidth(event.nativeEvent.layout.width - metrics.tabsPadding * 2);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Yêu cầu của tôi" onBack={onBack} />
      <View style={styles.headerGap} />
      <View accessibilityRole="tablist" onLayout={handleLayout} style={styles.tabs}>
        {trackWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: tabWidth,
                transform: [{
                  translateX: position.interpolate({
                    inputRange: [0, tabs.length - 1],
                    outputRange: [0, tabWidth * (tabs.length - 1)],
                  }),
                }],
              },
            ]}
          />
        )}
        {tabs.map((tab, tabIndex) => {
          const count = requests.filter(request => request.stage === tab.stage).length;
          const selected = tabIndex === index;
          return (
            <Pressable
              key={tab.stage}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label}, ${count}`}
              accessibilityState={{ selected }}
              onPress={() => setIndex(tabIndex)}
              style={styles.tab}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {visible.length > 0 ? (
          visible.map(request => (
            <RequestCard
              key={request.id}
              request={request}
              expanded={expandedIds.includes(request.id)}
              onToggle={() => setExpandedIds(current => (current.includes(request.id) ? current.filter(id => id !== request.id) : [...current, request.id]))}
              onViewQuotes={onViewQuotes}
              onAskKael={onAskKael}
              onSetPreferredVisit={onSetPreferredVisit}
              onToggleSaveWorker={onToggleSaveWorker}
              onReviewWorker={onReviewWorker}
              jobChanges={jobChanges}
            />
          ))
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.empty}>
            <Icon name="requests" size={metrics.emptyIconSize} color={colors.emptyIcon} />
            <Text style={styles.emptyTitle}>{current?.emptyTitle}</Text>
            <Text style={styles.emptyBody}>{current?.emptyBody}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: metrics.paddingHorizontal },
  headerGap: { height: metrics.titleMarginBottom },
  tabs: { flexDirection: 'row', padding: metrics.tabsPadding, borderRadius: metrics.tabsRadius, backgroundColor: colors.tabsFill },
  indicator: {
    position: 'absolute',
    top: metrics.tabsPadding,
    left: metrics.tabsPadding,
    bottom: metrics.tabsPadding,
    borderRadius: metrics.tabRadius,
    backgroundColor: colors.indicator,
    boxShadow: colors.indicatorShadow,
  },
  tab: { flex: 1, minHeight: metrics.tabHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: metrics.tabGap },
  tabLabel: { color: colors.tabText, fontSize: metrics.tabFontSize, fontWeight: metrics.tabFontWeight },
  tabLabelActive: { color: colors.tabTextActive },
  list: { flex: 1 },
  listContent: { gap: metrics.listGap, paddingTop: metrics.listPaddingTop, paddingBottom: metrics.listPaddingBottom },
  card: { padding: metrics.cardPadding, gap: metrics.cardGap, borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: metrics.cardGap },
  toggle: { width: metrics.toggleHitSize, height: metrics.toggleHitSize, alignItems: 'center', justifyContent: 'center', borderRadius: metrics.toggleHitSize, backgroundColor: colors.toggleFill },
  block: { gap: metrics.blockGap },
  segments: { flexDirection: 'row', gap: metrics.stepSegmentGap },
  segment: { flex: 1, height: metrics.stepSegmentHeight, borderRadius: metrics.stepSegmentRadius, backgroundColor: colors.stepTrack },
  segmentDone: { backgroundColor: colors.stepFill },
  caption: { color: colors.stepCaption, fontSize: metrics.stepCaptionSize, fontWeight: metrics.stepCaptionWeight },
  next: { flexDirection: 'row', alignItems: 'center', gap: metrics.nextGap, padding: metrics.nextPadding, borderRadius: metrics.nextRadius, backgroundColor: colors.nextFill },
  nextIcon: { width: metrics.toggleHitSize, height: metrics.toggleHitSize, borderRadius: metrics.toggleHitSize, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.stepTrack },
  nextIconActive: { backgroundColor: colors.nextAccentFill },
  nextCopy: { flex: 1, minWidth: 0, gap: metrics.infoLabelGap },
  nextLabel: { color: colors.infoLabel, fontSize: metrics.nextLabelSize, fontWeight: metrics.stepCaptionWeight },
  nextText: { color: horizonColors.text, fontSize: metrics.nextTextSize, lineHeight: metrics.nextTextLineHeight },
  detail: { gap: metrics.infoGap },
  detailTitle: { color: colors.infoLabel, fontSize: metrics.detailTitleSize, fontWeight: metrics.detailTitleWeight },
  info: { gap: metrics.infoLabelGap },
  photos: { gap: metrics.photoGap },
  photo: { width: metrics.photoSize, height: metrics.photoSize, borderRadius: metrics.photoRadius, backgroundColor: colors.photoFill },
  infoLabel: { color: colors.infoLabel, fontSize: metrics.infoLabelSize },
  infoValue: { color: horizonColors.text, fontSize: metrics.infoValueSize, lineHeight: metrics.infoValueLineHeight },
  timelineRow: { flexDirection: 'row', gap: metrics.timelineGap, minHeight: metrics.timelineRowMinHeight },
  timelineRail: { alignItems: 'center', width: metrics.timelineDot },
  timelineDot: { width: metrics.timelineDot, height: metrics.timelineDot, borderRadius: metrics.timelineDot, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.timelinePending },
  timelineDotDone: { backgroundColor: colors.timelineDone },
  timelineDotCurrent: { backgroundColor: colors.timelineCurrent },
  timelineLine: { flex: 1, width: metrics.timelineLine, backgroundColor: colors.timelineLine },
  timelineLineDone: { backgroundColor: colors.timelineDone },
  timelineLabel: { color: horizonColors.text, fontSize: metrics.timelineLabelSize, fontWeight: metrics.timelineLabelWeight, lineHeight: metrics.timelineDot },
  timelineLabelPending: { color: colors.timelinePendingText },
  timelineLabelCurrent: { fontWeight: metrics.detailTitleWeight },
  note: { color: horizonColors.muted, fontSize: metrics.noteSize, lineHeight: metrics.noteLineHeight },
  actions: { flexDirection: 'row', gap: metrics.actionGap },
  actionWrap: { flex: 1 },
  action: { minHeight: metrics.actionHeight, borderRadius: metrics.actionRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.actionFill },
  actionSecondary: { backgroundColor: colors.actionSecondaryFill },
  actionLabel: { color: colors.actionLabel, fontSize: metrics.actionSize, fontWeight: metrics.actionWeight },
  actionSecondaryLabel: { color: colors.actionSecondaryLabel },
  tile: {
    width: metrics.tileSize,
    height: metrics.tileSize,
    borderRadius: metrics.tileRadius,
    backgroundColor: colors.tileFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: horizonColors.text, fontSize: metrics.cardTitleSize, fontWeight: metrics.cardTitleWeight },
  cardMeta: { color: horizonColors.muted, fontSize: metrics.metaSize, marginTop: metrics.metaGap },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.cardGap },
  statusRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: horizonLayout.designKit.statusDotGap },
  status: { flex: 1, color: horizonColors.text, fontSize: metrics.statusSize, fontWeight: metrics.statusWeight },
  empty: { alignItems: 'center', paddingTop: metrics.emptyPaddingTop, paddingHorizontal: metrics.emptyPaddingHorizontal, gap: metrics.emptyGap },
  emptyTitle: { color: horizonColors.text, fontSize: metrics.emptyTitleSize, fontWeight: metrics.emptyTitleWeight, textAlign: 'center' },
  emptyBody: { color: horizonColors.muted, fontSize: metrics.emptyBodySize, lineHeight: metrics.emptyBodyLineHeight, textAlign: 'center' },
});
