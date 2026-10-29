import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.welcomeIntro;
const colors = horizonColors.welcomeIntro;

export function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const imageTop = Math.max(metrics.imageTopMinimum, height * metrics.imageTopRatio);
  return <View style={styles.root} accessibilityLabel="NestScout Horizon, đang khởi động">
    <View style={styles.sky} />
    <View style={styles.stars} pointerEvents="none">
      <View style={[styles.star, { left: metrics.starLeftOne, top: metrics.starTopOne }]} />
      <View style={[styles.star, { left: metrics.starLeftTwo, top: metrics.starTopTwo }]} />
      <View style={[styles.star, { left: metrics.starLeftThree, top: metrics.starTopThree }]} />
      <View style={[styles.star, { left: metrics.starLeftFour, top: metrics.starTopFour }]} />
    </View>
    <Image source={require('../../../assets/horizon/welcome-background.jpg')} resizeMode="cover" style={[styles.landscape, { top: imageTop, height: height * metrics.imageHeightRatio }]} />
    <View pointerEvents="none" style={styles.veil} />
    <View style={styles.brand}>
      <Text style={styles.title}>NestScout <Text style={styles.accent}>Horizon</Text></Text>
      <Text style={styles.slogan}>Hiểu đúng nhu cầu.{'\n'}An tâm từ đầu.</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.root, overflow: 'hidden' },
  sky: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.sky },
  stars: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  star: { position: 'absolute', width: metrics.starSize, height: metrics.starSize, borderRadius: metrics.starRadius, backgroundColor: colors.star, opacity: metrics.starOpacity },
  landscape: { position: 'absolute', left: metrics.imageLeft, width: metrics.imageWidth },
  veil: { position: 'absolute', left: 0, right: 0, top: metrics.veilTop, height: metrics.veilHeight, backgroundColor: colors.veil },
  brand: { position: 'absolute', top: metrics.brandTop, left: 0, right: 0, alignItems: 'center' },
  title: { fontSize: metrics.titleSize, fontWeight: metrics.titleWeight, color: horizonColors.white, letterSpacing: metrics.titleSpacing },
  accent: { color: colors.accent },
  slogan: { textAlign: 'center', color: colors.slogan, fontSize: metrics.sloganSize, lineHeight: metrics.sloganLineHeight, marginTop: metrics.sloganGap },
});
