import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Badge, Chip } from '@/features/shared';
import type { BadgeTone } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type RecommendationOption = Readonly<{ id: string; title: string; detail: string; confidence: number }>;

export type Recommendation = Readonly<{
  id: string;
  topic: string;
  prompt: string;
  options: readonly RecommendationOption[];
}>;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= metrics.levelHigh) return 'high';
  if (confidence >= metrics.levelMid) return 'medium';
  return 'low';
}

export function filledSegments(confidence: number): number {
  return Math.max(0, Math.min(metrics.meterSegments, Math.round(confidence * metrics.meterSegments)));
}

const levelLabels: Readonly<Record<ConfidenceLevel, string>> = { high: 'Độ tin cậy cao', medium: 'Độ tin cậy trung bình', low: 'Độ tin cậy thấp' };
const levelTones: Readonly<Record<ConfidenceLevel, BadgeTone>> = { high: 'success', medium: 'info', low: 'warning' };
const levelFills: Readonly<Record<ConfidenceLevel, string>> = { high: colors.dotGreen, medium: colors.dotIndigo, low: colors.dotYellow };

function Meter({ confidence }: { confidence: number }) {
  const level = confidenceLevel(confidence);
  const filled = filledSegments(confidence);
  return <View accessibilityRole="progressbar" accessibilityLabel={levelLabels[level]} style={styles.meter}>
    {Array.from({ length: metrics.meterSegments }, (_, position) => <View key={position} style={[styles.segment, position < filled && { backgroundColor: levelFills[level] }]}/>)}
  </View>;
}

type Props = {
  recommendation: Recommendation;
  onAccept: (option: RecommendationOption) => void;
};

export function RecommendationCard({ recommendation, onAccept }: Props) {
  const [currentId, setCurrentId] = useState(recommendation.options[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState<RecommendationOption | null>(null);
  const current = recommendation.options.find(option => option.id === currentId) ?? recommendation.options[0];
  if (current === undefined) return null;
  const others = recommendation.options.filter(option => option.id !== current.id);
  if (accepted !== null) {
    return <View accessibilityLiveRegion="polite" style={[styles.root, styles.accepted]}>
      <View style={styles.doneRow}>
        <View style={styles.doneMark}><Check size={metrics.stepNumber} color={colors.solidFg} strokeWidth={3}/></View>
        <Text style={styles.doneText}>Đã chọn: {accepted.title}</Text>
      </View>
    </View>;
  }
  const level = confidenceLevel(current.confidence);
  return <View style={styles.root}>
    <View style={styles.headRow}>
      <Chip label={recommendation.topic} hue="cyan"/>
      <Text style={styles.level}>{levelLabels[level]}</Text>
    </View>
    <Text style={styles.prompt}>{recommendation.prompt}</Text>
    <View style={styles.main}>
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.detail}>{current.detail}</Text>
      <Meter confidence={current.confidence}/>
    </View>
    {open && <View accessibilityLabel="Phương án khác" style={styles.others}>
      {others.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Chọn phương án: ${option.title}`} onPress={() => { setCurrentId(option.id); setOpen(false); }} style={styles.other}>
        <View style={styles.otherCopy}>
          <Text style={styles.otherTitle}>{option.title}</Text>
          <Text style={styles.detail}>{option.detail}</Text>
        </View>
        <Badge label={levelLabels[confidenceLevel(option.confidence)]} tone={levelTones[confidenceLevel(option.confidence)]} size="sm"/>
      </Pressable>)}
    </View>}
    <View style={styles.actions}>
      {others.length > 0 && <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={styles.skip}><Text style={styles.skipText}>Phương án khác</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => { setAccepted(current); onAccept(current); }} style={styles.submit}><Text style={styles.submitText}>Chấp nhận</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { borderRadius: metrics.radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: metrics.taskPadding, gap: metrics.gap },
  accepted: { backgroundColor: colors.kaelBubble },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.rowGap },
  level: { color: colors.muted, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  prompt: { color: colors.muted, fontSize: metrics.bodySize, lineHeight: metrics.questionLine },
  main: { gap: metrics.quarter, padding: metrics.taskGap, borderRadius: metrics.smallRadius, backgroundColor: colors.kaelBubble },
  title: { color: colors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  detail: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
  meter: { flexDirection: 'row', gap: metrics.meterGap, marginTop: metrics.rowGap },
  segment: { flex: 1, height: metrics.meterHeight, borderRadius: metrics.pillRadius, backgroundColor: colors.border },
  others: { gap: metrics.rowGap },
  other: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, padding: metrics.taskGap, borderRadius: metrics.questionOptionRadius, borderWidth: metrics.hair, borderColor: colors.border },
  otherCopy: { flex: 1, gap: metrics.tiny },
  otherTitle: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: metrics.rowGap },
  skip: { paddingHorizontal: metrics.taskPadding, height: metrics.questionOptionMin, justifyContent: 'center' },
  skipText: { color: colors.muted, fontSize: metrics.bodySize },
  submit: { paddingHorizontal: metrics.submitPaddingX, height: metrics.questionOptionMin, borderRadius: metrics.questionOptionRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.solidBg },
  submitText: { color: colors.solidFg, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap },
  doneMark: { width: metrics.radioSize, height: metrics.radioSize, borderRadius: metrics.pillRadius, backgroundColor: colors.successFg, alignItems: 'center', justifyContent: 'center' },
  doneText: { flex: 1, color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
});
