import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet } from 'react-native';
import type { ScrollViewInstance } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.workerJobs;
const colors = horizonColors.workerJobs;
const inset = horizonLayout.requestsScreen.paddingHorizontal;
const chipEasing = Easing.bezier(0.23, 1, 0.32, 1);

type Frame = { x: number; width: number; height: number };

export type SlidingChipItem = { key: string; label: string; count?: number; accessibilityLabel?: string };

type Props = {
  items: readonly SlidingChipItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
  role?: 'tab' | 'radio';
  inset?: boolean;
};

export function SlidingChips({ items, selectedKey, onSelect, role = 'tab', inset: padded = true }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const frames = useRef<Record<string, Frame>>({});
  const viewport = useRef(0);
  const content = useRef(0);
  const placed = useRef(false);
  const [measured, setMeasured] = useState(0);
  const [pillHeight, setPillHeight] = useState(0);
  const [pillLeft] = useState(() => new Animated.Value(0));
  const [pillWidth] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const frame = frames.current[selectedKey];
    if (!frame) return;
    setPillHeight(frame.height);
    const duration = reduceMotion ? metrics.chipReducedDuration : metrics.chipSlideDuration;
    if (placed.current) {
      const slide = Animated.parallel([
        Animated.timing(pillLeft, { toValue: frame.x, duration, easing: chipEasing, useNativeDriver: false }),
        Animated.timing(pillWidth, { toValue: frame.width, duration, easing: chipEasing, useNativeDriver: false }),
      ]);
      slide.start();
      return () => slide.stop();
    }
    pillLeft.setValue(frame.x);
    pillWidth.setValue(frame.width);
    placed.current = true;
    return undefined;
  }, [selectedKey, measured, reduceMotion, pillLeft, pillWidth]);

  useEffect(() => {
    const frame = frames.current[selectedKey];
    if (!frame || viewport.current <= 0) return;
    const maxX = Math.max(0, content.current - viewport.current);
    const target = Math.min(maxX, Math.max(0, frame.x + frame.width / 2 - viewport.current / 2));
    scrollRef.current?.scrollTo({ x: target, animated: placed.current && !reduceMotion });
  }, [selectedKey, measured, reduceMotion]);

  const select = (key: string) => {
    if (key === selectedKey) return;
    void Haptics.selectionAsync();
    onSelect(key);
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      showsHorizontalScrollIndicator={false}
      bounces
      alwaysBounceHorizontal
      decelerationRate="fast"
      onLayout={event => { viewport.current = event.nativeEvent.layout.width; setMeasured(value => value + 1); }}
      onContentSizeChange={width => { content.current = width; setMeasured(value => value + 1); }}
      style={styles.scroll}
      contentContainerStyle={[styles.row, padded && styles.rowInset]}
    >
      {pillHeight > 0 ? <Animated.View pointerEvents="none" style={[styles.pill, { left: pillLeft, width: pillWidth, height: pillHeight }]} /> : null}
      {items.map(item => (
        <Chip
          key={item.key}
          item={item}
          role={role}
          selected={item.key === selectedKey}
          reduceMotion={reduceMotion}
          onPress={() => select(item.key)}
          onFrame={frame => {
            frames.current[item.key] = frame;
            setMeasured(value => value + 1);
          }}
        />
      ))}
    </ScrollView>
  );
}

type ChipProps = { item: SlidingChipItem; role: 'tab' | 'radio'; selected: boolean; reduceMotion: boolean; onPress: () => void; onFrame: (frame: Frame) => void };

function Chip({ item, role, selected, reduceMotion, onPress, onFrame }: ChipProps) {
  const [progress] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    const fade = Animated.timing(progress, {
      toValue: selected ? 1 : 0,
      duration: reduceMotion ? metrics.chipReducedDuration : metrics.chipFadeDuration,
      easing: chipEasing,
      useNativeDriver: false,
    });
    fade.start();
    return () => fade.stop();
  }, [progress, reduceMotion, selected]);
  const fill = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.chipFill, colors.chipClearFill] });
  const labelColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.chipText, colors.chipActiveText] });
  const countFill = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.chipCountFill, colors.chipActiveCountFill] });
  const countColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.chipCountText, colors.chipActiveText] });
  const hasCount = item.count !== undefined;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={item.accessibilityLabel ?? (hasCount ? `${item.label}, ${item.count}` : item.label)}
      accessibilityState={role === 'tab' ? { selected } : { checked: selected }}
      onPress={onPress}
      onLayout={event => onFrame(event.nativeEvent.layout)}
    >
      <Animated.View style={[styles.chip, { backgroundColor: fill }]}>
        <Animated.Text style={[styles.label, { color: labelColor }]}>{item.label}</Animated.Text>
        {hasCount ? (
          <Animated.View style={[styles.count, { backgroundColor: countFill }]}>
            <Animated.Text style={[styles.countText, { color: countColor }]}>{item.count}</Animated.Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 0 },
  row: { gap: metrics.chipsGap },
  rowInset: { paddingHorizontal: inset },
  pill: { position: 'absolute', top: 0, borderRadius: metrics.chipRadius, backgroundColor: colors.chipActiveFill },
  chip: { minHeight: metrics.chipHeight, flexDirection: 'row', alignItems: 'center', gap: metrics.chipInnerGap, paddingHorizontal: metrics.chipPaddingHorizontal, borderRadius: metrics.chipRadius },
  label: { fontSize: metrics.chipFontSize, fontWeight: metrics.chipFontWeight },
  count: { minWidth: metrics.chipCountMinWidth, height: metrics.chipCountHeight, paddingHorizontal: metrics.chipCountPadding, borderRadius: metrics.chipCountRadius, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: metrics.chipCountSize, fontWeight: metrics.chipFontWeight, fontVariant: ['tabular-nums'] },
});
