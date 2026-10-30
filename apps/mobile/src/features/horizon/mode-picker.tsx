import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon } from './icon';
import { useGlassAccessibility } from './glass-interaction';

export type HorizonMode = 'guest' | 'client' | 'worker';
export type ModeNotice = 'worker_unavailable' | 'worker_unverified' | null;

type Props = {
  mode: HorizonMode;
  pending: boolean;
  notice: ModeNotice;
  onSelect: (mode: HorizonMode) => void;
  onClose: () => void;
};

const metrics = horizonLayout.modePicker;
const colors = horizonColors.modePicker;
const webControlStyle = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });

export function ModePicker({ mode, pending, notice, onSelect, onClose }: Props) {
  const [focused, setFocused] = useState<HorizonMode | null>(null);
  const { reduceMotion } = useGlassAccessibility();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) { progress.setValue(1); return; }
    const entrance = Animated.timing(progress, { toValue: 1, duration: metrics.enterDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
    entrance.start();
    return () => entrance.stop();
  }, [progress, reduceMotion]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [horizonLayout.glass.popFromScale, 1] });
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sheet = document.getElementById('horizon-mode-picker');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(sheet?.querySelectorAll<HTMLElement>('button:not([disabled]), [role="radio"][tabindex="0"]:not([aria-disabled="true"])') ?? []);
    controls()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.getAttribute('role') === 'radio' && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
        const radios = controls().filter(control => control.getAttribute('role') === 'radio');
        if (radios.length < 2) return;
        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
        const next = radios[(radios.indexOf(active) + direction + radios.length) % radios.length];
        if (next) { event.preventDefault(); next.focus(); next.click(); }
        return;
      }
      if (event.key !== 'Tab') return;
      const available = controls();
      const first = available[0];
      const last = available[available.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (active === first || !sheet?.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !sheet?.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); if (previous?.isConnected) previous.focus(); };
  }, []);
  const error = notice === 'worker_unavailable'
    ? 'Tài khoản này chưa có quyền sử dụng vai trò Thợ.'
    : notice === 'worker_unverified' ? 'Chưa thể kiểm tra quyền sử dụng vai trò Thợ. Vui lòng thử lại.' : null;
  const signedIn = mode !== 'guest';
  const options = [
    { id: 'guest' as const, label: 'Khách', detail: signedIn ? 'Đăng xuất để dùng như khách' : 'Dùng thử, chưa cần đăng nhập', icon: 'eye' as const, selected: mode === 'guest', locked: signedIn },
    { id: 'client' as const, label: 'Khách hàng', detail: signedIn ? 'Giao diện khách hàng' : 'Đăng nhập để dùng dịch vụ', icon: 'user' as const, selected: mode === 'client', locked: false },
    { id: 'worker' as const, label: 'Thợ', detail: signedIn ? 'Giao diện dành cho thợ' : 'Đăng nhập để nhận việc', icon: 'briefcase' as const, selected: mode === 'worker', locked: false },
  ];
  const status = pending ? 'Đang kiểm tra quyền sử dụng vai trò Thợ…' : error;
  return <View style={styles.overlay}>
    <Animated.View style={[styles.scrim, { opacity: progress }]}><Pressable style={styles.scrimTarget} onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng bảng chọn vai trò" /></Animated.View>
    <Animated.View nativeID="horizon-mode-picker" style={[styles.popover, { opacity: progress, transform: [{ scale }] }]} role="dialog" accessibilityLabel="Chọn vai trò">
      <View style={styles.surface}>
        <View accessibilityRole="radiogroup" accessibilityLabel="Vai trò hoạt động">
          {options.map(option => <Pressable key={option.id} onPress={() => onSelect(option.id)} onFocus={() => setFocused(option.id)} onBlur={() => setFocused(null)} disabled={pending || option.locked} accessibilityRole="radio" accessibilityState={{ checked: option.selected, disabled: pending || option.locked }} aria-checked={option.selected} accessibilityLabel={option.label} accessibilityHint={option.detail} style={({ pressed }) => [styles.option, webControlStyle, (pressed || focused === option.id) && styles.optionActive]}>
            <Icon name={option.icon} size={metrics.optionIconSize} color={colors.optionIcon} />
            <View style={styles.optionCopy}><Text style={styles.optionLabel}>{option.label}</Text><Text style={styles.optionDetail}>{option.detail}</Text></View>
            {option.selected && <Icon name="check" size={metrics.checkSize} color={colors.popoverCheck}/>}
          </Pressable>)}
        </View>
        <View accessibilityLiveRegion="polite">
          {status && <View style={styles.notice}>
            {pending && <ActivityIndicator size="small" color={colors.popoverCheck}/>}
            <Text style={[styles.noticeText, error && !pending && styles.noticeError]}>{status}</Text>
          </View>}
        </View>
      </View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.popoverScrim },
  scrimTarget: { flex: 1 },
  popover: { position: 'absolute', left: metrics.popoverLeft, bottom: metrics.popoverBottom, width: metrics.popoverWidth, transformOrigin: 'bottom left' },
  surface: { padding: metrics.popoverPadding, borderRadius: metrics.popoverRadius, backgroundColor: colors.popoverFill, boxShadow: colors.popoverShadow },
  option: { minHeight: metrics.popoverRowHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.optionGap, paddingHorizontal: metrics.popoverRowPadding, borderRadius: metrics.popoverRowRadius },
  optionActive: { backgroundColor: colors.popoverPressed },
  optionCopy: { flex: 1 },
  optionLabel: { color: horizonColors.text, fontSize: metrics.optionLabelSize, fontWeight: metrics.optionLabelWeight },
  optionDetail: { color: horizonColors.muted, fontSize: metrics.optionDetailSize, marginTop: metrics.optionDetailGap },
  notice: { flexDirection: 'row', alignItems: 'center', gap: metrics.noticeGap, paddingHorizontal: metrics.popoverRowPadding, paddingVertical: metrics.noticeGap },
  noticeText: { flex: 1, color: horizonColors.muted, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight },
  noticeError: { color: colors.notice },
});
