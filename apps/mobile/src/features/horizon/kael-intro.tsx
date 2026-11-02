import { Animated, StyleSheet, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.kaelCompanion;
const colors = horizonColors.kaelCompanion;

type Props = {
  progress: Animated.Value;
  footerHeight: number;
  interactive: boolean;
};

export function KaelIntro({ progress, footerHeight, interactive }: Props) {
  const exit = (distance: number) => progress.interpolate({ inputRange: [0, 1], outputRange: [0, distance] });
  const fade = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return <Animated.View pointerEvents={interactive ? 'box-none' : 'none'} style={[styles.layer, { bottom: footerHeight }]}>
    <Animated.View pointerEvents="none" style={[styles.ambient, { opacity: fade, transform: [{ translateX: exit(metrics.introLabelExit) }] }]}/>
    <Animated.View style={[styles.tagline, { opacity: fade, transform: [{ translateX: exit(-metrics.introCopyExit) }] }]}>
      <Text style={styles.taglineText}>{'What would you\nlike to get done?'}</Text>
      <Svg width={metrics.introUnderlineWidth} height={metrics.introUnderlineHeight} viewBox="0 0 84 10" style={styles.underline}>
        <Path d="M3 6 Q 22 1 42 5 T 81 4" fill="none" stroke={colors.introUnderline} strokeWidth={metrics.introUnderlineStroke} strokeLinecap="round"/>
      </Svg>
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: metrics.navHeight, right: 0, left: 0, overflow: 'hidden' },
  tagline: { position: 'absolute', top: metrics.introTaglineTop, left: metrics.introCopyLeft, width: metrics.introCopyWidth },
  underline: { marginTop: metrics.introTaglineGap },
  taglineText: { fontSize: metrics.introTaglineSize, lineHeight: metrics.introTaglineLineHeight, letterSpacing: metrics.introTaglineSpacing, fontWeight: metrics.introTaglineWeight, color: colors.introTitle },
  ambient: { position: 'absolute', top: metrics.ambientTop, right: metrics.ambientRight, width: metrics.ambientWidth, height: metrics.ambientHeight, borderRadius: metrics.ambientHeight, backgroundColor: colors.ambient },
});
