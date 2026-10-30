import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, ViewProps, ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { useGlassAccessibility } from './glass-interaction';
import { GlassSheen } from './glass-sheen';

const metrics = horizonLayout.glass;
const colors = horizonColors.liquid;

export type GlassVariant = 'control' | 'sheet';

export type GlassTone = 'neutral' | 'accent';

type Props = ViewProps & { variant: GlassVariant; radius: number; interactive?: boolean; tone?: GlassTone };

function backdropStyle(variant: GlassVariant): ViewStyle | undefined {
  if (Platform.OS !== 'web') return undefined;
  const backdropFilter = metrics.backdrop[variant];
  return { backdropFilter, WebkitBackdropFilter: backdropFilter } as ViewStyle;
}

export function GlassSurface({ variant, radius, interactive = false, tone = 'neutral', children, style, onLayout, ...rest }: Props) {
  const { reduceTransparency } = useGlassAccessibility();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const shape = { borderRadius: radius, borderCurve: 'continuous' } as const;
  const accent = tone === 'accent';
  if (!reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return <GlassView {...rest} glassEffectStyle="regular" colorScheme="light" isInteractive={interactive} tintColor={colors.tint[tone]} onLayout={onLayout} style={[styles.surface, shape, style]}>{children}</GlassView>;
  }
  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(previous => previous?.width === width && previous.height === height ? previous : { width, height });
    onLayout?.(event);
  };
  const material = reduceTransparency ? accent ? styles.accentSolid : styles.solid : variant === 'sheet' ? styles.sheet : accent ? styles.accent : styles.control;
  return <View {...rest} onLayout={handleLayout} style={[styles.surface, shape, material, !reduceTransparency && backdropStyle(variant), style]}>
    {!reduceTransparency && size && <GlassSheen width={size.width} height={size.height} radius={radius}/>}
    {children}
  </View>;
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden' },
  control: { backgroundColor: colors.controlFill, boxShadow: colors.controlShadow },
  sheet: { backgroundColor: colors.sheetFill, boxShadow: colors.sheetShadow },
  accent: { backgroundColor: colors.accentFill, boxShadow: colors.accentShadow },
  accentSolid: { backgroundColor: colors.accentSolid },
  solid: { backgroundColor: colors.solidFill, borderWidth: metrics.rimWidth, borderColor: colors.solidBorder },
});
