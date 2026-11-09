import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { DateCalendar, dayLabel } from '@/features/shared';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;
const webReset = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });
const otherId = 'other';

export type QuestionOption = Readonly<{ id: string; label: string }>;

export type DatePicking = Readonly<{ today?: Date; isUnavailable?: (date: Date) => boolean }>;

type Props = {
  question: string;
  hint?: string;
  options: readonly QuestionOption[];
  date?: DatePicking;
  progress?: Readonly<{ index: number; total: number }>;
  onAnswer: (answer: string) => void;
  onSkip?: () => void;
};

export function QuestionCard({ question, hint, options, date, progress, onAnswer, onSkip }: Props) {
  const [picked, setPicked] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const label = date !== undefined ? (picked === null ? '' : `Thợ đến ${dayLabel(picked)}`) : selected === otherId ? other.trim() : options.find(option => option.id === selected)?.label ?? '';
  const ready = date !== undefined ? picked !== null : selected !== null && label !== '';
  const submit = () => {
    if (!ready) return;
    setAnswer(label);
    onAnswer(label);
  };
  if (answer !== null) {
    return <View accessibilityLiveRegion="polite" style={[styles.root, styles.answered]}>
      <Text style={styles.question}>{question}</Text>
      <View style={styles.answerRow}>
        <View style={styles.answerMark}><Check size={12} color={colors.solidFg} strokeWidth={3}/></View>
        <Text style={styles.answerText}>{answer}</Text>
      </View>
    </View>;
  }
  return <View style={styles.root}>
    {progress !== undefined && <View accessibilityLabel={`Câu ${progress.index} trên ${progress.total}`} style={styles.dots}>
      {Array.from({ length: progress.total }, (_, index) => <View key={index} style={[styles.pip, index < progress.index && styles.pipOn]}/>)}
    </View>}
    <Text style={styles.question}>{question}</Text>
    {hint !== undefined && <Text style={styles.hint}>{hint}</Text>}
    {date !== undefined ? <DateCalendar value={picked} onChange={setPicked} today={date.today} isUnavailable={date.isUnavailable}/> : <>
    <View style={styles.options}>
      {[...options, { id: otherId, label: 'Khác…' }].map(option => {
        const on = option.id === selected;
        return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setSelected(option.id)} style={[styles.option, on && styles.optionOn]}>
          <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot}/>}</View>
          <Text style={[styles.optionText, on && styles.optionTextOn]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
    {selected === otherId && <TextInput accessibilityLabel="Câu trả lời khác" value={other} onChangeText={setOther} placeholder="Mô tả thêm cho Kael" placeholderTextColor={colors.faint} autoFocus style={[styles.input, webReset]}/>}
    </>}
    <View style={styles.actions}>
      {onSkip !== undefined && <Pressable accessibilityRole="button" onPress={onSkip} style={styles.skip}><Text style={styles.skipText}>Bỏ qua</Text></Pressable>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={submit} style={[styles.submit, ready && styles.submitReady]}>
        <Text style={[styles.submitText, ready && styles.submitTextReady]}>Trả lời</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { borderRadius: metrics.radius, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, padding: metrics.taskPadding, gap: metrics.gap },
  answered: { backgroundColor: colors.kaelBubble },
  dots: { flexDirection: 'row', gap: metrics.quarter },
  pip: { width: metrics.pipWidth, height: metrics.pipHeight, borderRadius: metrics.pillRadius, backgroundColor: colors.border },
  pipOn: { backgroundColor: colors.accent },
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
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap },
  answerMark: { width: metrics.radioSize, height: metrics.radioSize, borderRadius: metrics.pillRadius, backgroundColor: colors.successFg, alignItems: 'center', justifyContent: 'center' },
  answerText: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
});
