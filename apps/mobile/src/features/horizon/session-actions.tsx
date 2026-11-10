import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, type IconName, type KaelSessionFailure } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

export type SessionActionResult = { ok: true } | { ok: false; failure: KaelSessionFailure };

export const maxSessionTitleLength = 80;

export const sessionFailureMessages: Readonly<Record<KaelSessionFailure, string>> = {
  unavailable: 'Cuộc trò chuyện này không còn tồn tại. Danh sách đang được làm mới.',
  run_active: 'Kael đang trả lời trong cuộc trò chuyện này. Hãy đợi Kael trả lời xong rồi thử lại.',
  effect_unresolved: 'Cuộc trò chuyện này còn một bước gửi yêu cầu chưa xác minh được kết quả. Hãy kiểm tra lại bước đó trước khi xóa.',
  invalid: `Tên chưa hợp lệ. Dùng tối đa ${maxSessionTitleLength} ký tự.`,
  failed: 'Chưa thực hiện được. Vui lòng thử lại.',
};

type Props = {
  title: string;
  pinned: boolean;
  archived: boolean;
  onClose: () => void;
  onRename: (title: string | null) => Promise<SessionActionResult>;
  onPin: () => Promise<SessionActionResult>;
  onArchive: () => Promise<SessionActionResult>;
  onDelete: () => Promise<SessionActionResult>;
};

type Step = 'menu' | 'rename' | 'delete';

const metrics = horizonLayout.modePicker;
const fieldMetrics = horizonLayout.supportScreens;
const colors = horizonColors.modePicker;
const fieldColors = horizonColors.supportScreens;

export function SessionActions({ title, pinned, archived, onClose, onRename, onPin, onArchive, onDelete }: Props) {
  const [step, setStep] = useState<Step>('menu');
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<SessionActionResult>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.ok) onClose();
    else setError(sessionFailureMessages[result.failure]);
  };

  const items: readonly { id: string; label: string; icon: IconName; danger?: boolean; onPress: () => void }[] = [
    { id: 'rename', label: 'Đổi tên', icon: 'compose', onPress: () => { setError(null); setStep('rename'); } },
    { id: 'pin', label: pinned ? 'Bỏ ghim' : 'Ghim', icon: 'pin', onPress: () => void run(onPin) },
    { id: 'archive', label: archived ? 'Bỏ lưu trữ' : 'Lưu trữ', icon: 'archive', onPress: () => void run(onArchive) },
    { id: 'delete', label: 'Xóa', icon: 'trash', danger: true, onPress: () => { setError(null); setStep('delete'); } },
  ];

  return <View style={styles.overlay}>
    <View style={styles.scrim}><Pressable style={styles.scrimTarget} onPress={busy ? undefined : onClose} accessibilityRole="button" accessibilityLabel="Đóng tùy chọn cuộc trò chuyện"/></View>
    <View style={styles.surface} role="dialog" accessibilityLabel={`Tùy chọn cho ${title}`}>
      <Text numberOfLines={1} style={styles.heading}>{title}</Text>
      {step === 'menu' && items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.label} disabled={busy} onPress={item.onPress} style={({ pressed }) => [styles.option, pressed && styles.optionActive]}>
        <Icon name={item.icon} size={metrics.optionIconSize} color={item.danger ? fieldColors.danger : colors.optionIcon}/>
        <Text style={[styles.optionLabel, item.danger && styles.danger]}>{item.label}</Text>
      </Pressable>)}
      {step === 'rename' && <View style={styles.body}>
        <TextInput accessibilityLabel="Tên cuộc trò chuyện" autoFocus value={name} onChangeText={setName} maxLength={maxSessionTitleLength} placeholder="Để trống để dùng tên mặc định" placeholderTextColor={fieldColors.searchPlaceholder} style={styles.input}/>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Hủy đổi tên" disabled={busy} onPress={() => setStep('menu')} style={styles.secondary}><Text style={styles.secondaryLabel}>Hủy</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Lưu tên" disabled={busy} onPress={() => void run(() => onRename(name.trim() === '' ? null : name.trim()))} style={styles.primary}><Text style={styles.primaryLabel}>Lưu</Text></Pressable>
        </View>
      </View>}
      {step === 'delete' && <View style={styles.body}>
        <Text style={styles.copy}>Xóa vĩnh viễn cuộc trò chuyện này? Tin nhắn và công việc của Kael trong cuộc trò chuyện sẽ bị xóa và không khôi phục được. Yêu cầu dịch vụ, báo giá và công việc đã tạo không bị ảnh hưởng.</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Giữ lại cuộc trò chuyện" disabled={busy} onPress={() => setStep('menu')} style={styles.secondary}><Text style={styles.secondaryLabel}>Giữ lại</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Xác nhận xóa cuộc trò chuyện" disabled={busy} onPress={() => void run(onDelete)} style={[styles.primary, styles.destructive]}><Text style={styles.primaryLabel}>Xóa</Text></Pressable>
        </View>
      </View>}
      {busy && <ActivityIndicator size="small" color={colors.popoverCheck}/>}
      <View accessibilityLiveRegion="polite">{error !== null && <Text style={styles.error}>{error}</Text>}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.popoverScrim },
  scrimTarget: { flex: 1 },
  surface: { width: metrics.popoverWidth, padding: metrics.popoverPadding, borderRadius: metrics.popoverRadius, backgroundColor: colors.popoverFill, boxShadow: colors.popoverShadow },
  heading: { color: horizonColors.muted, fontSize: metrics.optionDetailSize, paddingHorizontal: metrics.popoverRowPadding, paddingVertical: metrics.noticeGap },
  option: { minHeight: metrics.popoverRowHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.optionGap, paddingHorizontal: metrics.popoverRowPadding, borderRadius: metrics.popoverRowRadius },
  optionActive: { backgroundColor: colors.popoverPressed },
  optionLabel: { color: horizonColors.text, fontSize: metrics.optionLabelSize, fontWeight: metrics.optionLabelWeight },
  danger: { color: fieldColors.danger },
  body: { paddingHorizontal: metrics.popoverRowPadding, paddingBottom: metrics.popoverRowPadding, gap: metrics.noticeGap },
  copy: { color: horizonColors.text, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight },
  input: { height: fieldMetrics.fieldHeight, borderRadius: fieldMetrics.fieldRadius, paddingHorizontal: fieldMetrics.fieldPaddingHorizontal, backgroundColor: fieldColors.searchFill, color: horizonColors.text, fontSize: fieldMetrics.fieldFontSize },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: fieldMetrics.buttonGap },
  secondary: { minHeight: fieldMetrics.buttonHeight, borderRadius: fieldMetrics.buttonRadius, paddingHorizontal: fieldMetrics.consentPadding, backgroundColor: fieldColors.secondaryFill, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { color: fieldColors.secondaryLabel, fontSize: fieldMetrics.buttonSize, fontWeight: fieldMetrics.primaryWeight },
  primary: { minHeight: fieldMetrics.buttonHeight, borderRadius: fieldMetrics.buttonRadius, paddingHorizontal: fieldMetrics.consentPadding, backgroundColor: fieldColors.primaryFill, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: fieldColors.primaryLabel, fontSize: fieldMetrics.buttonSize, fontWeight: fieldMetrics.primaryWeight },
  destructive: { backgroundColor: fieldColors.danger },
  error: { color: colors.notice, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight, paddingHorizontal: metrics.popoverRowPadding, paddingBottom: metrics.noticeGap },
});
