import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.workerEarnings;
const colors = horizonColors.workerEarnings;
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

type Props<Key extends string> = { items: readonly { key: Key; label: string }[]; selected: Key; onSelect: (key: Key) => void };

export function EarningsSegments<Key extends string>({ items, selected, onSelect }: Props<Key>) {
  const { reduceMotion } = useGlassAccessibility();
  const [width, setWidth] = useState(0);
  const [left] = useState(() => new Animated.Value(0));
  const placed = useRef(false);
  const count = segmentCount(items.length);
  const index = Math.max(0, items.findIndex(item => item.key === selected));
  const thumb = Math.max(0, innerSpan(width, metrics.segmentPadding) / count);

  useEffect(() => {
    if (thumb <= 0) return undefined;
    const target = metrics.segmentPadding + index * thumb;
    if (!placed.current) {
      left.setValue(target);
      placed.current = true;
      return undefined;
    }
    const slide = Animated.timing(left, { toValue: target, duration: reduceMotion ? metrics.slideReducedDuration : metrics.slideDuration, easing: easeOut, useNativeDriver: false });
    slide.start();
    return () => slide.stop();
  }, [index, thumb, reduceMotion, left]);

  return (
    <View accessibilityRole="tablist" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.segments}>
      {thumb > 0 ? <Animated.View pointerEvents="none" style={[styles.thumb, { left, width: thumb }]} /> : null}
      {items.map(item => {
        const active = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              void Haptics.selectionAsync();
              onSelect(item.key);
            }}
            style={styles.segment}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function innerSpan(size: number, padding: number): number {
  return size - padding * 2;
}

function segmentCount(items: number): number {
  return Math.max(items, 1);
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', padding: metrics.segmentPadding, borderRadius: metrics.segmentRadius, backgroundColor: colors.segmentTrack },
  thumb: { position: 'absolute', top: metrics.segmentPadding, bottom: metrics.segmentPadding, borderRadius: metrics.segmentRadius - metrics.segmentPadding, backgroundColor: colors.segmentActive, boxShadow: '0 1px 3px rgba(17,22,28,0.12)' },
  segment: { flex: 1, height: innerSpan(metrics.segmentHeight, metrics.segmentPadding), alignItems: 'center', justifyContent: 'center' },
  segmentText: { color: colors.segmentText, fontSize: metrics.segmentSize, fontWeight: horizonLayout.earningsSegmentsStyle.segmentTextFontWeight },
  segmentTextActive: { color: colors.segmentActiveText },
});
