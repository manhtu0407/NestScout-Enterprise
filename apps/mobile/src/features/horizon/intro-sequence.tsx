import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { TransitionScreen } from './transition-screen';
import { WelcomeScreen } from './welcome-screen';

const motion = horizonLayout.introSequence;

export function IntroSequence({ onComplete }: { onComplete: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    let finished = false;
    const complete = () => { if (active && !finished) { finished = true; onComplete(); } };
    const animation = Animated.timing(progress, { toValue: 1, duration: motion.duration, easing: Easing.linear, useNativeDriver: true });
    const begin = (reduceMotion: boolean) => {
      if (!active || finished) return;
      if (reduceMotion) complete();
      else animation.start(({ finished: ended }) => { if (ended) complete(); });
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(begin).catch(() => begin(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { if (value) complete(); });
    return () => { active = false; animation.stop(); subscription.remove(); };
  }, [onComplete, progress]);
  const values = {
    welcome: progress.interpolate({ inputRange: [...motion.welcomeInput], outputRange: [...motion.welcomeOutput] }),
    transition: progress.interpolate({ inputRange: [...motion.transitionInput], outputRange: [...motion.transitionOutput] }),
    scale: progress.interpolate({ inputRange: [...motion.scaleInput], outputRange: [...motion.scaleOutput] }),
  };
  return <View style={styles.root} pointerEvents="auto" accessibilityViewIsModal>
    <Animated.View style={[styles.layer, { opacity: values.welcome }]}><WelcomeScreen /></Animated.View>
    <Animated.View style={[styles.layer, { opacity: values.transition, transform: [{ scale: values.scale }] }]}><TransitionScreen /></Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
