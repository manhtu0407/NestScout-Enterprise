import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { VideoPlayer } from 'expo-video';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { kaelIdleLabel, kaelPhaseLabels, kaelPhases } from './kael-phase';
import type { KaelPhase } from './kael-phase';

const metrics = horizonLayout.kaelAvatar;
const colors = horizonColors.kaelAvatar;

type Slot = 'idle' | KaelPhase;

const slots: readonly Slot[] = ['idle', ...kaelPhases];

const sources: Record<Slot, number> = {
  idle: require('../../../assets/horizon/kael-greeting.mp4'),
  researching: require('../../../assets/horizon/kael-researching.mp4'),
  working: require('../../../assets/horizon/kael-working.mp4'),
  completed: require('../../../assets/horizon/kael-completed.mp4'),
};

const posters: Record<Slot, number> = {
  idle: require('../../../assets/horizon/kael-greeting-poster.png'),
  researching: require('../../../assets/horizon/kael-researching-poster.png'),
  working: require('../../../assets/horizon/kael-working-poster.png'),
  completed: require('../../../assets/horizon/kael-completed-poster.png'),
};

type Props = { phase: KaelPhase | null; size?: number };

function restart(player: VideoPlayer) {
  player.currentTime = 0;
  player.play();
}

export function KaelStatusAvatar({ phase, size = metrics.size }: Props) {
  const active: Slot = phase ?? 'idle';
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [idleOpacity] = useState(() => new Animated.Value(active === 'idle' ? 1 : 0));
  const [researchingOpacity] = useState(() => new Animated.Value(active === 'researching' ? 1 : 0));
  const [workingOpacity] = useState(() => new Animated.Value(active === 'working' ? 1 : 0));
  const [completedOpacity] = useState(() => new Animated.Value(active === 'completed' ? 1 : 0));
  const [float] = useState(() => new Animated.Value(0));
  const opacities = useMemo<Record<Slot, Animated.Value>>(() => ({ idle: idleOpacity, researching: researchingOpacity, working: workingOpacity, completed: completedOpacity }), [idleOpacity, researchingOpacity, workingOpacity, completedOpacity]);

  const idlePlayer = useVideoPlayer(sources.idle, player => { player.muted = true; player.loop = true; });
  const researchingPlayer = useVideoPlayer(sources.researching, player => { player.muted = true; player.loop = true; });
  const workingPlayer = useVideoPlayer(sources.working, player => { player.muted = true; player.loop = true; });
  const completedPlayer = useVideoPlayer(sources.completed, player => { player.muted = true; player.loop = true; });
  const players = useMemo<Record<Slot, VideoPlayer>>(() => ({ idle: idlePlayer, researching: researchingPlayer, working: workingPlayer, completed: completedPlayer }), [idlePlayer, researchingPlayer, workingPlayer, completedPlayer]);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduceMotion(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { live = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;
    for (const key of slots) {
      const player = players[key];
      if (key !== active || reduceMotion) { player.pause(); continue; }
      restart(player);
    }
    const duration = reduceMotion ? 0 : metrics.fadeDuration;
    const transition = Animated.parallel(slots.map(key => Animated.timing(opacities[key], { toValue: key === active ? 1 : 0, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true })));
    transition.start();
    return () => transition.stop();
  }, [active, opacities, players, reduceMotion]);

  useEffect(() => {
    float.setValue(0);
    if (reduceMotion !== false || phase === null || phase === 'completed') return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: metrics.floatDistance, duration: metrics.floatDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: metrics.floatDuration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [float, phase, reduceMotion]);

  const label = phase === null ? kaelIdleLabel : kaelPhaseLabels[phase];
  const innerSize = size - metrics.innerInset;
  const circle = { width: size, height: size, borderRadius: size * metrics.radiusRatio };
  const inner = { width: innerSize, height: innerSize, borderRadius: innerSize * metrics.radiusRatio };
  const frameStyle = (key: Slot) => {
    const frame = metrics.frames[key];
    return [styles.media, inner, { transform: [{ translateX: innerSize * frame.offsetX }, { translateY: innerSize * frame.offsetY }, { scale: frame.scale }] }];
  };
  return <Animated.View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, transform: [{ translateY: float }] }}>
    <View pointerEvents="none" style={[styles.avatar, circle]}>
      <View style={[styles.clip, inner]}>
        {slots.map(key => <Animated.View key={key} pointerEvents="none" style={[styles.layer, { opacity: opacities[key] }]}>
          {reduceMotion
            ? key === active && <View pointerEvents="none" style={frameStyle(key)}><Image source={posters[key]} style={[styles.media, inner]} resizeMode="cover" /></View>
            : <View pointerEvents="none" style={frameStyle(key)}><VideoView player={players[key]} style={[styles.media, inner]} nativeControls={false} contentFit="cover" /></View>}
        </Animated.View>)}
      </View>
      <View pointerEvents="none" style={[styles.ring, inner]} />
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  avatar: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: metrics.borderWidth,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: metrics.shadowOpacity,
    shadowRadius: metrics.shadowRadius,
    shadowOffset: { width: 0, height: metrics.shadowOffsetY },
    elevation: metrics.elevation,
  },
  clip: { overflow: 'hidden' },
  media: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  ring: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: metrics.ringWidth, borderColor: colors.ring },
});
