import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon } from './icon';

export type HorizonMode = 'guest' | 'client' | 'worker';
export type ModeNotice = 'worker_unavailable' | 'worker_unverified' | null;

type Props = {
  mode: HorizonMode;
  pending: boolean;
  notice: ModeNotice;
  onSelect: (mode: 'client' | 'worker') => void;
  onClose: () => void;
};

const metrics = horizonLayout.modePicker;
const colors = horizonColors.modePicker;
const webControlStyle = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });

export function ModePicker({ mode, pending, notice, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState<'close' | 'client' | 'worker' | null>(null);
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
  const clientSelected = mode !== 'worker';
  const error = notice === 'worker_unavailable'
    ? 'Tài khoản này chưa có quyền sử dụng chế độ Thợ.'
    : notice === 'worker_unverified' ? 'Chưa thể kiểm tra quyền sử dụng chế độ Thợ. Vui lòng thử lại.' : null;
  return <View style={styles.overlay}>
    <Pressable style={styles.scrim} onPress={onClose} accessible={false} aria-hidden tabIndex={-1} />
    <View nativeID="horizon-mode-picker" style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, metrics.sheetBottomPadding) }]} accessibilityViewIsModal role="dialog" aria-modal accessibilityLabel="Chọn chế độ">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>Chọn chế độ</Text>
          <Pressable onPress={onClose} onFocus={() => setFocused('close')} onBlur={() => setFocused(null)} accessibilityRole="button" accessibilityLabel="Đóng bảng chọn chế độ" style={[styles.close, webControlStyle, focused === 'close' && styles.focused]}><Icon name="close" size={metrics.optionIconSize} /></Pressable>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Chế độ hoạt động">
        <Pressable onPress={() => onSelect('client')} onFocus={() => setFocused('client')} onBlur={() => setFocused(null)} disabled={pending} accessibilityRole="radio" accessibilityState={{ checked: clientSelected, disabled: pending }} aria-checked={clientSelected} accessibilityLabel="Khách hàng" accessibilityHint="Giao diện khách hàng" style={[styles.option, webControlStyle, focused === 'client' && styles.focused]}>
          <View style={styles.icon}><Icon name="user" size={metrics.optionIconSize} /></View>
          <View style={styles.optionCopy}><Text style={styles.optionLabel}>Khách hàng</Text><Text style={styles.optionDetail}>{mode === 'guest' ? 'Bạn đang xem với tư cách khách' : 'Giao diện khách hàng'}</Text></View>
          {clientSelected && <Icon name="check" size={metrics.checkSize} color={colors.check}/>}
        </Pressable>
        <View style={styles.separator}/>
        <Pressable onPress={() => onSelect('worker')} onFocus={() => setFocused('worker')} onBlur={() => setFocused(null)} disabled={pending} accessibilityRole="radio" accessibilityState={{ checked: mode === 'worker', disabled: pending }} aria-checked={mode === 'worker'} accessibilityLabel="Thợ" accessibilityHint="Giao diện dành cho thợ" style={[styles.option, webControlStyle, focused === 'worker' && styles.focused]}>
          <View style={styles.icon}><Icon name="briefcase" size={metrics.optionIconSize} /></View>
          <View style={styles.optionCopy}><Text style={styles.optionLabel}>Thợ</Text><Text style={styles.optionDetail}>Giao diện dành cho thợ</Text></View>
          {mode === 'worker' && <Icon name="check" size={metrics.checkSize} color={colors.check}/>}
        </Pressable>
        </View>
        <View style={styles.separator}/>
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          {pending && <ActivityIndicator size="small" color={colors.check}/>}
          <Text style={[styles.noticeText, error && styles.noticeError]}>{pending ? 'Đang kiểm tra quyền sử dụng chế độ Thợ…' : error ?? 'Có thể cần đăng nhập hoặc kiểm tra quyền khi chuyển sang Thợ.'}</Text>
        </View>
      </ScrollView>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: horizonColors.scrim },
  sheet: { maxHeight: metrics.sheetMaxHeight, borderTopLeftRadius: metrics.sheetRadius, borderTopRightRadius: metrics.sheetRadius, paddingHorizontal: metrics.sheetPadding, paddingTop: metrics.sheetPadding, backgroundColor: colors.sheetSurface },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.titleGap },
  title: { flex: 1, color: horizonColors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  close: { width: metrics.closeSize, height: metrics.closeSize, alignItems: 'center', justifyContent: 'center' },
  focused: { borderRadius: metrics.focusRadius, backgroundColor: colors.focusSurface },
  option: { minHeight: metrics.optionMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.optionGap },
  icon: { width: metrics.iconBoxSize, height: metrics.iconBoxSize, borderRadius: metrics.iconBoxRadius, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1 },
  optionLabel: { color: horizonColors.text, fontSize: metrics.optionLabelSize, fontWeight: metrics.optionLabelWeight },
  optionDetail: { color: horizonColors.muted, fontSize: metrics.optionDetailSize, marginTop: metrics.optionDetailGap },
  separator: { height: metrics.separatorHeight, backgroundColor: colors.separator },
  notice: { flexDirection: 'row', alignItems: 'center', gap: metrics.noticeGap, paddingTop: metrics.noticeGap },
  noticeText: { flex: 1, color: horizonColors.muted, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight },
  noticeError: { color: colors.notice },
});
