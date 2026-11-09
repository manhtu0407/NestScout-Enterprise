import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { horizonLayout } from '@/theme/layout';
import { horizonColors } from '@/theme/palette';

const metrics = horizonLayout.designKit;
const colors = horizonColors.designKit;

export type SearchSource = Readonly<{ title: string; domain: string }>;

export function siteInitial(domain: string): string {
  return domain.replace(/^www\./, '').charAt(0).toUpperCase();
}

export function splitSources(sources: readonly SearchSource[]): Readonly<{ shown: readonly SearchSource[]; hidden: number }> {
  return { shown: sources.slice(0, metrics.sourceMax), hidden: Math.max(0, sources.length - metrics.sourceMax) };
}

type Props = { sources: readonly SearchSource[] };

export function SourceStack({ sources }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { shown, hidden } = splitSources(sources);
  const open = openIndex === null ? null : shown[openIndex] ?? null;
  return <View style={styles.root}>
    <View accessibilityLabel={`${sources.length} nguồn`} style={styles.stack}>
      {shown.map((source, index) => <Pressable
        key={source.domain + index}
        accessibilityRole="button"
        accessibilityLabel={`${source.title}, ${source.domain}`}
        onPress={() => setOpenIndex(current => current === index ? null : index)}
        style={[styles.logo, { backgroundColor: colors.sourceTints[index % colors.sourceTints.length], marginLeft: index === 0 ? 0 : -metrics.sourceOverlap, zIndex: openIndex === index ? shown.length : shown.length - index }]}
      >
        <Text style={styles.initial}>{siteInitial(source.domain)}</Text>
      </Pressable>)}
      {hidden > 0 && <View style={[styles.logo, styles.more]}><Text style={styles.initial}>+{hidden}</Text></View>}
    </View>
    {open !== null && <View accessibilityLiveRegion="polite" style={styles.popover}>
      <Text numberOfLines={2} style={styles.popTitle}>{open.title}</Text>
      <Text style={styles.popDomain}>{open.domain}</Text>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.rowGap },
  stack: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: metrics.sourceLogo, height: metrics.sourceLogo, borderRadius: metrics.pillRadius, borderWidth: metrics.sourceRing, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  more: { marginLeft: -metrics.sourceOverlap, backgroundColor: colors.neutralBg },
  initial: { color: colors.text, fontSize: metrics.sourceFont, fontWeight: metrics.titleWeight },
  popover: { alignSelf: 'flex-start', padding: metrics.rowGap, borderRadius: metrics.smallRadius, backgroundColor: colors.kaelBubble, gap: metrics.tiny },
  popTitle: { color: colors.text, fontSize: metrics.captionSize, fontWeight: metrics.titleWeight },
  popDomain: { color: colors.muted, fontSize: metrics.timeSize },
});
