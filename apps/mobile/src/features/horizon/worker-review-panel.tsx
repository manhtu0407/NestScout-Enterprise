import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, isDefinitiveFailure, PressScale, type JobReview } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { Rating } from './rating';
import { supportStyles } from './support-shell';

const metrics = horizonLayout.supportScreens;
const requestMetrics = horizonLayout.requestsScreen;
const colors = horizonColors.supportScreens;
const requestColors = horizonColors.requestsScreen;
const webInputStyle = { outlineStyle: 'solid', outlineWidth: 0 } as const;

export type RequestWorker = { jobId: string; profileId: string; name: string; saved: boolean; rating: number | null; listed: boolean };

export const reviewTags: readonly string[] = ['Đúng giờ', 'Gọn gàng', 'Giá hợp lý', 'Nhiệt tình', 'Làm kỹ'];
export const maxReviewLength = 1000;

type Props = {
  worker: RequestWorker;
  finished: boolean;
  onToggleSave: (worker: RequestWorker) => Promise<void>;
  onReview: (worker: RequestWorker, review: JobReview) => Promise<void>;
};

export function WorkerReviewPanel({ worker, finished, onToggleSave, onReview }: Props) {
  const [composing, setComposing] = useState(false);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<readonly string[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onToggleSave(worker);
    } catch (failure) {
      setError(isDefinitiveFailure(failure) ? 'Không lưu được thợ này. Tải lại để xem trạng thái mới nhất.' : 'Chưa lưu được thợ. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = (tag: string) => setTags(current => (current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]));

  const submit = async () => {
    if (busy || rating === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onReview(worker, { rating, body: body.trim(), tags });
      setComposing(false);
    } catch {
      setError('Chưa gửi được đánh giá. Kiểm tra kết nối rồi thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Thợ thực hiện</Text>
      <View style={styles.row}>
        <Text numberOfLines={1} style={styles.name}>{worker.name}</Text>
        {worker.saved || worker.listed ? <PressScale
          accessibilityRole="button"
          accessibilityLabel={worker.saved ? `Bỏ lưu ${worker.name}` : `Lưu ${worker.name}`}
          accessibilityState={{ selected: worker.saved, busy }}
          onPress={toggleSave}
          style={[styles.action, worker.saved && styles.actionSelected]}
        >
          <Icon name="heart" size={requestMetrics.nextIconSize} color={worker.saved ? colors.heartFilled : requestColors.actionSecondaryLabel} />
          <Text style={styles.actionLabel}>{worker.saved ? 'Đã lưu' : 'Lưu thợ'}</Text>
        </PressScale> : null}
      </View>
      {!worker.saved && !worker.listed ? <Text style={styles.note}>Hồ sơ của thợ chưa được công khai nên chưa thể lưu vào danh sách thợ đã lưu.</Text> : null}
      {worker.rating !== null ? (
        <Rating label="Bạn đã đánh giá" value={worker.rating} readOnly size="md" />
      ) : finished ? (
        composing ? (
          <View style={styles.form}>
            <Rating label="Đánh giá thợ" value={rating} onChange={setRating} size="lg" />
            <View style={styles.tags}>
              {reviewTags.map(tag => {
                const selected = tags.includes(tag);
                return (
                  <PressScale
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={tag}
                    accessibilityState={{ selected }}
                    onPress={() => toggleTag(tag)}
                    style={[styles.tag, selected && styles.tagSelected]}
                  >
                    <Text style={[styles.tagLabel, selected && styles.tagLabelSelected]}>{tag}</Text>
                  </PressScale>
                );
              })}
            </View>
            <View style={styles.box}>
              <TextInput
                accessibilityLabel="Nhận xét về thợ"
                style={[styles.input, webInputStyle]}
                value={body}
                onChangeText={setBody}
                placeholder="Chia sẻ trải nghiệm của bạn (không bắt buộc)"
                placeholderTextColor={colors.searchPlaceholder}
                maxLength={maxReviewLength}
                multiline
              />
            </View>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel="Gửi đánh giá"
              accessibilityState={{ disabled: rating === 0 || busy, busy }}
              disabled={rating === 0 || busy}
              onPress={submit}
              style={[supportStyles.primary, (rating === 0 || busy) && styles.disabled]}
            >
              <Text style={supportStyles.primaryLabel}>Gửi đánh giá</Text>
            </PressScale>
          </View>
        ) : (
          <PressScale accessibilityRole="button" accessibilityLabel={`Đánh giá ${worker.name}`} onPress={() => setComposing(true)} style={styles.action}>
            <Icon name="star" size={requestMetrics.nextIconSize} color={requestColors.actionSecondaryLabel} />
            <Text style={styles.actionLabel}>Đánh giá thợ</Text>
          </PressScale>
        )
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: requestMetrics.infoGap },
  title: { color: requestColors.infoLabel, fontSize: requestMetrics.detailTitleSize, fontWeight: requestMetrics.detailTitleWeight },
  row: { flexDirection: 'row', alignItems: 'center', gap: requestMetrics.cardGap },
  name: { flex: 1, minWidth: 0, color: horizonColors.text, fontSize: requestMetrics.cardTitleSize, fontWeight: requestMetrics.cardTitleWeight },
  action: {
    height: requestMetrics.actionHeight,
    paddingHorizontal: requestMetrics.cardPadding,
    borderRadius: requestMetrics.actionRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: requestMetrics.tabGap,
    backgroundColor: requestColors.actionSecondaryFill,
  },
  actionSelected: { backgroundColor: colors.quoteDeclinedFill },
  actionLabel: { color: requestColors.actionSecondaryLabel, fontSize: requestMetrics.actionSize, fontWeight: requestMetrics.actionWeight },
  form: { gap: requestMetrics.infoGap },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.skillChipGap },
  tag: { minHeight: metrics.skillChipHeight, paddingHorizontal: metrics.skillChipPaddingHorizontal, borderRadius: metrics.skillChipRadius, justifyContent: 'center', backgroundColor: colors.chipFill },
  tagSelected: { backgroundColor: colors.primaryFill },
  tagLabel: { color: colors.chipText, fontSize: metrics.skillChipSize, fontWeight: metrics.heroChipWeight },
  tagLabelSelected: { color: colors.primaryLabel },
  box: { minHeight: metrics.supportBodyMinHeight, borderRadius: metrics.fieldRadius, paddingHorizontal: metrics.fieldPaddingHorizontal, paddingVertical: metrics.rowPaddingVertical, backgroundColor: colors.searchFill },
  input: { color: horizonColors.text, fontSize: metrics.fieldFontSize, minHeight: metrics.supportBodyMinHeight, textAlignVertical: 'top' },
  disabled: { opacity: metrics.saveDisabledOpacity },
  error: { color: colors.danger, fontSize: requestMetrics.noteSize, lineHeight: requestMetrics.noteLineHeight },
  note: { color: requestColors.infoLabel, fontSize: requestMetrics.noteSize, lineHeight: requestMetrics.noteLineHeight },
});
