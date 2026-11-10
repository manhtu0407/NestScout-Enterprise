import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.sessionsPanel;
const colors = horizonColors.sessionsPanel;

export const sessionTitleLimit = 80;

export function normalizeSessionTitle(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function Frame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng hộp thoại" onPress={onClose} style={StyleSheet.absoluteFill}/>
      <View accessibilityViewIsModal style={styles.dialog}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {children}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

type RenameProps = { title: string; busy: boolean; error: string | null; onSubmit: (title: string) => void; onClose: () => void };

export function SessionRenameDialog({ title, busy, error, onSubmit, onClose }: RenameProps) {
  const [value, setValue] = useState(title);
  const next = normalizeSessionTitle(value);
  const valid = next.length >= 1 && next.length <= sessionTitleLimit && next !== title;
  return <Frame title="Đổi tên cuộc trò chuyện" onClose={onClose}>
    <TextInput
      accessibilityLabel="Tên cuộc trò chuyện"
      autoFocus
      maxLength={sessionTitleLimit}
      onChangeText={setValue}
      onSubmitEditing={() => { if (valid && !busy) onSubmit(next); }}
      returnKeyType="done"
      selectTextOnFocus
      style={styles.input}
      value={value}
    />
    {error !== null && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Hủy đổi tên" onPress={onClose} style={[styles.button, styles.cancel]}><Text style={styles.cancelText}>Hủy</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Lưu tên mới" accessibilityState={{ disabled: !valid || busy, busy }} disabled={!valid || busy} onPress={() => onSubmit(next)} style={[styles.button, styles.confirm, (!valid || busy) && styles.disabled]}><Text style={styles.confirmText}>{busy ? 'Đang lưu…' : 'Lưu'}</Text></Pressable>
    </View>
  </Frame>;
}

type DeleteProps = { title: string; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void };

export function SessionDeleteDialog({ title, busy, error, onConfirm, onClose }: DeleteProps) {
  return <Frame title="Xóa cuộc trò chuyện?" onClose={onClose}>
    <Text style={styles.body}>{`“${title}” sẽ bị xóa vĩnh viễn cùng toàn bộ tin nhắn trong cuộc trò chuyện này. Yêu cầu dịch vụ, báo giá và công việc của bạn không bị ảnh hưởng.`}</Text>
    {error !== null && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Giữ lại cuộc trò chuyện" onPress={onClose} style={[styles.button, styles.cancel]}><Text style={styles.cancelText}>Giữ lại</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Xóa vĩnh viễn cuộc trò chuyện" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onConfirm} style={[styles.button, styles.danger, busy && styles.disabled]}><Text style={styles.confirmText}>{busy ? 'Đang xóa…' : 'Xóa'}</Text></Pressable>
    </View>
  </Frame>;
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.dialogScrim, alignItems: 'center', justifyContent: 'center', padding: metrics.dialogPadding },
  dialog: { width: metrics.dialogWidth, maxWidth: metrics.dialogMaxWidth, backgroundColor: colors.dialogSurface, borderRadius: metrics.dialogRadius, padding: metrics.dialogPadding, gap: metrics.dialogGap },
  title: { color: colors.dialogTitle, fontSize: metrics.dialogTitleSize, fontWeight: metrics.dialogTitleWeight },
  body: { color: colors.dialogBody, fontSize: metrics.dialogBodySize, lineHeight: metrics.dialogBodyLine },
  error: { color: colors.error, fontSize: metrics.statusFontSize, lineHeight: metrics.statusLineHeight },
  input: { minHeight: metrics.inputHeight, borderRadius: metrics.inputRadius, borderWidth: metrics.inputBorderWidth, borderColor: colors.inputBorder, backgroundColor: colors.inputFill, paddingHorizontal: metrics.inputPaddingHorizontal, color: colors.dialogTitle, fontSize: metrics.inputFontSize },
  actions: { flexDirection: 'row', gap: metrics.buttonGap },
  button: { flex: 1, minHeight: metrics.buttonHeight, borderRadius: metrics.buttonRadius, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: colors.cancelFill },
  confirm: { backgroundColor: colors.confirmFill },
  danger: { backgroundColor: colors.dangerFill },
  disabled: { opacity: metrics.disabledOpacity },
  cancelText: { color: colors.cancelText, fontSize: metrics.buttonFontSize, fontWeight: metrics.buttonFontWeight },
  confirmText: { color: colors.confirmText, fontSize: metrics.buttonFontSize, fontWeight: metrics.buttonFontWeight },
});
