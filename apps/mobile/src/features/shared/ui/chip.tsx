import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type ChipVariant = 'bold' | 'subtle' | 'caption';
export type ChipColor = 'lime' | 'rose' | 'yellow' | 'cyan' | 'neutral' | 'gray' | 'soft' | 'ink';
export type StatusDotColor = 'green' | 'yellow' | 'indigo' | 'red' | 'gray';

export const chipColors: readonly ChipColor[] = ['lime', 'rose', 'yellow', 'cyan', 'neutral', 'gray', 'soft'];
export const chipVariants: readonly ChipVariant[] = ['bold', 'subtle', 'caption'];

const pairs: Readonly<Record<ChipColor, { fg: string; bg: string }>> = {
  lime: colors.chipLime,
  rose: colors.chipRose,
  yellow: colors.chipYellow,
  cyan: colors.chipCyan,
  neutral: colors.chipNeutral,
  gray: colors.chipGray,
  soft: colors.chipSoft,
  ink: { fg: colors.solidFg, bg: colors.solidBg },
};

const dotColors: Readonly<Record<StatusDotColor, string>> = {
  green: colors.dotGreen,
  yellow: colors.dotYellow,
  indigo: colors.dotIndigo,
  red: colors.dotRed,
  gray: colors.faint,
};

const fonts: Readonly<Record<ChipVariant, number>> = { bold: metrics.chipFontLg, subtle: metrics.chipFontLg, caption: metrics.chipFontSm };
const verticals: Readonly<Record<ChipVariant, number>> = { bold: metrics.chipPadYBold, subtle: metrics.chipPadY, caption: metrics.chipPadY };

type StatusDotProps = { tone: StatusDotColor; label?: string; large?: boolean };

export function StatusDot({ tone, label, large = false }: StatusDotProps) {
  const size = large ? metrics.statusDotLg : metrics.statusDot;
  return <View accessibilityLabel={label} accessible={label !== undefined} style={{ width: size, height: size, borderRadius: metrics.pillRadius, backgroundColor: dotColors[tone] }}/>;
}

type Props = {
  label: string;
  variant?: ChipVariant;
  hue?: ChipColor;
  icon?: LucideIcon;
  dot?: StatusDotColor;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, variant = 'subtle', hue = 'neutral', icon: Glyph, dot, selected = false, onPress }: Props) {
  const { fg, bg } = pairs[hue];
  const body = <>
    {dot !== undefined && <StatusDot tone={dot}/>}
    {Glyph !== undefined && <Glyph size={metrics.chipGlyph} color={fg} strokeWidth={2.4}/>}
    <Text style={[styles.label, { color: fg, fontSize: fonts[variant] }]}>{label}</Text>
  </>;
  const shape = [styles.root, { backgroundColor: bg, borderColor: selected ? fg : bg, paddingVertical: verticals[variant] }];
  if (onPress === undefined) return <View accessibilityLabel={label} style={shape}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={shape}>{body}</Pressable>;
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: metrics.statusDotGap, paddingHorizontal: metrics.chipPadX, borderRadius: metrics.chipRadius, borderWidth: metrics.hair },
  label: { fontWeight: metrics.chipWeight },
});
