import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge, Chip } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { CaseApprovalCard } from './case-approval-card';
import type { ApprovalStep } from './case-approval-card';
import { QuestionCard } from './question-card';
import { RecommendationCard } from './recommendation-card';
import type { Recommendation } from './recommendation-card';
import { selectionActions } from './selection-actions';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

const ignore = () => undefined;

const previewRecommendation: Recommendation = {
  id: 'preview',
  topic: 'Gợi ý',
  prompt: 'Kael sẽ gợi ý bước tiếp theo ngay sau mỗi câu trả lời.',
  options: [{ id: 'preview-option', title: 'Phương án phù hợp nhất', detail: 'Phương án và độ tin cậy sẽ do Kael đề xuất theo từng chủ đề.', confidence: 0.8 }],
};

const previewSteps: readonly ApprovalStep[] = [
  { id: 'preview-area', question: 'Thợ cần đến khu vực nào?', hint: 'Kael sẽ hỏi thêm từng bước rồi tóm tắt yêu cầu trước khi đặt thợ.', options: [{ id: 'a', label: 'Khu vực của bạn' }] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Badge label="Coming Soon" tone="warning" size="sm" />
    </View>
    {children}
  </>;
}

function Locked({ children }: { children: ReactNode }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.locked}>{children}</View>;
}

export function LockedChatExtras() {
  return <View style={styles.root}>
    <Section title="Câu hỏi của Kael">
      <Locked><QuestionCard question="Thợ nên đến vào ngày nào?" options={[]} date={{}} onAnswer={ignore} /></Locked>
    </Section>
    <Section title="Gợi ý tiếp theo">
      <Locked><RecommendationCard recommendation={previewRecommendation} onAccept={ignore} /></Locked>
    </Section>
    <Section title="Tóm tắt yêu cầu">
      <Locked><CaseApprovalCard steps={previewSteps} onConfirm={ignore} /></Locked>
    </Section>
    <Section title="Hành động với đoạn đã chọn">
      <View style={styles.actions}>
        {selectionActions.map(action => <Chip key={action.id} label={action.label} hue="gray" />)}
      </View>
    </Section>
    <Section title="Nguồn tra cứu">
      <View style={styles.actions}>
        <Chip label="Chưa có nguồn" hue="gray" />
      </View>
    </Section>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  locked: { opacity: metrics.lockedOpacity },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.rowGap },
});
