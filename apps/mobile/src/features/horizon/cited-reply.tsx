import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { citationKey, citationRefsIn, stripCitationMarkers } from './citation-markers';
import type { CitationResolver } from './citation-resolver';
import { CitedText, type Citation, type CitedSegment } from './citations';
import { KaelStreamingText } from './kael-streaming-text';
import { horizonLayout } from '@/theme/layout';

const metrics = horizonLayout.designKit;

type Props = {
  text: string;
  style: StyleProp<TextStyle>;
  streaming: boolean;
  incomplete?: boolean;
  resolve?: CitationResolver;
};

export function CitedReply({ text, style, streaming, incomplete, resolve }: Props) {
  const refs = useMemo(() => citationRefsIn(text), [text]);
  const [resolved, setResolved] = useState<ReadonlyMap<string, Citation>>(new Map());
  useEffect(() => {
    if (streaming || resolve === undefined || refs.length === 0) return undefined;
    const controller = new AbortController();
    resolve(refs, controller.signal).then(
      found => { if (!controller.signal.aborted) setResolved(found); },
      () => { if (!controller.signal.aborted) setResolved(new Map()); },
    );
    return () => controller.abort();
  }, [refs, streaming, resolve]);
  const visible = text.includes('kael:') ? stripCitationMarkers(text) : text;
  const sources = useMemo<readonly CitedSegment[]>(() => {
    if (streaming) return [];
    const found = refs.flatMap(ref => resolved.get(citationKey(ref)) ?? []);
    return found.flatMap((citation, index) => [{ text: index === 0 ? 'Nguồn ' : ' ' }, { cite: { ...citation, label: String(index + 1) } }]);
  }, [refs, resolved, streaming]);
  return <View style={styles.root}>
    <KaelStreamingText text={visible} style={style} streaming={streaming} incomplete={incomplete}/>
    {sources.length > 0 && <CitedText segments={sources}/>}
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: metrics.gap },
});
