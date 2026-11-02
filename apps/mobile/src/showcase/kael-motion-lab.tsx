import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { KaelMatrixLoader, KaelProgressSheet, KaelShimmerText, KaelSpinnerCheck, KaelStreamingText, KaelThinkingRow, isKaelThinking, kaelPhaseEntries, kaelPhaseIssueNotes } from '@/features/horizon';
import type { KaelMatrixVariant, KaelPhase, KaelPhaseIssue } from '@/features/horizon';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.kaelMotionLab;
const colors = horizonColors.kaelMotionLab;
const bubbles = horizonLayout.kaelHomeScreen;

const variants: readonly KaelMatrixVariant[] = ['scan', 'twinkle', 'orbit', 'pulse'];
const continuation = 'Bạn có muốn xem báo giá chi tiết của từng thợ không?';
const answer = 'Kael đã tìm được ba thợ gần bạn. Thợ đầu tiên có thể đến trong hôm nay, báo giá dự kiến từ 450.000đ cho phần vòi nước bồn rửa.';

type ChipProps<T extends string> = { options: readonly { id: T; label: string }[]; value: T | null; onSelect: (id: T) => void };

function Chips<T extends string>({ options, value, onSelect }: ChipProps<T>) {
  return <View style={styles.chips}>
    {options.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: option.id === value }} onPress={() => onSelect(option.id)} style={[styles.chip, option.id === value && styles.chipActive]}>
      <Text style={[styles.chipText, option.id === value && styles.chipTextActive]}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}>
    <Text style={styles.title}>{title}</Text>
    <View style={styles.card}>{children}</View>
  </View>;
}

const phaseOptions = kaelPhaseEntries.map(entry => ({ id: entry.id, label: entry.control }));
const issueOptions: readonly { id: KaelPhaseIssue | 'none'; label: string }[] = [{ id: 'none', label: 'Đang xử lý' }, ...(Object.keys(kaelPhaseIssueNotes) as KaelPhaseIssue[]).map(id => ({ id, label: kaelPhaseIssueNotes[id].short }))];
const thinkingOptions = phaseOptions.filter(option => isKaelThinking(option.id));

export function KaelMotionLab() {
  const [thinkingPhase, setThinkingPhase] = useState<KaelPhase>('clarifying');
  const [issue, setIssue] = useState<KaelPhaseIssue | 'none'>('none');
  const [replay, setReplay] = useState(0);
  const [extra, setExtra] = useState(false);
  const [done, setDone] = useState(false);
  const [sheetPhase, setSheetPhase] = useState<KaelPhase>('quotes');
  const [shimmer, setShimmer] = useState(true);
  return <SafeAreaProvider>
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Kael đang xử lý: Thinking states + ghi chú bước + Matrix loader">
          <Chips options={thinkingOptions} value={thinkingPhase} onSelect={setThinkingPhase}/>
          <Chips options={issueOptions} value={issue} onSelect={setIssue}/>
          {isKaelThinking(thinkingPhase) ? <KaelThinkingRow phase={thinkingPhase} issue={issue === 'none' ? null : issue}/> : <Text style={styles.chipText}>Kael không ở trạng thái xử lý, không hiện hàng thinking.</Text>}
        </Section>
        <Section title="Streaming text">
          <Chips options={[{ id: 'replay', label: 'Phát lại' }, { id: 'grow', label: extra ? 'Bỏ đoạn thêm' : 'Nối thêm đoạn (stream)' }]} value={null} onSelect={id => { if (id === 'replay') setReplay(count => count + 1); else setExtra(value => !value); }}/>
          <View style={styles.bubble}>
            <KaelStreamingText key={replay} text={extra ? `${answer} ${continuation}` : answer} style={styles.bubbleText}/>
          </View>
        </Section>
        <Section title="Shimmer text">
          <Chips options={[{ id: 'toggle', label: shimmer ? 'Dừng' : 'Chạy' }]} value={null} onSelect={() => setShimmer(value => !value)}/>
          <KaelShimmerText active={shimmer} style={styles.bubbleText}>Kael đang suy nghĩ…</KaelShimmerText>
        </Section>
        <Section title="Matrix dot loader">
          <View style={styles.row}>
            {variants.map(variant => <KaelMatrixLoader key={variant} variant={variant} label={variant}/>)}
          </View>
        </Section>
        <Section title="Spinner → check">
          <Chips options={[{ id: 'toggle', label: done ? 'Quay lại đang chạy' : 'Hoàn tất' }]} value={null} onSelect={() => setDone(value => !value)}/>
          <KaelSpinnerCheck done={done} label={done ? 'Công việc đã hoàn tất, chưa xác nhận thanh toán' : 'Đang tiến hành'}/>
        </Section>
        <Section title="Bảng Tiến độ: chọn phase để xem các bước hiện dần và spinner → check">
          <Chips options={phaseOptions} value={sheetPhase} onSelect={setSheetPhase}/>
          <View style={styles.sheetStage}>
            <KaelProgressSheet key={sheetPhase} open phase={sheetPhase} bottomOffset={0} onClose={() => setSheetPhase('clarifying')}/>
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: horizonColors.bg },
  content: { padding: metrics.padding, gap: metrics.gap },
  section: { gap: metrics.chipGap },
  title: { color: colors.title, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  card: { backgroundColor: colors.card, borderRadius: metrics.cardRadius, padding: metrics.cardPadding, gap: metrics.cardGap },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.chipGap },
  chip: { backgroundColor: colors.chip, borderRadius: metrics.chipRadius, paddingHorizontal: metrics.chipPaddingX, paddingVertical: metrics.chipPaddingY },
  chipActive: { backgroundColor: colors.chipActive },
  chipText: { color: colors.chipText, fontSize: metrics.chipSize },
  chipTextActive: { color: colors.chipTextActive },
  row: { flexDirection: 'row', gap: metrics.rowGap },
  bubble: { borderRadius: bubbles.bubbleBorderRadius, padding: bubbles.bubblePadding, backgroundColor: horizonColors.bg },
  bubbleText: { color: horizonColors.text, fontSize: bubbles.bubbleTextFontSize, lineHeight: bubbles.bubbleTextLineHeight },
  sheetStage: { height: metrics.sheetHeight },
});
