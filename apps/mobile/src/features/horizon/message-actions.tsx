import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight, Check, Copy, RefreshCw, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useGlassAccessibility } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.affectLab;
const colors = horizonColors.affectLab;

export type FeedbackKind = 'up' | 'down';

export const feedbackReasons: readonly string[] = ['Không chính xác', 'Quá dài', 'Không làm theo yêu cầu', 'Khác'];

type Props = {
  text: string;
  versions?: readonly string[];
  version?: number;
  onVersionChange?: (version: number) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
  onFeedback?: (kind: FeedbackKind, reason: string | null) => void;
  onCopy?: (text: string) => void | boolean | Promise<boolean | void>;
  speaking?: boolean;
  onSpeak?: (play: boolean) => void;
  soon?: boolean;
};

function useTimedFlag(duration: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), duration);
    return () => clearTimeout(timer);
  }, [on, duration]);
  return [on, () => setOn(true)];
}

function ActionButton({ label, onPress, pressed = false, locked = false, children }: { label: string; onPress: () => void; pressed?: boolean; locked?: boolean; children: ReactNode }) {
  const { reduceMotion } = useGlassAccessibility();
  const [pop] = useState(() => new Animated.Value(1));
  const press = () => {
    onPress();
    if (reduceMotion) return;
    pop.setValue(metrics.actionPop);
    Animated.spring(pop, { toValue: 1, speed: 24, bounciness: 8, useNativeDriver: true }).start();
  };
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: pressed, disabled: locked }} disabled={locked} onPress={press} style={({ hovered }: { hovered?: boolean }) => [styles.action, (hovered || pressed) && styles.actionActive, locked && styles.actionLocked]}>
    <Animated.View style={{ transform: [{ scale: pop }] }}>{children}</Animated.View>
  </Pressable>;
}

const ratingStyles: Readonly<Record<FeedbackKind, { icon: LucideIcon; tint: string; fill: string }>> = {
  up: { icon: ThumbsUp, tint: colors.accent, fill: colors.accentSoft },
  down: { icon: ThumbsDown, tint: colors.error, fill: colors.errorFill },
};

function RatingButton({ kind, label, rating, onRate, locked }: { kind: FeedbackKind; label: string; rating: FeedbackKind | null; onRate: (kind: FeedbackKind) => void; locked: boolean }) {
  const { icon: Glyph, tint, fill } = ratingStyles[kind];
  const active = rating === kind;
  return <ActionButton label={label} pressed={active} locked={locked} onPress={() => onRate(kind)}>
    <Glyph size={metrics.actionIcon} color={active ? tint : colors.muted} fill={active ? fill : 'none'}/>
  </ActionButton>;
}

function Equalizer() {
  const { reduceMotion } = useGlassAccessibility();
  const [bars] = useState(() => Array.from({ length: metrics.equalizerBars }, () => new Animated.Value(0.4)));
  useEffect(() => {
    if (reduceMotion) return;
    const loops = bars.map((bar, index) => Animated.loop(Animated.sequence([
      Animated.timing(bar, { toValue: 1, duration: 280 + index * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bar, { toValue: 0.3, duration: 280 + index * 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])));
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [bars, reduceMotion]);
  return <View style={styles.equalizer}>{bars.map((bar, index) => <Animated.View key={index} style={[styles.equalizerBar, { transform: [{ scaleY: bar }] }]}/>)}</View>;
}

function Spinning({ spinning, children }: { spinning: boolean; children: ReactNode }) {
  const { reduceMotion } = useGlassAccessibility();
  const [angle] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!spinning || reduceMotion) return;
    angle.setValue(0);
    const loop = Animated.loop(Animated.timing(angle, { toValue: 1, duration: metrics.spinDuration, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, angle, reduceMotion]);
  return <Animated.View style={{ transform: [{ rotate: angle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>{children}</Animated.View>;
}

export function MessageActions({ text, versions, version = 0, onVersionChange, onRegenerate, regenerating = false, onFeedback, onCopy, speaking = false, onSpeak, soon = false }: Props) {
  const [copied, markCopied] = useTimedFlag(1400);
  const [feedback, setFeedback] = useState<FeedbackKind | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [thanks, showThanks] = useTimedFlag(1800);
  const count = versions?.length ?? 1;
  const copy = () => {
    void Promise.resolve(onCopy?.(text)).then((written) => {
      if (written !== false) markCopied();
    });
  };
  const rate = (kind: FeedbackKind) => {
    const next = feedback === kind ? null : kind;
    setFeedback(next);
    setReasonOpen(next === 'down');
    if (next !== null) onFeedback?.(next, null);
    if (next === 'up') showThanks();
  };
  const pickReason = (reason: string) => {
    setReasonOpen(false);
    onFeedback?.('down', reason);
    showThanks();
  };
  return <View style={styles.root}>
    <View style={styles.actions}>
      <ActionButton label={copied ? 'Đã sao chép' : 'Sao chép'} onPress={copy}>
        {copied ? <Check size={metrics.actionIcon} color={colors.success} strokeWidth={2.5}/> : <Copy size={metrics.actionIcon} color={colors.muted}/>}
      </ActionButton>
      <ActionButton label="Tạo lại câu trả lời" locked={soon} onPress={() => onRegenerate?.()}>
        <Spinning spinning={regenerating}><RefreshCw size={metrics.actionIcon} color={colors.muted}/></Spinning>
      </ActionButton>
      {count > 1 && <View style={styles.versions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Phiên bản trước" disabled={version <= 0} onPress={() => onVersionChange?.(version - 1)}><ChevronLeft size={16} color={version <= 0 ? colors.faint : colors.muted}/></Pressable>
        <Text style={styles.versionText}>{version + 1}/{count}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Phiên bản sau" disabled={version >= count - 1} onPress={() => onVersionChange?.(version + 1)}><ChevronRight size={16} color={version >= count - 1 ? colors.faint : colors.muted}/></Pressable>
      </View>}
      <RatingButton kind="up" label="Câu trả lời tốt" rating={feedback} onRate={rate} locked={soon}/>
      <RatingButton kind="down" label="Câu trả lời chưa tốt" rating={feedback} onRate={rate} locked={soon}/>
      <ActionButton label={speaking ? 'Dừng đọc' : 'Đọc to'} pressed={speaking} locked={soon} onPress={() => onSpeak?.(!speaking)}>
        {speaking ? <Equalizer/> : <Volume2 size={metrics.actionIcon} color={colors.muted}/>}
      </ActionButton>
      {soon && <Text style={styles.soon}>Coming Soon</Text>}
    </View>
    {reasonOpen && <View style={styles.reasons}>
      <Text style={styles.reasonTitle}>Có vấn đề gì?</Text>
      <View style={styles.reasonRow}>
        {feedbackReasons.map(reason => <Pressable key={reason} accessibilityRole="button" onPress={() => pickReason(reason)} style={styles.reason}><Text style={styles.reasonText}>{reason}</Text></Pressable>)}
      </View>
    </View>}
    {thanks && <Text accessibilityLiveRegion="polite" style={styles.thanks}>Cảm ơn phản hồi của bạn</Text>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.reasonGap },
  actions: { flexDirection: 'row', alignItems: 'center', gap: metrics.actionGap },
  action: { width: metrics.actionSize, height: metrics.actionSize, borderRadius: metrics.actionRadius, alignItems: 'center', justifyContent: 'center' },
  actionActive: { backgroundColor: colors.chip },
  actionLocked: { opacity: metrics.actionLockedOpacity },
  soon: { color: colors.faint, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  versions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: metrics.versionWidth, gap: metrics.tinyGap },
  versionText: { color: colors.muted, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  equalizer: { flexDirection: 'row', alignItems: 'center', gap: metrics.equalizerGap, height: metrics.equalizerHeight },
  equalizerBar: { width: metrics.equalizerWidth, height: metrics.equalizerHeight, borderRadius: metrics.pillRadius, backgroundColor: colors.accent },
  reasons: { gap: metrics.reasonHalf },
  reasonTitle: { color: colors.muted, fontSize: metrics.captionSize },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.reasonGap },
  reason: { backgroundColor: colors.chip, borderRadius: metrics.reasonRadius, paddingHorizontal: metrics.reasonPaddingX, paddingVertical: metrics.reasonPaddingY },
  reasonText: { color: colors.text, fontSize: metrics.captionSize },
  thanks: { color: colors.success, fontSize: metrics.captionSize },
});
