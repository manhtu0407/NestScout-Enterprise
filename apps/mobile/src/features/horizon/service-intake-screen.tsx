import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { categoryFor, type ServiceKey } from './service-catalog';
import { answeredLines, composeIntake, kaelIntakePrompt, maxDescriptionLength, maxLocationLength, type IntakeErrors } from './service-intake';
import { SupportSection, SupportShell, supportStyles } from './support-shell';
import { useServiceIntake } from './use-service-intake';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;
const intake = horizonLayout.serviceIntake;
const intakeColors = horizonColors.serviceIntake;

export const intakeCopy = {
  photoLimit: 'Biểu mẫu này chưa nhận ảnh và Kael chưa phân tích ảnh. Hãy mô tả bằng chữ; bạn có thể gửi ảnh cho thợ sau khi có báo giá.',
  reviewLead: 'Kiểm tra lại nội dung. Yêu cầu chỉ được gửi khi bạn bấm “Xác nhận gửi”.',
  reviewNote: 'Gửi yêu cầu chưa phải đặt lịch, chưa có thợ hay giá được xác nhận. Bạn sẽ nhận báo giá để xem và tự quyết định.',
  receivedTitle: 'Đã gửi yêu cầu',
  receivedBody: 'Trạng thái: đã gửi, đang chờ báo giá. Chưa có thợ nào nhận việc và chưa có giá hay lịch hẹn nào được xác nhận.',
  pendingTitle: 'Có một yêu cầu chưa xác nhận được kết quả',
  pendingBody: 'Yêu cầu này đã được giữ lại trên thiết bị. Gửi lại dùng cùng mã gửi nên không tạo yêu cầu trùng. Nếu bạn đã thấy nó trong “Yêu cầu của tôi”, có thể bỏ bản đã lưu.',
  kaelHint: 'Kael chỉ giúp chuẩn bị nội dung. Bạn vẫn là người xác nhận trước khi gửi.',
} as const;

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength: number;
  editable: boolean;
};

function Field({ label, value, onChange, error, placeholder, multiline = false, maxLength, editable }: FieldProps) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      accessibilityLabel={label}
      accessibilityHint={error}
      editable={editable}
      maxLength={maxLength}
      multiline={multiline}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.searchPlaceholder}
      style={[styles.input, multiline && styles.multiline, error !== undefined && styles.inputError]}
      value={value}
    />
    {error !== undefined && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
  </View>;
}

function Choices({ label, options, value, onChange, disabled }: { label: string; options: readonly string[]; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.choices}>
      {options.map(option => {
        const selected = value === option;
        return <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${label}: ${option}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onChange(selected ? '' : option)} style={[styles.choice, selected && styles.choiceSelected]}>
          <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

function Action({ label, onPress, disabled = false, busy = false, kind = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; kind?: 'primary' | 'secondary' }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress} style={[kind === 'primary' ? supportStyles.primary : supportStyles.secondary, (disabled || busy) && styles.disabled]}>
    <Text style={kind === 'primary' ? supportStyles.primaryLabel : supportStyles.secondaryLabel}>{label}</Text>
  </Pressable>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue}>{value}</Text>
  </View>;
}

type Props = {
  userId: string;
  serviceKey: ServiceKey;
  onBack: () => void;
  onOpenRequests: () => void;
  onAskKael: (prompt: string) => void;
  kaelAvailable: boolean;
};

export function ServiceIntakeScreen({ userId, serviceKey, onBack, onOpenRequests, onAskKael, kaelAvailable }: Props) {
  const category = categoryFor(serviceKey);
  const flow = useServiceIntake(userId, serviceKey);
  const { draft, phase, errors, busy } = flow;
  const editable = !busy;
  const fieldErrors: IntakeErrors = errors;

  return <SupportShell title={category.title} subtitle={phase === 'received' ? undefined : category.blurb} onBack={onBack} backLabel="Quay về">
    {flow.message !== null && <Text accessibilityLiveRegion="polite" style={styles.banner}>{flow.message}</Text>}

    {phase === 'loading' && <Text accessibilityLiveRegion="polite" style={styles.status}>Đang chuẩn bị biểu mẫu…</Text>}

    {phase === 'unreadable' && <SupportSection>
      <Text style={styles.status}>Chưa đọc được bản nháp đã lưu trên thiết bị này.</Text>
      <View style={styles.actions}>
        <Action label="Thử lại" kind="secondary" onPress={flow.reload}/>
        <Action label="Bỏ bản đã lưu" kind="secondary" onPress={() => { void flow.discardPending(); }}/>
      </View>
    </SupportSection>}

    {phase === 'pending' && flow.pending !== null && <SupportSection title={intakeCopy.pendingTitle}>
      <Text style={styles.status}>{intakeCopy.pendingBody}</Text>
      <View style={styles.summary}>
        <SummaryRow label="Nội dung" value={flow.pending.description}/>
        {flow.pending.location !== '' && <SummaryRow label="Địa điểm" value={flow.pending.location}/>}
      </View>
      <View style={styles.actions}>
        <Action label={busy ? 'Đang gửi…' : 'Gửi lại'} busy={busy} onPress={() => { void flow.retryPending(); }}/>
        <Action label="Bỏ bản đã lưu" kind="secondary" disabled={busy} onPress={() => { void flow.discardPending(); }}/>
      </View>
    </SupportSection>}

    {phase === 'edit' && <>
      {category.safety !== null && <View accessibilityRole="alert" style={styles.safety}><Icon name="help" size={metrics.noteIconSize} color={intakeColors.safetyText}/><Text style={styles.safetyText}>{category.safety}</Text></View>}
      <Field label={category.descriptionLabel} value={draft.description} onChange={value => flow.setField('description', value)} error={fieldErrors.description} placeholder={category.descriptionPlaceholder} multiline maxLength={maxDescriptionLength} editable={editable}/>
      {category.questions.map(question => question.options
        ? <Choices key={question.id} label={question.label} options={question.options} value={draft.answers[question.id] ?? ''} onChange={value => flow.setAnswer(question.id, value)} disabled={!editable}/>
        : <Field key={question.id} label={question.label} value={draft.answers[question.id] ?? ''} onChange={value => flow.setAnswer(question.id, value)} error={fieldErrors[`answer:${question.id}`]} placeholder={question.placeholder} maxLength={intake.answerMaxLength} editable={editable}/>)}
      <Field label="Địa điểm thực hiện" value={draft.location} onChange={value => flow.setField('location', value)} error={fieldErrors.location} placeholder="Số nhà, đường, quận/huyện" maxLength={maxLocationLength} editable={editable}/>
      <Field label="Thời gian mong muốn (không bắt buộc)" value={draft.preferredTime} onChange={value => flow.setField('preferredTime', value)} error={fieldErrors.preferredTime} placeholder="Ví dụ: chiều thứ Bảy. Đây chưa phải lịch hẹn." maxLength={intake.answerMaxLength} editable={editable}/>
      <Text style={styles.note}>{intakeCopy.photoLimit}</Text>
      <View style={styles.actions}>
        <Action label="Xem lại" onPress={() => { flow.review(); }}/>
        {kaelAvailable && <>
          <Action label="Nhờ Kael hỗ trợ" kind="secondary" onPress={() => onAskKael(kaelIntakePrompt(flow.draft))}/>
          <Text style={styles.note}>{intakeCopy.kaelHint}</Text>
        </>}
      </View>
    </>}

    {phase === 'review' && <SupportSection title="Xem lại trước khi gửi">
      <Text style={styles.status}>{intakeCopy.reviewLead}</Text>
      <View style={styles.summary}>
        <SummaryRow label="Dịch vụ" value={category.title}/>
        <SummaryRow label="Nội dung" value={draft.description.trim()}/>
        {answeredLines(draft).map(line => <SummaryRow key={line.label} label={line.label} value={line.value}/>)}
        <SummaryRow label="Địa điểm" value={composeIntake(draft).location}/>
        {draft.preferredTime.trim() !== '' && <SummaryRow label="Thời gian mong muốn" value={`${draft.preferredTime.trim()} (chưa phải lịch hẹn)`}/>}
      </View>
      <Text style={styles.note}>{intakeCopy.reviewNote}</Text>
      <View style={styles.actions}>
        <Action label={busy ? 'Đang gửi…' : 'Xác nhận gửi'} busy={busy} onPress={() => { void flow.confirm(); }}/>
        <Action label="Sửa" kind="secondary" disabled={busy} onPress={flow.edit}/>
      </View>
    </SupportSection>}

    {phase === 'received' && <SupportSection title={intakeCopy.receivedTitle}>
      <Text accessibilityLiveRegion="polite" style={styles.status}>{intakeCopy.receivedBody}</Text>
      {flow.requestId !== null && <Text style={styles.note}>{`Mã yêu cầu: ${flow.requestId.slice(0, 8)}`}</Text>}
      <View style={styles.actions}>
        <Action label="Xem trong Yêu cầu của tôi" onPress={onOpenRequests}/>
        <Action label="Quay về" kind="secondary" onPress={onBack}/>
      </View>
    </SupportSection>}
  </SupportShell>;
}

const styles = StyleSheet.create({
  field: { gap: metrics.fieldLabelGap, marginBottom: metrics.fieldGap },
  label: { color: horizonColors.text, fontSize: metrics.fieldLabelSize, fontWeight: metrics.fieldLabelWeight },
  input: { minHeight: metrics.fieldHeight, borderRadius: metrics.fieldRadius, backgroundColor: colors.cardFill, paddingHorizontal: metrics.fieldPaddingHorizontal, color: horizonColors.text, fontSize: metrics.fieldFontSize, borderWidth: intake.borderWidth, borderColor: intakeColors.fieldBorder },
  multiline: { minHeight: metrics.supportBodyMinHeight, paddingTop: metrics.fieldPaddingHorizontal, textAlignVertical: 'top' },
  inputError: { borderColor: intakeColors.errorBorder },
  error: { color: intakeColors.errorText, fontSize: metrics.fieldHintSize, lineHeight: metrics.subtitleLineHeight },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.skillChipGap },
  choice: { minHeight: metrics.buttonHeight, borderRadius: metrics.buttonRadius, paddingHorizontal: metrics.fieldPaddingHorizontal, backgroundColor: colors.chipFill, justifyContent: 'center' },
  choiceSelected: { backgroundColor: colors.primaryFill },
  choiceText: { color: colors.chipText, fontSize: metrics.skillChipSize },
  choiceTextSelected: { color: colors.primaryLabel },
  actions: { gap: metrics.buttonGap, marginTop: metrics.sectionTitleGap },
  disabled: { opacity: metrics.saveDisabledOpacity },
  banner: { backgroundColor: intakeColors.bannerFill, color: intakeColors.bannerText, borderRadius: metrics.consentRadius, padding: metrics.consentPadding, fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight, marginBottom: metrics.fieldGap },
  safety: { flexDirection: 'row', gap: metrics.noteGap, backgroundColor: intakeColors.safetyFill, borderRadius: metrics.consentRadius, padding: metrics.consentPadding, marginBottom: metrics.fieldGap },
  safetyText: { flex: 1, color: intakeColors.safetyText, fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight },
  status: { color: horizonColors.text, fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight },
  note: { color: horizonColors.muted, fontSize: metrics.noteSize, lineHeight: metrics.subtitleLineHeight, marginBottom: metrics.sectionTitleGap },
  summary: { backgroundColor: colors.cardFill, borderRadius: metrics.cardRadius, padding: metrics.consentPadding, gap: metrics.consentGap },
  summaryRow: { gap: metrics.fieldHintGap },
  summaryLabel: { color: colors.sectionTitle, fontSize: metrics.noteSize, fontWeight: metrics.fieldLabelWeight },
  summaryValue: { color: horizonColors.text, fontSize: metrics.subtitleSize, lineHeight: metrics.subtitleLineHeight },
});
