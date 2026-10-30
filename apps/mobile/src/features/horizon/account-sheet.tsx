import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { PressScale } from './glass-controls';
import { Icon } from './icon';

const metrics = horizonLayout.modePicker;
const colors = horizonColors.modePicker;
const account = horizonLayout.accountSheet;
const tones = horizonColors.accountSheet;
const webControlStyle = Platform.select({ web: { outlineStyle: 'solid', outlineWidth: 0 } as const, default: undefined });

type Props = { profileName?: string; modeLabel: string; reduceMotion: boolean; closeRequest: number; onClose: () => void };

export function AccountSheet({ profileName, modeLabel, reduceMotion, closeRequest, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState<'close' | null>(null);
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
    const exit = Animated.timing(progress, { toValue: 0, duration: horizonLayout.accountMotion.exitDuration, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true });
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
      <View accessible={false} style={styles.handle}/>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>Tài khoản</Text>
          <PressScale accessibilityRole="button" accessibilityLabel="Đóng bảng tài khoản" onPress={closeSheet} onFocus={() => setFocused('close')} onBlur={() => setFocused(null)} style={[styles.close, webControlStyle, focused === 'close' && styles.closeFocused]}><Icon name="close" size={account.closeIconSize}/></PressScale>
        </View>
        <View style={styles.identity}>
          <View style={styles.avatar}>{profileName ? <Text style={styles.initial}>{profileName.trim().charAt(0).toLocaleUpperCase()}</Text> : <Icon name="user" size={account.avatarIconSize} color={tones.avatarInitial}/>}</View>
          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.name}>{profileName ?? 'Chưa có thông tin hồ sơ'}</Text>
            <View style={styles.chip}><Text style={styles.chipText}>{modeLabel}</Text></View>
          </View>
        </View>
        <Text style={styles.notice}>Thông tin hồ sơ sẽ hiện ở đây sau khi bạn thiết lập trong Cài đặt.</Text>
      </ScrollView>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: horizonColors.scrim },
  scrimTarget: { flex: 1 },
  sheet: { maxHeight: metrics.sheetMaxHeight, borderTopLeftRadius: metrics.sheetRadius, borderTopRightRadius: metrics.sheetRadius, paddingHorizontal: metrics.sheetPadding, paddingTop: metrics.sheetPadding, backgroundColor: colors.sheetSurface },
  handle: { alignSelf: 'center', width: account.handleWidth, height: account.handleHeight, borderRadius: account.handleRadius, backgroundColor: tones.handle, marginBottom: account.handleGap },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: metrics.titleGap },
  title: { flex: 1, color: horizonColors.text, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight },
  close: { width: account.closeSize, height: account.closeSize, borderRadius: account.closeRadius, backgroundColor: tones.closeFill, alignItems: 'center', justifyContent: 'center' },
  closeFocused: { backgroundColor: tones.closeFocus },
  identity: { flexDirection: 'row', alignItems: 'center', gap: account.identityGap, paddingVertical: account.identityPaddingVertical },
  avatar: { width: account.avatarSize, height: account.avatarSize, borderRadius: account.avatarRadius, backgroundColor: tones.avatarFill, borderWidth: account.avatarRing, borderColor: tones.avatarRing, alignItems: 'center', justifyContent: 'center' },
  initial: { color: tones.avatarInitial, fontSize: account.avatarInitialSize, fontWeight: account.avatarInitialWeight },
  copy: { flex: 1 },
  name: { color: horizonColors.text, fontSize: account.nameSize, fontWeight: account.nameWeight },
  chip: { alignSelf: 'flex-start', height: account.chipHeight, paddingHorizontal: account.chipPaddingHorizontal, borderRadius: account.chipRadius, backgroundColor: tones.chipFill, justifyContent: 'center', marginTop: account.chipGap },
  chipText: { color: tones.chipText, fontSize: account.chipFontSize, fontWeight: account.chipFontWeight },
  detail: { color: horizonColors.muted, fontSize: metrics.optionDetailSize, marginTop: metrics.optionDetailGap },
  notice: { color: horizonColors.muted, fontSize: metrics.noticeSize, lineHeight: metrics.noticeLineHeight, paddingTop: metrics.noticeGap },
});
