import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CaseApprovalCard, ChatMessage, RecommendationCard, SelectionActions } from '@/features/horizon';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { approvalSteps, chatQuestion, recommendations, selectionSample } from './kael-new-designs-data';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;
const frame = horizonLayout.kaelWorkflowLab;
const frameColors = horizonColors.kaelWorkflowLab;
const ignore = () => undefined;

type Tab = 'approval' | 'recommendation' | 'selection' | 'chat';

const tabs: readonly Readonly<{ id: Tab; label: string }>[] = [
  { id: 'approval', label: 'Approval Card' },
  { id: 'recommendation', label: 'Recommendation Card' },
  { id: 'selection', label: 'Selection Actions' },
  { id: 'chat', label: 'Trong chat' },
];

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.note}>{note}</Text>
    {children}
  </View>;
}

function RecommendationDemo() {
  const [topic, setTopic] = useState(0);
  const current = recommendations[topic] ?? recommendations[0];
  return <>
    <View style={styles.topics}>
      {recommendations.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: index === topic }} onPress={() => setTopic(index)} style={[styles.topic, index === topic && styles.topicOn]}>
        <Text style={[styles.topicText, index === topic && styles.topicTextOn]}>{item.topic}</Text>
      </Pressable>)}
    </View>
    {current !== undefined && <RecommendationCard key={current.id} recommendation={current} onAccept={ignore}/>}
  </>;
}

function ChatDemo() {
  const first = recommendations[0];
  return <>
    <ChatMessage role="user" text={chatQuestion}/>
    <ChatMessage role="kael" text="Máy lạnh không mát thường do dàn lạnh bám bụi hoặc thiếu gas. Mình gợi ý hướng xử lý bên dưới."/>
    {first !== undefined && <RecommendationCard key={first.id} recommendation={first} onAccept={ignore}/>}
    <ChatMessage role="kael" text="Để tóm tắt công việc cho thợ, mình cần hỏi thêm vài thông tin."/>
    <CaseApprovalCard steps={approvalSteps} onConfirm={ignore}/>
    <Text style={styles.note}>Bôi đen một đoạn trong câu trả lời của Kael để hỏi tiếp:</Text>
    <SelectionActions text={selectionSample} onAction={ignore}/>
  </>;
}

export function KaelWorkflowLab() {
  const [tab, setTab] = useState<Tab>('approval');
  const [round, setRound] = useState(0);
  return <SafeAreaProvider>
    <View style={styles.root}>
      <Text accessibilityRole="header" style={styles.heading}>Kael · 3 thiết kế mới (bản mẫu)</Text>
      <View style={styles.tabs}>
        {tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: item.id === tab }} onPress={() => setTab(item.id)} style={[styles.tab, item.id === tab && styles.tabOn]}>
          <Text style={[styles.tabText, item.id === tab && styles.tabTextOn]}>{item.label}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" onPress={() => setRound(value => value + 1)} style={styles.reset}><Text style={styles.tabText}>Đặt lại</Text></Pressable>
      </View>
      <View style={styles.frame}>
        <ScrollView key={`${tab}-${round}`} contentContainerStyle={styles.content}>
          {tab === 'approval' && <Section title="Approval Card" note="Kael hỏi thêm từng bước, cuối cùng ra bản tóm tắt case trước khi đặt thợ. Dữ liệu mẫu, chưa đặt thợ thật.">
            <CaseApprovalCard steps={approvalSteps} onConfirm={ignore}/>
          </Section>}
          {tab === 'recommendation' && <Section title="Recommendation Card" note="Hiện ngay sau câu trả lời của Kael, theo từng chủ đề. Dữ liệu mẫu.">
            <RecommendationDemo/>
          </Section>}
          {tab === 'selection' && <Section title="Selection Actions" note="Bôi đen một đoạn chữ để chọn hành động gửi cho Kael. Chưa gọi mô hình.">
            <SelectionActions text={selectionSample} onAction={ignore}/>
          </Section>}
          {tab === 'chat' && <ChatDemo/>}
        </ScrollView>
      </View>
    </View>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', gap: metrics.gap, padding: metrics.padding, backgroundColor: frameColors.bg },
  heading: { color: colors.text, fontSize: metrics.heading, fontWeight: metrics.titleWeight },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: metrics.rowGap },
  tab: { paddingHorizontal: metrics.taskPadding, height: metrics.selectionButtonHeight, borderRadius: metrics.pillRadius, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tabOn: { backgroundColor: colors.solidBg },
  tabText: { color: colors.text, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  tabTextOn: { color: colors.solidFg },
  reset: { paddingHorizontal: metrics.taskPadding, height: metrics.selectionButtonHeight, justifyContent: 'center' },
  frame: { flex: 1, width: frame.frameWidth, maxWidth: frame.fullSize, borderRadius: frame.frameRadius, borderWidth: frame.frameBorder, borderColor: frameColors.frame, overflow: 'hidden', backgroundColor: colors.page },
  content: { padding: metrics.padding, gap: metrics.gap },
  section: { gap: metrics.gap },
  sectionTitle: { color: colors.text, fontSize: metrics.heading, fontWeight: metrics.titleWeight },
  note: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  topics: { flexDirection: 'row', gap: metrics.rowGap },
  topic: { paddingHorizontal: metrics.taskPadding, height: metrics.selectionButtonHeight, borderRadius: metrics.pillRadius, justifyContent: 'center', borderWidth: metrics.hair, borderColor: colors.border },
  topicOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  topicText: { color: colors.text, fontSize: metrics.captionSize },
  topicTextOn: { fontWeight: metrics.titleWeight },
});
