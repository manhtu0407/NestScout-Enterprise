import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { authenticatedRequest } from '@/lib/authenticated-rest';
import { horizonLayout } from '@/theme/layout';
import { horizonColors as colors } from '@/theme/palette';

const metrics = horizonLayout.kaelMemorySettings;

const preferences = [
  { id: 'language', label: 'Ngôn ngữ', values: [{ id: 'vi', label: 'Tiếng Việt' }, { id: 'en', label: 'Tiếng Anh' }] },
  { id: 'detail', label: 'Mức chi tiết', values: [{ id: 'brief', label: 'Ngắn gọn' }, { id: 'detailed', label: 'Chi tiết' }] },
  { id: 'format', label: 'Cách trình bày hướng dẫn', values: [{ id: 'paragraphs', label: 'Đoạn văn' }, { id: 'steps', label: 'Từng bước' }] },
] as const;

type Props = { userId: string; mode: 'client' | 'worker'; onClose: () => void };
type Memory = { preference: string; value: string };
type State = { enabled: boolean; items: Memory[] };
type Action = 'enable' | 'disable' | 'save' | 'remove';

async function readMemory(userId: string, mode: Props['mode'], signal: AbortSignal): Promise<State> {
  const [settings, memories] = await Promise.all([
    authenticatedRequest(userId, `kael_memory_modes?select=mode&mode=eq.${mode}`, { signal }),
    authenticatedRequest(userId, `kael_memory_preferences?select=preference,value&mode=eq.${mode}`, { signal }),
  ]);
  if (!settings.ok || !memories.ok) throw new Error('Memory is unavailable');
  const enabled = ((await settings.json()) as unknown[]).length > 0;
  return { enabled, items: enabled ? await memories.json() as Memory[] : [] };
}

export function KaelMemorySettings({ userId, mode, onClose }: Props) {
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const current = useRef<AbortController | null>(null);

  const request = async (action?: Action, preference?: string, value?: string) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const { signal } = controller;
    setBusy(true);
    setError(false);
    try {
      if (action) {
        const response = await authenticatedRequest(userId, 'rpc/kael_manage_memory', {
          method: 'POST', body: JSON.stringify({ p_mode: mode, p_action: action, p_preference: preference, p_value: value }), signal,
        });
        if (!response.ok || await response.json() !== true) throw new Error('Memory was not updated');
      }
      const result = await readMemory(userId, mode, signal);
      if (!signal.aborted) setState(result);
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    current.current = controller;
    void readMemory(userId, mode, controller.signal).then(result => {
      if (!controller.signal.aborted) setState(result);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => current.current?.abort();
  }, [mode, userId]);

  return <Modal transparent visible animationType="none" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.panel} accessibilityViewIsModal>
        <Text accessibilityRole="header" style={styles.title}>Bộ nhớ Kael</Text>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.text}>Kael chỉ lưu các tùy chọn trả lời bạn chọn, riêng cho chế độ hiện tại. Tắt bộ nhớ sẽ xóa các tùy chọn đã lưu. Lịch sử trò chuyện được giữ riêng.</Text>
          {error && <><Text accessibilityLiveRegion="polite" style={styles.text}>Không thể tải hoặc cập nhật bộ nhớ.</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void request()}><Text style={styles.action}>Tải lại</Text></Pressable></>}
          {busy || (state === null && !error) ? <ActivityIndicator accessibilityLabel="Đang tải bộ nhớ"/> : null}
          {state && <Pressable accessibilityRole="switch" accessibilityState={{ checked: state.enabled, disabled: busy || error }} disabled={busy || error} onPress={() => void request(state.enabled ? 'disable' : 'enable')}>
            <Text style={styles.action}>{state.enabled ? 'Tắt và xóa tùy chọn đã lưu' : 'Bật bộ nhớ'}</Text>
          </Pressable>}
          {state?.enabled && preferences.map(({ id, label, values }) => {
            const saved = state.items.find(item => item.preference === id)?.value;
            return <View key={id} style={styles.group}>
              <Text accessibilityRole="header" style={styles.text}>{label}</Text>
              <View style={styles.options}>
                {values.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: saved === option.id, disabled: busy || error }} disabled={busy || error} onPress={() => void request('save', id, option.id)}>
                  <Text style={styles.action}>{saved === option.id ? '✓ ' : ''}{option.label}</Text>
                </Pressable>)}
                {saved && <Pressable accessibilityRole="button" accessibilityLabel={`Xóa tùy chọn ${label}`} disabled={busy || error} onPress={() => void request('remove', id)}><Text style={styles.action}>Xóa</Text></Pressable>}
              </View>
            </View>;
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.action}>Đóng</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: metrics.inset, backgroundColor: colors.scrim },
  panel: { maxHeight: metrics.maxHeight, borderRadius: metrics.radius, backgroundColor: colors.bg, padding: metrics.inset, gap: metrics.panelGap },
  title: { color: colors.text, fontSize: metrics.titleSize, fontWeight: metrics.emphasisWeight },
  text: { color: colors.text, fontSize: metrics.bodySize, lineHeight: metrics.bodyLineHeight },
  content: { gap: metrics.contentGap },
  group: { gap: metrics.groupGap },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.optionGap },
  action: { color: colors.text, fontWeight: metrics.emphasisWeight, minHeight: metrics.touchHeight, paddingVertical: metrics.actionPadding },
});
