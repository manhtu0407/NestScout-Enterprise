import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Keyboard, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, type HostInstance, type ViewStyle } from 'react-native';

import { useGlassAccessibility } from '@/features/shared';
import type { Language } from '@/lib/preferences';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

import { OnboardingCard } from './onboarding-card';
import { cardWidthFor, clampStep, placeCard, spotlightBox, type CardPlacement, type OverlaySize, type SpotlightBox } from './onboarding-geometry';
import { onboardingChrome, onboardingSteps, type OnboardingAction, type OnboardingRole, type OnboardingStep } from './onboarding-steps';
import { useOnboardingTargets, type TargetRect } from './onboarding-targets';
import type { OnboardingController } from './use-onboarding';

const metrics = horizonLayout.onboarding;
const colors = horizonColors.onboarding;
const [outX1, outY1, outX2, outY2] = metrics.easeOut;
const [moveX1, moveY1, moveX2, moveY2] = metrics.easeInOut;
const easeOut = Easing.bezier(outX1, outY1, outX2, outY2);
const easeInOut = Easing.bezier(moveX1, moveY1, moveX2, moveY2);
const spotlightShadow = `0 0 0 ${metrics.spotlightSpread}px ${colors.scrim}`;

type Props = {
  controller: OnboardingController;
  role: OnboardingRole;
  language: Language;
  consentNeeded: boolean;
  profileIncomplete: boolean;
  hidden: boolean;
  onOpenMenu: () => void;
  onOpenPrivacy: () => void;
  onOpenProfile: () => void;
};

type Shown = { index: number; box: SpotlightBox | null };

function timing(value: Animated.Value, toValue: number, duration: number, easing: (input: number) => number, native: boolean) {
  return Animated.timing(value, { toValue, duration, easing, useNativeDriver: native });
}

function cardStyle(placement: CardPlacement, width: number): ViewStyle {
  if (placement.kind === 'center') return styles.centered;
  const base: ViewStyle = { position: 'absolute', width, left: placement.left };
  return placement.kind === 'above' ? { ...base, bottom: placement.bottom } : { ...base, top: placement.top };
}

export function OnboardingTour({ controller, role, language, consentNeeded, profileIncomplete, hidden, onOpenMenu, onOpenPrivacy, onOpenProfile }: Props) {
  const targets = useOnboardingTargets();
  const dimensions = useWindowDimensions();
  const { reduceMotion } = useGlassAccessibility();
  const [shown, setShown] = useState<Shown | null>(null);
  const [size, setSize] = useState<OverlaySize | null>(null);
  const rootNode = useRef<HostInstance>(null);
  const [closing, setClosing] = useState(false);
  const ringVisible = useRef(false);
  const [master] = useState(() => new Animated.Value(0));
  const [dim] = useState(() => new Animated.Value(1));
  const [cardMotion] = useState(() => new Animated.Value(0));
  const [ring] = useState(() => ({ x: new Animated.Value(0), y: new Animated.Value(0), width: new Animated.Value(0), height: new Animated.Value(0), radius: new Animated.Value(0), opacity: new Animated.Value(0) }));
  const running = controller.status === 'running';
  const available = targets?.available;
  const registryVersion = targets?.version;
  const plan = useMemo<readonly OnboardingStep[] | null>(
    () => running && available !== undefined ? onboardingSteps(role, { language, consentNeeded, profileIncomplete, available: available() }) : null,
    [available, consentNeeded, language, profileIncomplete, role, running],
  );
  if (!running && shown !== null) setShown(null);
  if (!running && closing) setClosing(false);
  const total = plan?.length ?? 0;
  const index = clampStep(controller.step, Math.max(total, 1));
  const chrome = useMemo(() => onboardingChrome(language), [language]);
  const { begin, go, conclude } = controller;

  useEffect(() => {
    if (controller.status !== 'eligible' || hidden || targets === null || !targets.has('composer') || !targets.has('menu')) return undefined;
    const timer = setTimeout(() => {
      Keyboard.dismiss();
      begin();
    }, controller.replay ? metrics.replayDelay : metrics.startDelay);
    return () => clearTimeout(timer);
  }, [begin, controller.replay, controller.status, hidden, targets, registryVersion]);

  useEffect(() => {
    if (running) return;
    ringVisible.current = false;
  }, [running]);

  useEffect(() => {
    if (!running || plan === null || targets === null || size === null) return undefined;
    const current = plan[index];
    if (current === undefined) return undefined;
    let live = true;
    const measure = async () => {
      const origin = await new Promise<{ x: number; y: number }>(resolve => {
        if (rootNode.current === null) resolve({ x: 0, y: 0 });
        else rootNode.current.measureInWindow((x, y) => resolve({ x, y }));
      });
      const rect: TargetRect | null = current.target === null ? null : await targets.measure(current.target);
      if (!live) return;
      const local = rect === null ? null : { ...rect, x: rect.x - origin.x, y: rect.y - origin.y };
      setShown({ index, box: local === null ? null : spotlightBox(local, size, metrics.ringPadding, metrics.ringMaxRadius) });
    };
    void measure();
    return () => { live = false; };
  }, [index, plan, running, size, targets, dimensions.width, dimensions.height]);

  const visible = running && !hidden && shown !== null && size !== null;
  const active = shown !== null && plan !== null ? plan[shown.index] : undefined;

  useEffect(() => {
    const animation = timing(master, visible ? 1 : 0, reduceMotion ? metrics.reducedDuration : visible ? metrics.enterDuration : metrics.exitDuration, easeOut, true);
    animation.start();
    return () => animation.stop();
  }, [master, reduceMotion, visible]);

  useEffect(() => {
    if (shown === null) return undefined;
    const box = shown.box;
    const fade = reduceMotion ? metrics.reducedDuration : metrics.cardDuration;
    const move = reduceMotion ? 0 : metrics.moveDuration;
    const animations: Animated.CompositeAnimation[] = [];
    if (box === null) {
      animations.push(timing(dim, 1, fade, easeOut, true), timing(ring.opacity, 0, fade, easeOut, false));
      ringVisible.current = false;
    } else {
      if (!ringVisible.current) {
        const settle = reduceMotion ? 0 : metrics.ringSettle;
        ring.x.setValue(box.x - settle);
        ring.y.setValue(box.y - settle);
        ring.width.setValue(box.width + settle * 2);
        ring.height.setValue(box.height + settle * 2);
        ring.radius.setValue(box.radius + settle);
      }
      animations.push(
        timing(ring.x, box.x, move, easeInOut, false),
        timing(ring.y, box.y, move, easeInOut, false),
        timing(ring.width, box.width, move, easeInOut, false),
        timing(ring.height, box.height, move, easeInOut, false),
        timing(ring.radius, box.radius, move, easeInOut, false),
        timing(ring.opacity, 1, fade, easeOut, false),
        timing(dim, 0, fade, easeOut, true),
      );
      ringVisible.current = true;
    }
    const group = Animated.parallel(animations);
    group.start();
    return () => group.stop();
  }, [dim, reduceMotion, ring, shown]);

  const shownIndex = shown?.index ?? -1;
  useLayoutEffect(() => {
    if (shownIndex < 0) return undefined;
    cardMotion.setValue(0);
    const animation = timing(cardMotion, 1, reduceMotion ? metrics.reducedDuration : metrics.cardDuration, easeOut, true);
    animation.start();
    return () => animation.stop();
  }, [cardMotion, reduceMotion, shownIndex]);

  const close = useCallback((outcome: 'completed' | 'skipped', after?: () => void) => {
    if (closing) return;
    setClosing(true);
    after?.();
    timing(master, 0, reduceMotion ? metrics.reducedDuration : metrics.exitDuration, easeOut, true).start(() => conclude(outcome));
  }, [closing, conclude, master, reduceMotion]);

  const goTo = useCallback((target: number) => {
    if (closing || total === 0) return;
    go(clampStep(target, total));
  }, [closing, go, total]);
  const forward = useCallback(() => {
    if (index < total - 1) goTo(index + 1);
  }, [goTo, index, total]);
  const back = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);
  const skip = useCallback(() => close('skipped'), [close]);
  const advance = useCallback(() => {
    if (index >= total - 1) close('completed');
    else goTo(index + 1);
  }, [close, goTo, index, total]);

  const act = useCallback((action: OnboardingAction) => {
    if (action === 'next') advance();
    else if (action === 'finish') close('completed');
    else if (action === 'openMenu') close('completed', onOpenMenu);
    else if (action === 'openPrivacy') close('completed', onOpenPrivacy);
    else close('completed', onOpenProfile);
  }, [advance, close, onOpenMenu, onOpenPrivacy, onOpenProfile]);

  useEffect(() => {
    if (!visible) return undefined;
    if (Platform.OS === 'web') {
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'ArrowRight') forward();
        else if (event.key === 'ArrowLeft') back();
        else if (event.key === 'Escape') skip();
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) back();
      else skip();
      return true;
    });
    return () => subscription.remove();
  }, [back, forward, index, skip, visible]);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > metrics.swipeStart && Math.abs(gesture.dx) > Math.abs(gesture.dy) * metrics.swipeBias,
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < metrics.swipeDistance) return;
      if (gesture.dx < 0) forward();
      else back();
    },
  }), [back, forward]);

  if (targets === null || !running || plan === null) return null;

  const cardWidth = size === null ? 0 : cardWidthFor(size, metrics.cardMaxWidth, metrics.gutter);
  const placement = size === null || shown === null ? null : placeCard(shown.box, size, cardWidth, metrics.targetGap, metrics.gutter);
  const lift = reduceMotion ? 0 : metrics.cardOffset;
  const cardMotionStyle = {
    opacity: cardMotion,
    transform: reduceMotion ? [] : [
      { translateY: cardMotion.interpolate({ inputRange: [0, 1], outputRange: [lift, 0] }) },
      { scale: cardMotion.interpolate({ inputRange: [0, 1], outputRange: [metrics.cardScaleFrom, 1] }) },
    ],
  };
  const spotlit = shown !== null && shown.box !== null;
  const ringAction: OnboardingAction = active?.target === 'menu' ? 'openMenu' : 'next';

  return <Animated.View
    ref={rootNode}
    testID="onboarding-overlay"
    onLayout={event => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
    pointerEvents={visible ? 'auto' : 'none'}
    style={[styles.root, { opacity: master }]}
  >
    <Animated.View pointerEvents="none" style={[styles.dim, { opacity: dim }]}/>
    <Animated.View pointerEvents={spotlit ? 'box-none' : 'none'} style={[styles.ring, { left: ring.x, top: ring.y, width: ring.width, height: ring.height, borderRadius: ring.radius, opacity: ring.opacity }]}>
      <Pressable accessible={false} focusable={false} onPress={() => act(ringAction)} style={StyleSheet.absoluteFill}/>
    </Animated.View>
    {active !== undefined && shown !== null && placement !== null && <Animated.View {...pan.panHandlers} style={[cardStyle(placement, cardWidth), cardMotionStyle]}>
      <ScrollView
        bounces={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={[{ maxHeight: placement.maxHeight }, placement.kind === 'center' ? { width: cardWidth } : undefined]}
      >
        <OnboardingCard step={active} index={shown.index} total={total} chrome={chrome} onPrimary={() => act(active.primary.action)} onAction={act} onBack={back} onSkip={skip} onJump={goTo}/>
      </ScrollView>
    </Animated.View>}
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: metrics.layer, overflow: 'hidden' },
  dim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  ring: { position: 'absolute', borderWidth: metrics.ringBorder, borderColor: colors.ringBorder, boxShadow: spotlightShadow },
  centered: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
