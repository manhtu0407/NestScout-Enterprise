import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { Icon, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.slideConfirm;
const colors = horizonColors.slideConfirm;
const activate = 'activate';

type Props = {
  label: string;
  accessibilityLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
};

export function SlideToConfirm({ label, accessibilityLabel, onConfirm, disabled = false }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const [width, setWidth] = useState(0);
  const [done, setDone] = useState(false);
  const [base] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [grab] = useState(() => new Animated.Value(0));
  const travel = Math.max(metrics.travelMinimum, width - metrics.thumb - metrics.inset * 2);
  const locked = disabled || done;

  useEffect(() => () => { base.stopAnimation(); drag.stopAnimation(); grab.stopAnimation(); }, [base, drag, grab]);

  const glide = (value: Animated.Value, toValue: number, finished?: () => void) => {
    const animation = reduceMotion
      ? Animated.timing(value, { toValue, duration: metrics.reducedDuration, useNativeDriver: false })
      : Animated.spring(value, { toValue, ...metrics.settleSpring, useNativeDriver: false });
    animation.start(() => finished?.());
  };

  const release = () => glide(grab, 0);

  const complete = (from: number) => {
    if (locked) return;
    setDone(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    base.setValue(from);
    drag.setValue(0);
    glide(base, travel, onConfirm);
  };

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => !locked,
    onMoveShouldSetPanResponder: () => !locked,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      base.stopAnimation();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      glide(grab, 1);
    },
    onPanResponderMove: (_event, gesture) => drag.setValue(gesture.dx),
    onPanResponderRelease: (_event, gesture) => {
      release();
      base.stopAnimation(start => {
        const reached = Math.min(travel, Math.max(0, start + gesture.dx));
        drag.setValue(0);
        base.setValue(reached);
        if (reached / travel >= metrics.threshold) complete(reached);
        else glide(base, 0);
      });
    },
    onPanResponderTerminate: () => {
      release();
      drag.setValue(0);
      glide(base, 0);
    },
  });

  const { offset, fillWidth, labelOpacity } = useMemo(() => {
    const position = Animated.add(base, drag).interpolate({ inputRange: [0, travel], outputRange: [0, travel], extrapolate: 'clamp' });
    return {
      offset: position,
      fillWidth: position.interpolate({ inputRange: [0, travel], outputRange: [0, width], extrapolate: 'clamp' }),
      labelOpacity: position.interpolate({ inputRange: [0, travel * metrics.fadeDistance], outputRange: [1, 0], extrapolate: 'clamp' }),
    };
  }, [base, drag, travel, width]);
  const thumbScale = reduceMotion ? 1 : grab.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.pressScale] });

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Vuốt sang phải hoặc nhấn đúp để xác nhận"
      accessibilityState={{ disabled, busy: done }}
      accessibilityActions={[{ name: activate, label }]}
      onAccessibilityAction={event => { if (event.nativeEvent.actionName === activate) complete(0); }}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.track, disabled && styles.disabled]}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { width: fillWidth }]} />
      <Animated.Text pointerEvents="none" style={[styles.label, { opacity: labelOpacity }]}>{label}</Animated.Text>
      <Animated.View
        {...(locked ? {} : responder.panHandlers)}
        style={[styles.thumb, { transform: [{ translateX: offset }, { scale: thumbScale }] }]}
      >
        <Icon name={done ? 'check' : 'arrowRight'} size={metrics.iconSize} strokeWidth={metrics.iconStroke} color={colors.thumbIcon} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: metrics.height, borderRadius: metrics.radius, backgroundColor: colors.track, justifyContent: 'center', overflow: 'hidden' },
  disabled: { opacity: horizonLayout.supportScreens.saveDisabledOpacity },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: metrics.radius, backgroundColor: colors.fill },
  label: { position: 'absolute', left: metrics.thumb + metrics.inset + metrics.labelGap, right: metrics.inset, textAlign: 'center', color: colors.label, fontSize: metrics.labelSize, fontWeight: metrics.labelWeight },
  thumb: { position: 'absolute', top: metrics.inset, left: metrics.inset, width: metrics.thumb, height: metrics.thumb, borderRadius: metrics.thumbRadius, backgroundColor: colors.thumb, alignItems: 'center', justifyContent: 'center', boxShadow: colors.thumbShadow },
});
