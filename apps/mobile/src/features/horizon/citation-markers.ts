export type CitationRef = Readonly<{ sourceId: string; revision: number; contentHash: string }>;

const markerSource = '\\[?kael:([a-z_]+\\.[a-z0-9.-]+)@(\\d+)#([0-9a-f]{64})\\]?';
const trailingPartial = /\[?kael:[^\s\]]*$/;

export function citationKey(ref: CitationRef): string {
  return `${ref.sourceId}@${ref.revision}#${ref.contentHash}`;
}

function refOf(match: RegExpExecArray): CitationRef {
  return { sourceId: match[1]!, revision: Number(match[2]), contentHash: match[3]! };
}

export function citationRefsIn(text: string): readonly CitationRef[] {
  const seen = new Map<string, CitationRef>();
  for (const match of text.matchAll(new RegExp(markerSource, 'g'))) {
    const ref = refOf(match as RegExpExecArray);
    seen.set(citationKey(ref), ref);
  }
  return [...seen.values()];
}

export function stripCitationMarkers(text: string): string {
  return text.replace(new RegExp(`[ \\t]*${markerSource}`, 'g'), '').replace(trailingPartial, '').trimEnd();
}
