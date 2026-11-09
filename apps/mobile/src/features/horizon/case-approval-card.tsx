import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Badge, Chip, DateCalendar, dayLabel } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;
const webReset = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });
const otherId = 'other';

export type ApprovalOption = Readonly<{ id: string; label: string }>;

export type ApprovalStep = Readonly<{
  id: string;
  question: string;
  hint?: string;
  options?: readonly ApprovalOption[];
  date?: Readonly<{ today?: Date; isUnavailable?: (date: Date) => boolean }>;
}>;

export type ApprovalAnswers = Readonly<Record<string, string | null>>;

export type SummaryLine = Readonly<{ id: string; question: string; answer: string | null }>;

export function summarize(steps: readonly ApprovalStep[], answers: ApprovalAnswers): readonly SummaryLine[] {
  return steps.map(step => ({ id: step.id, question: step.question, answer: answers[step.id] ?? null }));
}

export function missingCount(lines: readonly SummaryLine[]): number {
  return lines.filter(line => line.answer === null).length;
}

type Draft = Readonly<{ selected: string | null; other: string; date: Date | null }>;

const emptyDraft: Draft = { selected: null, other: '', date: null };

export function draftAnswer(step: ApprovalStep, draft: Draft): string {
  if (step.date !== undefined) return draft.date === null ? '' : dayLabel(draft.date);
  if (draft.selected === otherId) return draft.other.trim();
  return step.options?.find(option => option.id === draft.selected)?.label ?? '';
}

type Props = {
  steps: readonly ApprovalStep[];
  onConfirm: (answers: ApprovalAnswers) => void;
};

export function CaseApprovalCard({ steps, onConfirm }: Props) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<ApprovalAnswers>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, Draft>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const total = steps.length;
  const step = steps[index];
  const lines = summarize(steps, answers);
  const missing = missingCount(lines);
  const patch = (id: string, change: Partial<Draft>) => setDrafts(current => ({ ...current, [id]: { ...(current[id] ?? emptyDraft), ...change } }));
  const commit = (id: string, value: string | null) => {
    setAnswers(current => ({ ...current, [id]: value }));
    setIndex(current => Math.min(total, current + 1));
  };

  if (step === undefined) {
    return <View style={styles.root}>
      <View style={styles.headRow}>
        <Text accessibilityRole="header" style={styles.title}>Tóm tắt yêu cầu</Text>
        {missing === 0 ? <Badge label="Đầy đủ thông tin" tone="success" size="sm" dot/> : <Badge label={`Còn thiếu ${missing} mục`} tone="warning" size="sm" dot/>}
      </View>
      <View style={styles.lines}>
        {lines.map((line, position) => <View key={line.id} style={styles.line}>
          <View style={styles.lineCopy}>
            <Text style={styles.lineQuestion}>{line.question}</Text>
            {line.answer === null ? <Chip label="Chưa cung cấp" hue="yellow"/> : <Text style={styles.lineAnswer}>{line.answer}</Text>}
          </View>
          {!confirmed && <Pressable accessibilityRole="button" accessibilityLabel={`Sửa: ${line.question}`} onPress={() => setIndex(position)} style={styles.edit}><Text style={styles.editText}>Sửa</Text></Pressable>}
        </View>)}
      </View>
      {confirmed
        ? <View accessibilityLiveRegion="polite" style={styles.doneRow}>
          <View style={styles.doneMark}><Check size={metrics.stepNumber} color={colors.solidFg} strokeWidth={3}/></View>
          <Text style={styles.doneText}>Đã xác nhận yêu cầu. Chưa có thợ nào được đặt.</Text>
        </View>
        : <Pressable accessibilityRole="button" onPress={() => { setConfirmed(true); onConfirm(answers); }} style={[styles.submit, styles.submitReady]}>
          <Text style={[styles.submitText, styles.submitTextReady]}>Xác nhận yêu cầu</Text>
        </Pressable>}
    </View>;
  }

  const draft = drafts[step.id] ?? emptyDraft;
  const label = draftAnswer(step, draft);
  const ready = label !== '';
  return <View style={styles.root}>
    <View style={styles.headRow}>
      <View accessibilityLabel={`Câu ${index + 1} trên ${total}`} style={styles.dots}>
        {steps.map((item, position) => <View key={item.id} style={[styles.pip, position <= index && styles.pipOn]}/>)}
      </View>
      <Text style={styles.counter}>{index + 1} / {total}</Text>
    </View>
    <Text style={styles.question}>{step.question}</Text>
    {step.hint !== undefined && <Text style={styles.hint}>{step.hint}</Text>}
    {step.date !== undefined
      ? <DateCalendar value={draft.date} onChange={date => patch(step.id, { date })} today={step.date.today} isUnavailable={step.date.isUnavailable}/>
      : <View style={styles.options}>
        {[...(step.options ?? []), { id: otherId, label: 'Khác…' }].map(option => {
          const on = option.id === draft.selected;
          return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => patch(step.id, { selected: option.id })} style={[styles.option, on && styles.optionOn]}>
            <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot}/>}</View>
            <Text style={[styles.optionText, on && styles.optionTextOn]}>{option.label}</Text>
          </Pressable>;
        })}
      </View>}
    {step.date === undefined && draft.selected === otherId && <TextInput accessibilityLabel="Câu trả lời khác" value={draft.other} onChangeText={other => patch(step.id, { other })} placeholder="Mô tả thêm cho Kael" placeholderTextColor={colors.faint} autoFocus style={[styles.input, webReset]}/>}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" onPress={() => commit(step.id, null)} style={styles.skip}><Text style={styles.skipText}>Bỏ qua</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => commit(step.id, label)} style={[styles.submit, ready && styles.submitReady]}>
        <Text style={[styles.submitText, ready && styles.submitTextReady]}>{index === total - 1 ? 'Xem tóm tắt' : 'Tiếp tục'}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { borderRadius: metrics.radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: metrics.taskPadding, gap: metrics.gap },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.rowGap },
  dots: { flexDirection: 'row', gap: metrics.quarter },
  pip: { width: metrics.pipWidth, height: metrics.pipHeight, borderRadius: metrics.pillRadius, backgroundColor: colors.border },
  pipOn: { backgroundColor: colors.accent },
  counter: { color: colors.muted, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  title: { color: colors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  question: { color: colors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight, lineHeight: metrics.questionLine },
  hint: { color: colors.muted, fontSize: metrics.captionSize },
  options: { gap: metrics.rowGap },
  option: { minHeight: metrics.questionOptionMin, flexDirection: 'row', alignItems: 'center', gap: metrics.taskGap, paddingHorizontal: metrics.taskPadding, borderRadius: metrics.questionOptionRadius, borderWidth: metrics.hair, borderColor: colors.border },
  optionOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  radio: { width: metrics.radioSize, height: metrics.radioSize, borderRadius: metrics.pillRadius, borderWidth: metrics.edge, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: metrics.radioDot, height: metrics.radioDot, borderRadius: metrics.pillRadius, backgroundColor: colors.accent },
  optionText: { flex: 1, color: colors.text, fontSize: metrics.bodySize },
  optionTextOn: { fontWeight: metrics.titleWeight },
  input: { minHeight: metrics.questionInputMin, paddingHorizontal: metrics.taskPadding, borderRadius: metrics.questionOptionRadius, borderWidth: metrics.hair, borderColor: colors.accent, color: colors.text, fontSize: metrics.bodySize },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: metrics.rowGap },
  skip: { paddingHorizontal: metrics.taskPadding, height: metrics.questionOptionMin, justifyContent: 'center' },
  skipText: { color: colors.muted, fontSize: metrics.bodySize },
  submit: { paddingHorizontal: metrics.submitPaddingX, height: metrics.questionOptionMin, borderRadius: metrics.questionOptionRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralBg },
  submitReady: { backgroundColor: colors.solidBg },
  submitText: { color: colors.faint, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  submitTextReady: { color: colors.solidFg },
  lines: { gap: metrics.summaryGap },
  line: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, padding: metrics.taskGap, borderRadius: metrics.smallRadius, backgroundColor: colors.kaelBubble },
  lineCopy: { flex: 1, gap: metrics.quarter, alignItems: 'flex-start' },
  lineQuestion: { color: colors.muted, fontSize: metrics.captionSize },
  lineAnswer: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  edit: { paddingHorizontal: metrics.taskGap, height: metrics.selectionButtonHeight, justifyContent: 'center' },
  editText: { color: colors.accent, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap },
  doneMark: { width: metrics.radioSize, height: metrics.radioSize, borderRadius: metrics.pillRadius, backgroundColor: colors.successFg, alignItems: 'center', justifyContent: 'center' },
  doneText: { flex: 1, color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
});
