import { authenticatedRequest } from '@/lib/authenticated-rest';

import type { KaelRestRequest } from './kael-runtime-repository';

export type KaelKnowledgeSource = Readonly<{ sourceId: string; revision: number; contentHash: string; kind: 'synthetic_case' | 'product_fact'; title: string; excerpt: string }>;

export type KaelKnowledgeLookup = Readonly<{ sourceId: string; revision: number; contentHash: string }>;

const sourceIdPattern = /^[a-z_]+\.[a-z0-9.-]+$/;
const hashPattern = /^[0-9a-f]{64}$/;
const maxLookups = 8;
const excerptLength = 600;

function parseSource(value: unknown): KaelKnowledgeSource | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.source_id !== 'string' || !sourceIdPattern.test(row.source_id) || !Number.isSafeInteger(row.revision) || typeof row.content_hash !== 'string' || !hashPattern.test(row.content_hash)
    || (row.source_kind !== 'synthetic_case' && row.source_kind !== 'product_fact') || typeof row.title !== 'string' || row.title === '') return null;
  const content = typeof row.content === 'string' ? row.content : '';
  return { sourceId: row.source_id, revision: row.revision as number, contentHash: row.content_hash, kind: row.source_kind, title: row.title.slice(0, 200), excerpt: content.slice(0, excerptLength) };
}

export async function fetchKaelKnowledgeSources(userId: string, lookups: readonly KaelKnowledgeLookup[], signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelKnowledgeSource[]> {
  const wanted = lookups.filter(item => sourceIdPattern.test(item.sourceId) && hashPattern.test(item.contentHash) && Number.isSafeInteger(item.revision)).slice(0, maxLookups);
  if (wanted.length === 0) return [];
  const ids = [...new Set(wanted.map(item => item.sourceId))].join(',');
  const query = `select=source_id,revision,content_hash,source_kind,title:source->>title,content:source->>content&source_id=in.(${ids})`;
  const response = await request(userId, `kael_knowledge_sources?${query}`, { method: 'GET', signal });
  if (!response.ok) throw new Error(`Kael knowledge lookup failed with ${response.status}`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('Kael knowledge lookup returned an unexpected body');
  return body.map(parseSource).filter((item): item is KaelKnowledgeSource => item !== null)
    .filter(item => wanted.some(lookup => lookup.sourceId === item.sourceId && lookup.revision === item.revision && lookup.contentHash === item.contentHash));
}
