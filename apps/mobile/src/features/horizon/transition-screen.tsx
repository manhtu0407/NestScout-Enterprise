import { Image, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { KaelOrb } from './kael-orb';

const metrics = horizonLayout.transition;
const colors = horizonColors.transition;

export function TransitionScreen() {
  return <View style={styles.root} accessibilityLabel="Kael đang sẵn sàng">
    <Image source={require('../../../assets/horizon/welcome-background.jpg')} resizeMode="cover" blurRadius={5} style={styles.mountain} />
    <View style={styles.veil} />
    <View style={styles.stars} pointerEvents="none">
      <View style={[styles.star, { top: metrics.starTopOne, left: metrics.starLeftOne }]} />
      <View style={[styles.star, { top: metrics.starTopTwo, left: metrics.starLeftTwo }]} />
      <View style={[styles.star, { top: metrics.starTopThree, left: metrics.starLeftThree }]} />
      <View style={[styles.star, { top: metrics.starTopFour, left: metrics.starLeftFour }]} />
    </View>
    <View style={styles.stage}>
      <View style={styles.glow} />
      <View style={[styles.orbit, styles.orbitOne]} />
      <View style={[styles.orbit, styles.orbitTwo]} />
      <KaelOrb size={metrics.orbSize} />
    </View>
    <View style={styles.copy}>
      <Text style={styles.title}>Kael đang sẵn sàng</Text>
      <Text style={styles.subtitle}>Cùng bạn chăm sóc ngôi nhà</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.root, overflow: 'hidden' },
  mountain: { position: 'absolute', top: metrics.mountainTop, left: metrics.mountainLeft, width: metrics.mountainWidth, height: metrics.mountainHeight, opacity: metrics.mountainOpacity },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.veil },
  stars: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  star: { position: 'absolute', width: metrics.starSize, height: metrics.starSize, borderRadius: metrics.starRadius, backgroundColor: colors.star, shadowColor: colors.starShadow, shadowRadius: metrics.starShadowRadius, shadowOpacity: metrics.starShadowOpacity },
  stage: { position: 'absolute', top: metrics.stageTop, width: metrics.stageWidth, alignItems: 'center', justifyContent: 'center', height: metrics.stageHeight },
  glow: { position: 'absolute', width: metrics.glowSize, height: metrics.glowSize, borderRadius: metrics.glowRadius, backgroundColor: colors.glow, shadowColor: colors.glowShadow, shadowRadius: metrics.glowShadowRadius, shadowOpacity: metrics.glowShadowOpacity },
  orbit: { position: 'absolute', width: metrics.orbitWidth, height: metrics.orbitHeight, borderRadius: metrics.orbitRadius, borderWidth: metrics.orbitBorderWidth, borderColor: colors.orbit },
  orbitOne: { transform: [{ rotate: metrics.orbitOneRotation }] },
  orbitTwo: { width: metrics.orbitTwoWidth, height: metrics.orbitTwoHeight, transform: [{ rotate: metrics.orbitTwoRotation }], borderColor: colors.orbitSecond },
  copy: { position: 'absolute', top: metrics.copyTop, alignItems: 'center', left: 0, right: 0 },
  title: { color: colors.title, fontSize: metrics.titleSize, fontWeight: metrics.titleWeight, letterSpacing: metrics.titleSpacing },
  subtitle: { color: colors.subtitle, fontSize: metrics.subtitleSize, marginTop: metrics.subtitleGap },
});
