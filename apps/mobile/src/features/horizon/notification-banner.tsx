import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, PressScale, useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { appIconImage } from './kael-assets';
import { BannerLive, pullProgress, releaseOutcome, rubberBand } from './notification-banner-model';
import type { BannerNotice } from './notification-banner-model';

const metrics = horizonLayout.notificationBanner;
const colors = horizonColors.notificationBanner;
const offscreen = -1000;

type Props = {
  notice: BannerNotice | null;
  onOpen: (notice: BannerNotice) => void;
  onDismiss: (id: string) => void;
  onHold: (held: boolean) => void;
};

export function NotificationBanner({ notice, onOpen, onDismiss, onHold }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<BannerNotice | null>(null);
  const [rowHeight, setRowHeight] = useState(metrics.fallbackHeight - metrics.paddingVertical * 2);
  const [expanded, setExpanded] = useState(false);
  const [y] = useState(() => new Animated.Value(offscreen));
  const [fade] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(0));
  const [grow] = useState(() => new Animated.Value(0));
  const top = Math.max(insets.top, metrics.minTop) + metrics.topGap;
  const hidden = -(rowHeight + metrics.paddingVertical * 2 + top + metrics.hiddenPadding);
  const [live] = useState(() => new BannerLive());

  useEffect(() => {
    live.sync({ hidden, reduceMotion, expanded, shown, onHold, onOpen, onDismiss });
  });

  useEffect(() => () => { y.stopAnimation(); fade.stopAnimation(); press.stopAnimation(); grow.stopAnimation(); }, [y, fade, press, grow]);

  const arrive = useCallback(() => {
    y.stopAnimation();
    fade.stopAnimation();
    if (live.reduceMotion) {
      y.setValue(0);
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: metrics.reducedDuration, useNativeDriver: true }).start();
      return;
    }
    y.setValue(live.hidden);
    Animated.spring(y, { toValue: 0, ...metrics.arrivalSpring, useNativeDriver: true }).start();
  }, [fade, live, y]);

  const leave = useCallback((velocity: number, done: () => void) => {
    const animation = live.reduceMotion
      ? Animated.timing(fade, { toValue: 0, duration: metrics.reducedDuration, useNativeDriver: true })
      : Animated.spring(y, { toValue: live.hidden, velocity, ...metrics.settleSpring, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) done(); });
  }, [fade, live, y]);

  const reveal = useCallback((next: BannerNotice) => {
    setExpanded(false);
    setShown(next);
  }, []);

  const clear = useCallback(() => {
    setExpanded(false);
    setShown(null);
  }, []);

  if (notice !== null && shown === null) setShown(notice);

  useEffect(() => {
    const current = live.shown;
    if (notice === null) {
      if (current !== null) leave(0, clear);
      return;
    }
    if (current !== null && current.id !== notice.id) leave(0, () => reveal(notice));
  }, [notice, leave, live, reveal, clear]);

  useEffect(() => {
    if (shown === null) return;
    grow.setValue(0);
    arrive();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    AccessibilityInfo.announceForAccessibility(`${shown.title}. ${shown.body}`);
  }, [shown, arrive, grow]);

  const settle = (velocity: number) => Animated.spring(y, { toValue: 0, velocity, ...metrics.settleSpring, useNativeDriver: true }).start();
  const pressTo = (toValue: number) => Animated.spring(press, { toValue, ...metrics.pressSpring, useNativeDriver: true }).start();
  const growTo = (toValue: number) => Animated.spring(grow, { toValue, ...metrics.expandSpring, useNativeDriver: false }).start();

  const dismissNow = (velocity: number) => {
    const current = live.shown;
    if (current === null) return;
    live.onHold(false);
    leave(velocity, () => live.onDismiss(current.id));
  };

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      y.stopAnimation(value => live.grab(value));
      pressTo(1);
      live.onHold(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const raw = live.drag(gesture.dy);
      y.setValue(raw > 0 ? rubberBand(raw) : raw);
      if (!live.expanded) grow.setValue(pullProgress(raw));
    },
    onPanResponderRelease: (_event, gesture) => {
      const velocity = gesture.vy * 1000;
      const moved = Math.abs(gesture.dx) > metrics.tapSlop || Math.abs(gesture.dy) > metrics.tapSlop;
      const outcome = releaseOutcome({ offset: live.offset, velocity, height: rowHeight + metrics.paddingVertical * 2, moved, expanded: live.expanded });
      pressTo(0);
      if (outcome === 'dismiss') {
        dismissNow(velocity);
        return;
      }
      settle(outcome === 'open' ? 0 : velocity);
      if (outcome === 'open') {
        const current = live.shown;
        if (current !== null) live.onOpen(current);
        live.onHold(live.expanded);
      } else if (outcome === 'expand') {
        setExpanded(true);
        live.sync({ expanded: true });
        growTo(1);
      } else {
        if (!live.expanded) growTo(0);
        live.onHold(live.expanded);
      }
    },
    onPanResponderTerminate: () => {
      pressTo(0);
      settle(0);
      if (!live.expanded) growTo(0);
      live.onHold(live.expanded);
    },
  });

  if (shown === null) return null;

  const scale = reduceMotion ? 1 : press.interpolate({ inputRange: [0, 1], outputRange: [1, metrics.pressScale] });
  const actionsHeight = Animated.multiply(grow, metrics.actionHeight + metrics.actionTop);
  return (
    <View pointerEvents="box-none" style={[styles.layer, { top }]}>
      <Animated.View
        {...responder.panHandlers}
        accessible={!expanded}
        accessibilityRole="alert"
        accessibilityLabel={`${shown.title}. ${shown.body}`}
        accessibilityActions={[{ name: 'activate', label: 'Xem' }, { name: 'dismiss', label: 'Bỏ qua' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'activate') onOpen(shown);
          else if (event.nativeEvent.actionName === 'dismiss') dismissNow(0);
        }}
        style={[styles.gesture, { opacity: reduceMotion ? fade : 1, transform: [{ translateY: y }, { scale }] }]}
      >
        <GlassSurface variant="sheet" radius={metrics.radius} style={styles.surface}>
          <View onLayout={(event: LayoutChangeEvent) => setRowHeight(event.nativeEvent.layout.height)} style={styles.row}>
            <Image source={appIconImage} accessibilityIgnoresInvertColors style={styles.icon} />
            <View style={styles.copy}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.title}>{shown.title}</Text>
                <Text style={styles.time}>{shown.time}</Text>
              </View>
              <Text numberOfLines={expanded ? metrics.expandedLines : metrics.collapsedLines} style={styles.body}>{shown.body}</Text>
            </View>
          </View>
          <Animated.View
            pointerEvents={expanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? 'yes' : 'no-hide-descendants'}
            style={[styles.actions, { height: actionsHeight, opacity: grow }]}
          >
            <PressScale accessibilityRole="button" accessibilityLabel="Bỏ qua thông báo" onPress={() => dismissNow(0)} wrapperStyle={styles.cell} style={[styles.action, styles.secondary]}>
              <Text style={styles.secondaryLabel}>Bỏ qua</Text>
            </PressScale>
            <PressScale accessibilityRole="button" accessibilityLabel={`Xem ${shown.title}`} onPress={() => onOpen(shown)} wrapperStyle={styles.cell} style={[styles.action, styles.primary]}>
              <Text style={styles.primaryLabel}>Xem</Text>
            </PressScale>
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: metrics.inset, right: metrics.inset, zIndex: metrics.zIndex },
  gesture: { userSelect: 'none' },
  surface: { paddingHorizontal: metrics.paddingHorizontal, paddingVertical: metrics.paddingVertical },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: metrics.gap },
  icon: { width: metrics.iconSize, height: metrics.iconSize, borderRadius: metrics.iconRadius, borderCurve: 'continuous', backgroundColor: colors.iconBackdrop },
  copy: { flex: 1, minWidth: 0, gap: metrics.copyGap },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: metrics.gap },
  title: { flexShrink: 1, color: colors.title, fontSize: metrics.titleSize, lineHeight: metrics.titleLine, fontWeight: metrics.titleWeight },
  time: { color: colors.time, fontSize: metrics.timeSize, lineHeight: metrics.timeLine },
  body: { color: colors.body, fontSize: metrics.bodySize, lineHeight: metrics.bodyLine },
  actions: { flexDirection: 'row', gap: metrics.actionGap, overflow: 'hidden', paddingTop: metrics.actionTop },
  cell: { flex: 1 },
  action: { height: metrics.actionHeight, borderRadius: metrics.actionRadius, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: colors.actionFill },
  primary: { backgroundColor: colors.primaryFill },
  secondaryLabel: { color: colors.actionInk, fontSize: metrics.actionSize, fontWeight: metrics.actionWeight },
  primaryLabel: { color: colors.primaryInk, fontSize: metrics.actionSize, fontWeight: metrics.actionWeight },
});
