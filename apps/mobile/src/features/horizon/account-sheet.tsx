import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { Icon } from './icon';

const metrics = horizonLayout.modePicker;
const colors = horizonColors.modePicker;
const webControlStyle = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });

type Props = { name: string; initial: string; modeLabel: string; preview: boolean; reduceMotion: boolean; closeRequest: number; onClose: () => void; onChooseMode: () => void; onAccount: () => void };

export function AccountSheet({ name, initial, modeLabel, preview, reduceMotion, closeRequest, onClose, onChooseMode, onAccount }: Props) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState<'close' | 'mode' | 'account' | null>(null);
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [exiting, setExiting] = useState(false);
  const leaving = useRef(false);
  const alive = useRef(true);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const lastCloseRequest = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; animation.current?.stop(); };
  }, []);
  useEffect(() => {
    if (leaving.current) return;
    if (reduceMotion) { progress.setValue(1); return; }
    const entrance = Animated.timing(progress, { toValue: 1, duration: horizonLayout.accountMotion.enterDuration, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true });
    animation.current = entrance;
    entrance.start();
    return () => entrance.stop();
  }, [progress, reduceMotion]);
  const dismiss = useCallback((action: () => void) => {
    if (leaving.current) return;
    leaving.current = true;
    setExiting(true);
    animation.current?.stop();
    if (reduceMotion) { progress.setValue(0); action(); return; }
    const exit = Animated.timing(progress, { toValue: 0, duration: horizonLayout.accountMotion.exitDuration, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true });
    animation.current = exit;
    exit.start(({ finished }) => { if (finished && alive.current) action(); });
  }, [progress, reduceMotion]);
  const closeSheet = useCallback(() => dismiss(onClose), [dismiss, onClose]);
  useEffect(() => {
    if (closeRequest > lastCloseRequest.current) { lastCloseRequest.current = closeRequest; closeSheet(); }
  }, [closeRequest, closeSheet]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [horizonLayout.accountMotion.offset, 0] });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const sheet = document.getElementById('horizon-account-sheet');
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(sheet?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    controls()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const available = controls();
      const first = available[0];
      const last = available[available.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sheet?.contains(active))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !sheet?.contains(active))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); if (previous?.isConnected) previous.focus(); };
  }, [closeSheet]);
  return <View style={styles.overlay}>
    <Animated.View style={[styles.scrim, { opacity: progress }]}><Pressable style={styles.scrimTarget} onPress={closeSheet} accessible={false} aria-hidden tabIndex={-1}/></Animated.View>
    <Animated.View nativeID="horizon-account-sheet" pointerEvents={exiting ? 'none' : 'auto'} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, metrics.sheetBottomPadding), opacity: progress, transform: [{ translateY }] }]} accessibilityViewIsModal role="dialog" aria-modal accessibilityLabel="Tài khoản">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Tài khoản</Text><Pressable accessibilityRole="button" accessibilityLabel="Đóng bảng tài khoản" onPress={closeSheet} onFocus={() => setFocused('close')} onBlur={() => setFocused(null)} style={[styles.close, webControlStyle, focused === 'close' && styles.focused]}><Icon name="close" size={metrics.optionIconSize}/></Pressable></View>
        <View style={styles.identity}><View style={styles.avatar}><Text style={styles.initial}>{initial}</Text></View><View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{name}</Text><Text style={styles.detail}>Đang dùng: {modeLabel}</Text>{preview && <Text style={styles.detail}>Thông tin minh họa</Text>}</View></View>
        <View style={styles.separator}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Chuyển chế độ" onPress={() => dismiss(onChooseMode)} onFocus={() => setFocused('mode')} onBlur={() => setFocused(null)} style={[styles.option, webControlStyle, focused === 'mode' && styles.focused]}><View style={styles.icon}><Icon name="user" size={metrics.optionIconSize}/></View><View style={styles.copy}><Text style={styles.label}>Chuyển chế độ</Text><Text style={styles.detail}>Khách hàng hoặc Thợ</Text></View><Icon name="chevron" size={metrics.optionIconSize} color={horizonColors.muted}/></Pressable>
        <View style={styles.separator}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Tài khoản và đăng nhập" onPress={() => dismiss(onAccount)} onFocus={() => setFocused('account')} onBlur={() => setFocused(null)} style={[styles.option, webControlStyle, focused === 'account' && styles.focused]}><View style={styles.icon}><Icon name="gear" size={metrics.optionIconSize}/></View><View style={styles.copy}><Text style={styles.label}>Tài khoản và đăng nhập</Text><Text style={styles.detail}>Quản lý phiên đăng nhập</Text></View><Icon name="chevron" size={metrics.optionIconSize} color={horizonColors.muted}/></Pressable>
        <View style={styles.separator}/><Text style={styles.notice}>Hồ sơ cá nhân trong Cài đặt chưa được kết nối.</Text>
      </ScrollView>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: horizonColors.scrim },
  scrimTarget: { flex: 1 },
  sheet: { maxHeight: metrics.sheetMaxHeight, borderTopLeftRadius: metrics.sheetRadius, borderTopRightRadius: metrics.sheetRadius, paddingHorizontal: metrics.sheetPadding, paddingTop: metrics.sheetPadding, backgroundColor: colors.sheetSurface },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.titleGap },
  title: { flex: 1, color: horizonColors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  close: { width: metrics.closeSize, height: metrics.closeSize, alignItems: 'center', justifyContent: 'center' },
  focused: { borderRadius: metrics.focusRadius, backgroundColor: colors.focusSurface },
  identity: { minHeight: metrics.optionMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.optionGap },
  avatar: { width: metrics.iconBoxSize, height: metrics.iconBoxSize, borderRadius: metrics.iconBoxRadius, backgroundColor: horizonColors.sidebarComponent.profileAvatarBackgroundColor, alignItems: 'center', justifyContent: 'center' },
  initial: { color: horizonColors.onFill, fontSize: horizonLayout.sidebar.profileInitialFontSize, fontWeight: horizonLayout.sidebar.profileInitialFontWeight },
  copy: { flex: 1 },
  name: { color: horizonColors.text, fontSize: metrics.optionLabelSize, fontWeight: metrics.optionLabelWeight },
  detail: { color: horizonColors.muted, fontSize: metrics.optionDetailSize, marginTop: metrics.optionDetailGap },
  option: { minHeight: metrics.optionMinHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.optionGap },
  icon: { width: metrics.iconBoxSize, height: metrics.iconBoxSize, borderRadius: metrics.iconBoxRadius, backgroundColor: colors.iconSurface, alignItems: 'center', justifyContent: 'center' },
  label: { color: horizonColors.text, fontSize: metrics.optionLabelSize, fontWeight: metrics.optionLabelWeight },
  separator: { height: metrics.separatorHeight, backgroundColor: colors.separator },
  notice: { color: horizonColors.muted, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight, paddingTop: metrics.noticeGap },
});
