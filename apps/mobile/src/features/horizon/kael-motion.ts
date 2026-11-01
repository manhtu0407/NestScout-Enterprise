import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

export const kaelTransition = { duration: 740, delay: 735, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;
export const kaelLanding = { duration: 690 } as const;
export const kaelReaction = { duration: 660 } as const;

const landingKeyframes = [
  { at: 0, y: -1, scaleX: 1, scaleY: 1 },
  { at: 0.18, y: 2, scaleX: 1.052, scaleY: 0.944 },
  { at: 0.38, y: -7, scaleX: 0.989, scaleY: 1.018 },
  { at: 0.65, y: 1, scaleX: 1.017, scaleY: 0.986 },
  { at: 0.82, y: -2, scaleX: 0.996, scaleY: 1.004 },
  { at: 1, y: 0, scaleX: 1, scaleY: 1 },
] as const;

const gentleReaction = {
  rotate: [0, -2, 1, 0],
  lift: [0, -1, 0, 0],
} as const;

const nodReaction = {
  rotate: [0, 3, -1, 0],
  lift: [0, 2, 0, 0],
} as const;

const reactionStops = [0, 0.32, 0.7, 1] as const;
const nodStops = [0, 0.38, 0.7, 1] as const;

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { live = false; subscription.remove(); };
  }, []);
  return reduceMotion;
}

export function useKaelMotion(chatActive: boolean, reduceMotion: boolean) {
  const progress = useState(() => new Animated.Value(chatActive ? 1 : 0))[0];
  const landing = useState(() => new Animated.Value(1))[0];
  const reaction = useState(() => new Animated.Value(1))[0];

  useEffect(() => {
    const transition = Animated.timing(progress, { toValue: chatActive ? 1 : 0, duration: reduceMotion ? 0 : kaelTransition.duration, easing: kaelTransition.easing, useNativeDriver: true });
    transition.start();
    return () => transition.stop();
  }, [chatActive, progress, reduceMotion]);

  useEffect(() => {
    if (!chatActive || reduceMotion) {
      landing.setValue(1);
      return;
    }
    landing.setValue(0);
    let landingAnimation: Animated.CompositeAnimation | undefined;
    const timer = setTimeout(() => {
      landingAnimation = Animated.timing(landing, { toValue: 1, duration: kaelLanding.duration, easing: Easing.linear, useNativeDriver: true });
      landingAnimation.start();
    }, kaelTransition.delay);
    return () => {
      clearTimeout(timer);
      landingAnimation?.stop();
    };
  }, [chatActive, landing, reduceMotion]);

  const react = useCallback(() => {
    if (reduceMotion) return;
    reaction.setValue(0);
    Animated.timing(reaction, { toValue: 1, duration: kaelReaction.duration, easing: Easing.linear, useNativeDriver: true }).start();
  }, [reaction, reduceMotion]);

  return { progress, landing, reaction, react };
}

export function landingTransform(value: Animated.Value, pivotDistance: number) {
  const input = landingKeyframes.map(frame => frame.at);
  return [
    { translateY: value.interpolate({ inputRange: input, outputRange: landingKeyframes.map(frame => frame.y + pivotDistance * (1 - frame.scaleY)) }) },
    { scaleX: value.interpolate({ inputRange: input, outputRange: landingKeyframes.map(frame => frame.scaleX) }) },
    { scaleY: value.interpolate({ inputRange: input, outputRange: landingKeyframes.map(frame => frame.scaleY) }) },
  ];
}

export function reactionTransform(value: Animated.Value, nod: boolean) {
  const profile = nod ? nodReaction : gentleReaction;
  const stops = nod ? nodStops : reactionStops;
  return [
    { rotate: value.interpolate({ inputRange: [...stops], outputRange: profile.rotate.map(degrees => `${degrees}deg`) }) },
    { translateY: value.interpolate({ inputRange: [...stops], outputRange: [...profile.lift] }) },
  ];
}
