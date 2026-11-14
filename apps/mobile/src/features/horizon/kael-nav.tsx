import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { GlassIconButton, GlassPill, Icon, useGlassAccessibility } from '@/features/shared';

const metrics = horizonLayout.kaelCompanion;
const colors = horizonColors.kaelNav;
const backing = { backgroundColor: horizonColors.bg, borderRadius: horizonLayout.glass.controlRadius };

type ChatProps = {
  title: string;
  onMenu: () => void;
  onOptions: () => void;
};

export function KaelChatNav({ title, onMenu, onOptions }: ChatProps) {
  const { reduceMotion } = useGlassAccessibility();
  const [opacity] = useState(() => new Animated.Value(1));
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }
    opacity.setValue(metrics.navTitleDimmed);
    const fade = Animated.timing(opacity, { toValue: 1, duration: reduceMotion ? horizonLayout.glass.reducedDuration : metrics.navTitleFade, useNativeDriver: true });
    fade.start();
    return () => fade.stop();
  }, [opacity, reduceMotion, title]);
  return <View style={styles.bar}>
    <GlassIconButton label="Mở thanh bên" onPress={onMenu} style={backing}><Icon name="menu" size={horizonLayout.glass.iconSize}/></GlassIconButton>
    <View pointerEvents="none" style={styles.titleSlot}>
      <GlassPill style={styles.pill}>
        <Animated.View style={[styles.titleFrame, { opacity }]}>
          <Text accessibilityRole="header" numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={metrics.navTitleFontScale} style={styles.title}>{title}</Text>
        </Animated.View>
      </GlassPill>
    </View>
    <GlassIconButton label="Tùy chọn cuộc trò chuyện" onPress={onOptions} style={backing}><Icon name="compose" size={horizonLayout.glass.iconSize}/></GlassIconButton>
  </View>;
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: metrics.navInset, left: metrics.navSideInset, right: metrics.navSideInset, height: metrics.avatarSize, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleSlot: { flex: 1, minWidth: 0, maxWidth: metrics.navTitleMaxWidth, alignItems: 'center', marginHorizontal: metrics.navTitleGap },
  pill: { maxWidth: metrics.navTitleFill, flexShrink: 1, minWidth: 0 },
  titleFrame: { flexShrink: 1, minWidth: 0, paddingHorizontal: metrics.navTitlePaddingX },
  title: { color: colors.title, fontSize: metrics.navTitleSize, fontWeight: metrics.navTitleWeight, letterSpacing: metrics.navTitleSpacing, textAlign: 'center' },
});
