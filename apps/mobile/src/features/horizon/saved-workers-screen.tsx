import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, PressScale, isFixtureBasis } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { formatRating, minReviewsToShowRating, type SavedWorker } from './content';
import { HeartToggle } from './motion-heart';
import { Presence } from './motion-presence';
import { ProfileAvatar } from './profile-avatar';
import { SupportEmpty, SupportShell, supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = { items?: readonly SavedWorker[]; onBack: () => void; onAskKael?: (worker: SavedWorker) => void; onRemove?: (worker: SavedWorker) => Promise<void> };

const removeFailure = 'Chưa bỏ lưu được. Kiểm tra kết nối rồi thử lại.';

export function SavedWorkersScreen({ items = [], onBack, onAskKael, onRemove }: Props) {
  const [removedIds, setRemovedIds] = useState<readonly string[]>([]);
  const [leavingIds, setLeavingIds] = useState<readonly string[]>([]);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<readonly string[]>([]);
  const visible = items.filter(item => !removedIds.includes(item.id));
  const showNote = visible.some(item => item.basis === undefined || isFixtureBasis(item.basis));
  const remove = (worker: SavedWorker) => {
    setFailedId(null);
    setRemovedIds(current => [...current, worker.id]);
    const settle = () => setLeavingIds(current => current.filter(entry => entry !== worker.id));
    (onRemove?.(worker) ?? Promise.resolve()).then(settle, () => {
      setRemovedIds(current => current.filter(entry => entry !== worker.id));
      setFailedId(worker.id);
      settle();
    });
  };
  const toggle = (id: string) => setExpandedIds(current => (current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]));
  return (
    <SupportShell title="Thợ đã lưu" onBack={onBack}>
      {visible.length === 0 ? (
        <SupportEmpty icon="heart" title="Chưa lưu thợ nào" body="Nhấn biểu tượng trái tim ở hồ sơ thợ để lưu lại." />
      ) : (
        <View style={styles.list}>
          {visible.map(item => (
            <WorkerCard
              key={item.id}
              worker={item}
              expanded={expandedIds.includes(item.id)}
              onToggle={() => toggle(item.id)}
              leaving={leavingIds.includes(item.id)}
              failed={failedId === item.id}
              onLeave={() => setLeavingIds(current => [...current, item.id])}
              onRemove={() => remove(item)}
              onAskKael={onAskKael}
            />
          ))}
          {showNote ? (
            <Text style={styles.footnote}>
              Dữ liệu trên là mẫu để xem giao diện. Khi có thật, điểm mạnh chỉ lấy từ đánh giá của khách đã dùng dịch vụ và mọi người đều xem được.
            </Text>
          ) : null}
        </View>
      )}
    </SupportShell>
  );
}

type CardProps = {
  worker: SavedWorker;
  expanded: boolean;
  leaving: boolean;
  failed: boolean;
  onLeave: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onAskKael?: (worker: SavedWorker) => void;
};

function WorkerCard({ worker, expanded, leaving, failed, onLeave, onToggle, onRemove, onAskKael }: CardProps) {
  const rated = worker.reviewCount >= minReviewsToShowRating;
  return (
    <Presence visible={!leaving} offset={0} onExited={onRemove}>
    <View style={styles.card}>
      <View style={styles.header}>
        <ProfileAvatar name={worker.name.replace(/^Thợ\s+/u, '')} size={metrics.workerAvatarSize} initialSize={metrics.workerAvatarInitialSize} />
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>{worker.name}</Text>
          <Text numberOfLines={1} style={styles.meta}>{worker.trade} · {worker.area}</Text>
          <Text numberOfLines={1} style={styles.saved}>{worker.savedLabel}</Text>
        </View>
        <HeartToggle saved={!leaving} accessibilityLabel={`Bỏ lưu ${worker.name}`} onPress={onLeave} iconSize={metrics.heartIconSize} style={styles.heart} />
      </View>

      {failed ? <Text accessibilityLiveRegion="polite" style={styles.failure}>{removeFailure}</Text> : null}

      <View style={styles.stats}>
        <Stat label="Tuổi nghề" value={`${worker.experienceYears} năm`} />
        <View style={styles.statDivider} />
        <Stat
          label={rated ? `${worker.reviewCount} đánh giá` : 'Đánh giá'}
          value={rated ? formatRating(worker.ratingAverage) : 'Chưa đủ'}
          icon={rated}
        />
        <View style={styles.statDivider} />
        <Stat label="Việc đã xong" value={String(worker.completedJobs)} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Kỹ năng</Text>
          <Text style={styles.sectionHint}>Thợ tự khai</Text>
        </View>
        <View style={styles.chips}>
          {worker.skills.map(skill => (
            <View key={skill} style={styles.skillChip}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Điểm mạnh</Text>
          <Text style={styles.sectionHint}>Từ đánh giá của khách</Text>
        </View>
        <View style={styles.strengthPanel}>
          {rated ? (
            worker.strengths.map(strength => (
              <View key={strength.label} style={styles.strengthRow}>
                <View style={styles.strengthHead}>
                  <Text style={styles.strengthLabel}>{strength.label}</Text>
                  <Text style={styles.strengthCount}>{strength.count} khách khen</Text>
                </View>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthBar, { flex: strength.count }]} />
                  <View style={{ flex: Math.max(worker.reviewCount - strength.count, 0) }} />
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.pending}>Điểm mạnh sẽ hiện khi thợ có ít nhất {minReviewsToShowRating} đánh giá từ khách.</Text>
          )}
        </View>
      </View>

      <Presence visible={expanded}>
        <View style={styles.detail}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Khu vực nhận việc</Text>
            <Text style={styles.reviewText}>{worker.serviceAreas.join(' · ')}</Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Nhận xét gần đây</Text>
            {worker.reviews.length === 0 ? (
              <Text style={styles.pending}>Chưa có nhận xét nào.</Text>
            ) : (
              <View style={styles.reviewList}>
                {worker.reviews.map(review => (
                  <View key={review.id} style={styles.review}>
                    <Text style={styles.reviewMeta}>{review.author} · {review.service} · {review.time}</Text>
                    <Text style={styles.reviewText}>{review.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </Presence>

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={expanded ? `Thu gọn hồ sơ ${worker.name}` : `Xem chi tiết hồ sơ ${worker.name}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={styles.toggle}
      >
        <Text style={styles.toggleLabel}>{expanded ? 'Thu gọn' : 'Xem chi tiết'}</Text>
      </PressScale>

      <PressScale accessibilityRole="button" accessibilityLabel={`Hỏi Kael về ${worker.name}`} onPress={() => onAskKael?.(worker)} style={supportStyles.secondary}>
        <Text style={supportStyles.secondaryLabel}>Hỏi Kael về thợ này</Text>
      </PressScale>
    </View>
    </Presence>
  );
}

function Stat({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statValueRow}>
        {icon ? <Icon name="star" size={metrics.workerStatIconSize} color={colors.ratingStar} fill={colors.ratingStar} /> : null}
        <Text numberOfLines={1} style={styles.statValue}>{value}</Text>
      </View>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: metrics.workerCardListGap },
  card: { padding: metrics.workerCardPadding, gap: metrics.workerCardGap, borderRadius: metrics.workerCardRadius, backgroundColor: colors.cardFill },
  header: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap },
  copy: { flex: 1, minWidth: 0 },
  name: { color: horizonColors.text, fontSize: metrics.workerNameSize, fontWeight: metrics.workerNameWeight },
  meta: { color: horizonColors.muted, fontSize: metrics.workerMetaSize, marginTop: metrics.rowDetailGap },
  heart: { width: metrics.heartSize, height: metrics.heartSize, alignItems: 'center', justifyContent: 'center', marginRight: -metrics.statusGap },
  saved: { color: colors.sectionTitle, fontSize: metrics.fieldHintSize, marginTop: metrics.rowDetailGap },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: metrics.workerStatsPaddingVertical, borderRadius: metrics.workerStatsRadius, backgroundColor: colors.tileFill },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', gap: metrics.workerStatGap, paddingHorizontal: metrics.workerStatInlineGap },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.workerStatInlineGap },
  statValue: { color: horizonColors.text, fontSize: metrics.workerStatValueSize, fontWeight: metrics.workerStatValueWeight, lineHeight: metrics.workerStatValueLineHeight, fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.sectionTitle, fontSize: metrics.workerStatLabelSize },
  statDivider: { width: metrics.separatorHeight, alignSelf: 'stretch', backgroundColor: colors.separator },
  section: { gap: metrics.workerSectionGap },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: metrics.rowGap },
  sectionLabel: { color: horizonColors.text, fontSize: metrics.workerSectionTitleSize, fontWeight: metrics.workerSectionLabelWeight },
  sectionHint: { flexShrink: 1, color: colors.sectionTitle, fontSize: metrics.workerSectionHintSize },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.skillChipGap },
  skillChip: { minHeight: metrics.skillChipHeight, paddingHorizontal: metrics.skillChipPaddingHorizontal, borderRadius: metrics.skillChipRadius, backgroundColor: colors.skillChipFill, justifyContent: 'center' },
  skillText: { color: colors.skillChipText, fontSize: metrics.skillChipSize, fontWeight: metrics.fieldLabelWeight },
  strengthPanel: { gap: metrics.strengthListGap, padding: metrics.strengthPanelPadding, borderRadius: metrics.workerStatsRadius, backgroundColor: colors.tileFill },
  strengthRow: { gap: metrics.strengthRowGap },
  strengthHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: metrics.rowGap },
  strengthLabel: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: metrics.strengthLabelSize, fontWeight: metrics.strengthLabelWeight },
  strengthCount: { color: colors.sectionTitle, fontSize: metrics.strengthCountSize, fontVariant: ['tabular-nums'] },
  strengthTrack: { flexDirection: 'row', height: metrics.strengthBarHeight, borderRadius: metrics.strengthBarRadius, backgroundColor: colors.strengthTrack, overflow: 'hidden' },
  strengthBar: { borderRadius: metrics.strengthBarRadius, backgroundColor: colors.strengthBar },
  failure: { color: colors.danger, fontSize: metrics.noteSize, lineHeight: metrics.rowDetailLineHeight },
  pending: { color: horizonColors.muted, fontSize: metrics.noteSize, lineHeight: metrics.rowDetailLineHeight },
  detail: { gap: metrics.workerCardGap },
  reviewList: { gap: metrics.reviewListGap },
  review: { gap: metrics.reviewGap },
  reviewMeta: { color: colors.sectionTitle, fontSize: metrics.reviewMetaSize },
  reviewText: { color: horizonColors.text, fontSize: metrics.reviewTextSize, lineHeight: metrics.reviewTextLineHeight },
  toggle: { alignSelf: 'center', height: metrics.detailToggleHeight, paddingHorizontal: metrics.skillChipPaddingHorizontal, alignItems: 'center', justifyContent: 'center' },
  toggleLabel: { color: colors.actionLabel, fontSize: metrics.buttonSize, fontWeight: metrics.workerSectionLabelWeight },
  footnote: { color: horizonColors.muted, fontSize: metrics.fieldHintSize, lineHeight: metrics.rowDetailLineHeight, textAlign: 'center', paddingHorizontal: metrics.emptyPaddingHorizontal },
});
