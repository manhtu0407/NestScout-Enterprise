import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { KaelShimmerText } from './kael-shimmer-text';
import { SourceStack, useGlassAccessibility } from '@/features/shared';
import type { SearchSource } from '@/features/shared';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';
import { AgentThinking } from './agent-thinking';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type SearchStep = Readonly<{
  id: string;
  label: string;
  query?: string;
  meta?: string;
  heading?: boolean;
  icon?: LucideIcon;
  sources?: readonly SearchSource[];
  dwell?: number;
}>;

export type SearchRow =
  | Readonly<{ id: string; kind: 'step'; step: SearchStep }>
  | Readonly<{ id: string; kind: 'sources'; sources: readonly SearchSource[] }>;

export function rowsOf(steps: readonly SearchStep[]): readonly SearchRow[] {
  return steps.flatMap((step): readonly SearchRow[] => step.sources === undefined || step.sources.length === 0
    ? [{ id: step.id, kind: 'step', step }]
    : [{ id: step.id, kind: 'step', step }, { id: `${step.id}-sources`, kind: 'sources', sources: step.sources }]);
}

export function rowDelay(row: SearchRow): number {
  return row.kind === 'sources' ? metrics.searchSourcesGap : row.step.dwell ?? metrics.searchDwell;
}

function Reveal({ children, still }: { children: ReactNode; still: boolean }) {
  const [progress] = useState(() => new Animated.Value(still ? metrics.hair : 0));
  useEffect(() => {
    Animated.timing(progress, { toValue: metrics.hair, duration: metrics.searchRevealMs, useNativeDriver: true }).start();
  }, [progress]);
  const lift = progress.interpolate({ inputRange: [0, metrics.hair], outputRange: [metrics.rowGap, 0] });
  return <Animated.View style={{ opacity: progress, transform: [{ translateY: lift }] }}>{children}</Animated.View>;
}

function StepRow({ step, active }: { step: SearchStep; active: boolean }) {
  const Glyph = step.icon ?? Search;
  const label = step.query === undefined ? step.label : `${step.label} “${step.query}”`;
  return <View style={styles.step}>
    <Glyph size={metrics.chipGlyph + metrics.tiny} color={step.heading === true ? colors.text : colors.muted}/>
    <View style={styles.copy}>
      {active
        ? <KaelShimmerText baseColor={colors.faint} highlightColor={colors.text} style={styles.label}>{label}</KaelShimmerText>
        : <Text style={[styles.label, step.heading === true && styles.heading]}>{label}</Text>}
    </View>
    {step.meta !== undefined && <Text style={styles.meta}>{step.meta}</Text>}
  </View>;
}

type Props = {
  steps: readonly SearchStep[];
  revealed?: number;
  working?: string | false;
  onComplete?: () => void;
};

export function WebSearchLog({ steps, revealed, working = 'Đang tra cứu', onComplete }: Props) {
  const { reduceMotion } = useGlassAccessibility();
  const rows = useMemo(() => rowsOf(steps), [steps]);
  const [timed, setTimed] = useState(0);
  const count = Math.min(rows.length, revealed ?? (reduceMotion ? rows.length : timed));
  const complete = count >= rows.length;
  useEffect(() => {
    if (revealed !== undefined || reduceMotion || timed >= rows.length) return;
    const previous = rows[timed - 1];
    const wait = previous === undefined ? metrics.searchSourcesGap : rowDelay(previous);
    const timer = setTimeout(() => setTimed(value => value + 1), wait);
    return () => clearTimeout(timer);
  }, [reduceMotion, revealed, rows, timed]);
  useEffect(() => {
    if (complete && rows.length > 0) onComplete?.();
  }, [complete, onComplete, rows.length]);
  return <View accessibilityLabel="Nhật ký tra cứu của Kael" style={styles.root}>
    {rows.slice(0, count).map((row, index) => <Reveal key={row.id} still={reduceMotion}>
      {row.kind === 'sources'
        ? <View style={styles.branch}><View style={styles.guide}/><View style={styles.body}><SourceStack sources={row.sources}/></View></View>
        : <StepRow step={row.step} active={!complete && index === count - 1}/>}
    </Reveal>)}
    {!complete && working !== false && <View style={styles.tail}><AgentThinking label={working}/></View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  step: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap, minHeight: metrics.searchRow },
  copy: { flex: 1 },
  label: { color: colors.muted, fontSize: metrics.bodySize, lineHeight: metrics.captionLine },
  heading: { color: colors.text, fontWeight: metrics.titleWeight },
  meta: { color: colors.faint, fontSize: metrics.captionSize },
  branch: { flexDirection: 'row', paddingLeft: metrics.searchGutter / metrics.tiny },
  guide: { width: metrics.searchGutter, height: metrics.searchRow / metrics.tiny, marginTop: -metrics.searchRow / metrics.tiny, borderLeftWidth: metrics.searchGuide, borderBottomWidth: metrics.searchGuide, borderBottomLeftRadius: metrics.smallRadius, borderColor: colors.border },
  body: { flex: 1, paddingTop: metrics.tiny },
  tail: { paddingTop: metrics.tiny },
});
