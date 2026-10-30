import { horizonLayout } from '@/theme/layout';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { horizonColors, horizonColors as colors } from '@/theme/palette';

type Props = {
  size?: number;
  compact?: boolean;
};

export function KaelOrb({ size = 190, compact = false }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {!compact && <View style={[styles.glow, { width: size * horizonLayout.kaelOrb.glowWidthRatio, height: size * horizonLayout.kaelOrb.glowHeightRatio, borderRadius: size * horizonLayout.kaelOrb.glowRadiusRatio }]} />}
      <Image source={require('../../../assets/horizon/kael-orb.png')} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel="Kael - mascot dạng quả cầu ánh ngọc" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', backgroundColor: colors.mint, opacity: horizonLayout.kaelOrb.glowOpacity, shadowColor: horizonColors.kaelOrb.glowShadowColor, shadowOpacity: horizonLayout.kaelOrb.glowShadowOpacity, shadowRadius: horizonLayout.kaelOrb.glowShadowRadius, shadowOffset: { width: 0, height: 0 } }
});
