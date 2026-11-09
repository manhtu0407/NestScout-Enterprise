import { StyleSheet, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { ThinkingStars } from './agent-thinking';
import { findKaelPhaseEntry, kaelPhaseIssueNotes } from './kael-phase';
import type { KaelPhase, KaelPhaseIssue } from './kael-phase';
import { KaelStepNotes } from './kael-step-notes';
import { KaelThinkingStatus } from './kael-thinking-status';

const metrics = horizonLayout.kaelMotion;

export function isKaelThinking(phase: KaelPhase | null): phase is KaelPhase {
  return phase !== null && findKaelPhaseEntry(phase).tone === 'busy';
}

type Props = { phase: KaelPhase; issue?: KaelPhaseIssue | null };

export function KaelThinkingRow({ phase, issue = null }: Props) {
  const entry = findKaelPhaseEntry(phase);
  const note = issue === null ? null : kaelPhaseIssueNotes[issue];
  const label = note?.short ?? entry.short;
  const lines = note ? [note.description] : [entry.description, `Việc tiếp theo: ${entry.next}`];
  return <View style={styles.row}>
    <View style={styles.loader}>
      <ThinkingStars paused={note !== null}/>
    </View>
    <View style={styles.copy}>
      <KaelThinkingStatus label={label} active={note === null}/>
      <KaelStepNotes key={`${phase}-${issue ?? 'busy'}`} lines={lines}/>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: metrics.thinkingGap, paddingVertical: metrics.thinkingPaddingVertical },
  loader: { height: metrics.statusLineHeight, justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: metrics.thinkingCopyGap },
});
