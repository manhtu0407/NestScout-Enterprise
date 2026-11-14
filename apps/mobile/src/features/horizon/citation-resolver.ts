import { fetchKaelKnowledgeSources } from '@/features/shared';

import { citationKey, type CitationRef } from './citation-markers';
import type { Citation } from './citations';

export type CitationResolver = (refs: readonly CitationRef[], signal: AbortSignal) => Promise<ReadonlyMap<string, Citation>>;

export function createCitationResolver(userId: string, fetchSources: typeof fetchKaelKnowledgeSources = fetchKaelKnowledgeSources): CitationResolver {
  return async (refs, signal) => {
    const sources = await fetchSources(userId, refs, signal);
    return new Map(sources.map(source => [citationKey(source), { id: citationKey(source), kind: 'source', label: '', title: source.title, detail: source.excerpt } satisfies Citation]));
  };
}
