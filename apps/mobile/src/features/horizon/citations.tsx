import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, Users, X } from 'lucide-react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type CitationKind = 'source' | 'community';

export type Citation = Readonly<{ id: string; kind: CitationKind; label: string; title: string; detail: string }>;

export type CitedSegment = Readonly<{ text: string }> | Readonly<{ cite: Citation }>;

const kindTone: Readonly<Record<CitationKind, { fg: string; bg: string; heading: string }>> = {
  source: { fg: colors.infoFg, bg: colors.infoBg, heading: 'Căn cứ của Kael' },
  community: { fg: colors.successFg, bg: colors.successBg, heading: 'Tổng hợp từ người dùng NestScout' },
};

function isCite(segment: CitedSegment): segment is Readonly<{ cite: Citation }> {
  return 'cite' in segment;
}

export function citationsIn(segments: readonly CitedSegment[]): readonly Citation[] {
  return segments.filter(isCite).map(segment => segment.cite);
}

function CitationCard({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const tone = kindTone[citation.kind];
  const Glyph = citation.kind === 'source' ? FileText : Users;
  return <View accessibilityLiveRegion="polite" style={[styles.card, { borderColor: tone.bg }]}>
    <View style={styles.cardHead}>
      <View style={[styles.cardIcon, { backgroundColor: tone.bg }]}><Glyph size={metrics.citeIcon} color={tone.fg} strokeWidth={2.2}/></View>
      <Text style={[styles.cardKind, { color: tone.fg }]}>{tone.heading}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng nguồn" hitSlop={8} onPress={onClose} style={styles.cardClose}><X size={metrics.citeIcon} color={colors.faint}/></Pressable>
    </View>
    <Text style={styles.cardTitle}>{citation.title}</Text>
    <Text style={styles.cardDetail}>{citation.detail}</Text>
  </View>;
}

type Props = { segments: readonly CitedSegment[]; color?: string };

export function CitedText({ segments, color = colors.text }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = citationsIn(segments).find(citation => citation.id === openId) ?? null;
  return <View style={styles.root}>
    <Text style={[styles.body, { color }]}>
      {segments.map((segment, index) => isCite(segment)
        ? <Text key={segment.cite.id} accessibilityRole="button" accessibilityLabel={`Nguồn: ${segment.cite.label}`} onPress={() => setOpenId(current => current === segment.cite.id ? null : segment.cite.id)} style={[styles.chip, { color: kindTone[segment.cite.kind].fg, backgroundColor: kindTone[segment.cite.kind].bg }]}>{` ${segment.cite.label} `}</Text>
        : <Text key={index}>{segment.text}</Text>)}
    </Text>
    {open !== null && <CitationCard citation={open} onClose={() => setOpenId(null)}/>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.gap },
  body: { fontSize: metrics.bodySize, lineHeight: metrics.bodyLine },
  chip: { fontSize: metrics.captionSize, fontWeight: metrics.titleWeight, borderRadius: metrics.citeRadius, overflow: 'hidden' },
  card: { gap: metrics.quarter, padding: metrics.citeCardPadding, borderRadius: metrics.citeCardRadius, borderWidth: metrics.hair, backgroundColor: colors.surface },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: metrics.rowGap },
  cardIcon: { width: metrics.citeBadge, height: metrics.citeBadge, borderRadius: metrics.pillRadius, alignItems: 'center', justifyContent: 'center' },
  cardKind: { flex: 1, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  cardClose: { padding: metrics.tiny },
  cardTitle: { color: colors.text, fontSize: metrics.bodySize, fontWeight: metrics.titleWeight },
  cardDetail: { color: colors.muted, fontSize: metrics.captionSize, lineHeight: metrics.captionLine },
});
