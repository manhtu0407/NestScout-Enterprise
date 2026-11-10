import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { descriptionField, locationField, maxDescriptionLength, maxLocationLength, preferredField, preferredOptions, type IntakeField, type ServiceCategory } from './service-catalog';
import { IntakeFieldInput } from './service-intake-fields';
import { activeSafetyNotice, kaelIntakePrompt, summaryLines } from './service-intake';
import { SupportCard, SupportShell, supportStyles } from './support-shell';
import { useServiceIntake } from './use-service-intake';

const metrics = horizonLayout.supportScreens;
const colors = horizonColors.supportScreens;

type Props = {
  category: ServiceCategory;
  userId: string;
  onBack: () => void;
  onOpenRequests: (requestId: string) => void;
  onAskKael: (prompt: string) => void;
};

const commonFields = (category: ServiceCategory): readonly IntakeField[] => [
  { id: descriptionField, label: category.descriptionLabel, kind: 'multiline', required: true, placeholder: category.descriptionPlaceholder, maxLength: maxDescriptionLength },
  { id: locationField, label: 'Địa điểm thực hiện', kind: 'text', required: true, placeholder: 'Số nhà, đường, phường, quận', maxLength: maxLocationLength },
];

const preferredFieldDefinition: IntakeField = { id: preferredField, label: 'Thời gian mong muốn (chưa phải lịch hẹn đã xác nhận)', kind: 'choice', options: preferredOptions, maxLength: 40 };

function Action({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[secondary ? supportStyles.secondary : supportStyles.primary, disabled && styles.disabled]} wrapperStyle={styles.action}>
      <Text style={secondary ? supportStyles.secondaryLabel : supportStyles.primaryLabel}>{label}</Text>
    </PressScale>
  );
}

export function ServiceIntakeScreen({ category, userId, onBack, onOpenRequests, onAskKael }: Props) {
  const intake = useServiceIntake(userId, category);
  const safety = activeSafetyNotice(category, intake.answers);
  const submitting = intake.phase === 'submitting';
  const lines = summaryLines(category, intake.answers);
  const pendingLines = intake.pending === null ? [] : intake.pending.description.split('\n');

  if (intake.phase === 'submitted' && intake.requestId !== null) {
    const requestId = intake.requestId;
    return (
      <SupportShell title="Đã ghi nhận yêu cầu" onBack={onBack}>
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <Text style={styles.cardTitle}>{`Yêu cầu ${category.title} đã được gửi`}</Text>
          <Text style={styles.cardBody}>{`Mã yêu cầu: ${requestId.slice(0, 8).toUpperCase()}`}</Text>
          <Text style={styles.cardBody}>Trạng thái: đã gửi, đang chờ báo giá.</Text>
          <Text style={styles.cardBody}>Hiện chưa có thợ, giá, lịch hẹn hay thanh toán nào được xác nhận. Khi có báo giá, bạn sẽ thấy trong mục Báo giá và Yêu cầu của tôi.</Text>
        </View>
        <Action label="Xem trong Yêu cầu của tôi" onPress={() => onOpenRequests(requestId)} />
        <Action secondary label="Gửi yêu cầu khác" onPress={intake.startAnother} />
      </SupportShell>
    );
  }

  if (intake.storage === 'unreadable') {
    return (
      <SupportShell title={category.title} onBack={onBack}>
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <Text style={styles.cardTitle}>Chưa đọc được bản nháp chưa gửi</Text>
          <Text style={styles.cardBody}>Bản nháp lưu trên thiết bị này không đọc được. Hãy thử đọc lại trước. Nếu bỏ bản nháp, mã gửi cũ sẽ mất; một yêu cầu đã tới máy chủ có thể bị gửi lại, nên hãy kiểm tra Yêu cầu của tôi trước khi bỏ.</Text>
        </View>
        <Action label="Thử đọc lại bản nháp" onPress={intake.retryStorage} />
        <Action secondary label="Bỏ bản nháp chưa gửi" onPress={intake.discardUnreadable} />
      </SupportShell>
    );
  }

  if (intake.phase === 'uncertain' && intake.pending !== null) {
    return (
      <SupportShell title={category.title} onBack={onBack}>
        <View accessibilityLiveRegion="polite" style={styles.card}>
          <Text style={styles.cardTitle}>Yêu cầu chưa xác nhận được kết quả gửi</Text>
          <Text style={styles.cardBody}>{intake.message ?? ''}</Text>
        </View>
        <SupportCard>
          {pendingLines.map((line, index) => <Text key={`${index}-${line}`} style={styles.line}>{line}</Text>)}
          {intake.pending.location ? <Text style={styles.line}>{`Địa điểm thực hiện: ${intake.pending.location}`}</Text> : <Text style={styles.line}>Không có địa điểm.</Text>}
        </SupportCard>
        <Action label="Gửi lại để kiểm tra" onPress={() => void intake.submit()} />
        <Action secondary label="Xem Yêu cầu của tôi để đối soát" onPress={() => onOpenRequests('')} />
      </SupportShell>
    );
  }

  if (intake.phase === 'review' || submitting) {
    return (
      <SupportShell title="Xem lại yêu cầu" subtitle={category.title} onBack={onBack}>
        <SupportCard>
          {lines.map(line => <View key={line.id} style={styles.summaryRow}><Text style={styles.summaryLabel}>{line.label}</Text><Text style={styles.line}>{line.value}</Text></View>)}
        </SupportCard>
        {safety ? <View style={styles.card}><Text style={styles.cardBody}>{safety}</Text></View> : null}
        <Text style={styles.note}>Bấm Xác nhận gửi để tạo yêu cầu. Gửi yêu cầu chưa có nghĩa là đã có thợ, giá hay lịch hẹn được xác nhận.</Text>
        {intake.message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{intake.message}</Text> : null}
        <Action label={submitting ? 'Đang gửi…' : 'Xác nhận gửi yêu cầu'} disabled={submitting} onPress={() => void intake.submit()} />
        <Action secondary label="Chỉnh sửa" disabled={submitting} onPress={intake.edit} />
      </SupportShell>
    );
  }

  return (
    <SupportShell title={category.title} subtitle={category.intro} onBack={onBack}>
      {[...commonFields(category), ...category.fields, preferredFieldDefinition].map(field => (
        <IntakeFieldInput key={field.id} field={field} value={intake.answers[field.id] ?? ''} error={intake.errors[field.id]} onChange={value => intake.setAnswer(field.id, value)} />
      ))}
      {safety ? <View accessibilityLiveRegion="polite" style={styles.card}><Text style={styles.cardBody}>{safety}</Text></View> : null}
      <Text style={styles.note}>Chưa đính kèm ảnh ở bước này. Hãy mô tả bằng chữ; Kael không phân tích ảnh trong luồng này.</Text>
      {intake.message ? <Text accessibilityLiveRegion="polite" style={styles.error}>{intake.message}</Text> : null}
      <Action label="Xem lại yêu cầu" disabled={intake.storage !== 'ready'} onPress={intake.review} />
      <Text style={styles.note}>Kael tư vấn trong cuộc trò chuyện mới và không tự điền hay gửi biểu mẫu này. Những gì bạn đã nhập được giữ lại để quay lại điền tiếp.</Text>
      <Action secondary label="Trao đổi với Kael" onPress={() => onAskKael(kaelIntakePrompt(category, intake.answers))} />
    </SupportShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: metrics.cardRadius, backgroundColor: colors.cardFill, padding: metrics.workerCardPadding, gap: metrics.noteGap, marginBottom: metrics.sectionGap },
  cardTitle: { color: horizonColors.text, fontSize: metrics.emptyTitleSize, fontWeight: metrics.emptyTitleWeight },
  cardBody: { color: horizonColors.text, fontSize: metrics.rowDetailSize, lineHeight: metrics.emptyBodyLineHeight },
  note: { color: horizonColors.muted, fontSize: metrics.fieldHintSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionGap, marginLeft: metrics.sectionTitleInset },
  error: { color: colors.danger, fontSize: metrics.rowDetailSize, lineHeight: metrics.rowDetailLineHeight, marginBottom: metrics.sectionGap, marginLeft: metrics.sectionTitleInset },
  action: { marginBottom: metrics.primaryGap },
  disabled: { opacity: metrics.saveDisabledOpacity },
  summaryRow: { padding: metrics.workerCardPadding, gap: metrics.reviewGap },
  summaryLabel: { color: colors.sectionTitle, fontSize: metrics.fieldLabelSize, fontWeight: metrics.fieldLabelWeight },
  line: { color: horizonColors.text, fontSize: metrics.rowTitleSize, lineHeight: metrics.emptyBodyLineHeight, padding: metrics.reviewGap },
});
