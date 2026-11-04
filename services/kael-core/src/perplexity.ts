import type { Fetcher } from './model.ts';

export const perplexitySearchEndpoint = 'https://api.perplexity.ai/search';

export type PerplexityConfig = { apiKey: string; maxResults: number; timeoutMs: number };

export type SearchResult = { title: string; url: string; snippet: string; date: string | null; lastUpdated: string | null };

export type SearchOutcome =
  | { status: 'ok'; results: SearchResult[] }
  | { status: 'failed'; reason: 'auth' | 'rate_limit' | 'server' | 'network' | 'invalid_response' };

const snippetLimit = 600;

function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 40) : null;
}

export async function searchWeb(config: PerplexityConfig, query: string, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<SearchOutcome> {
  let response: Response;
  try {
    response = await fetcher(perplexitySearchEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ query, max_results: config.maxResults, max_tokens_per_page: 512 }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]),
    });
  } catch {
    return { status: 'failed', reason: 'network' };
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) return { status: 'failed', reason: 'auth' };
    if (response.status === 429) return { status: 'failed', reason: 'rate_limit' };
    return { status: 'failed', reason: 'server' };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { status: 'failed', reason: 'invalid_response' };
  }
  const results = (payload as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return { status: 'failed', reason: 'invalid_response' };
  return {
    status: 'ok',
    results: results.slice(0, config.maxResults).flatMap((row: unknown) => {
      const item = (row ?? {}) as Record<string, unknown>;
      const url = text(item.url, 500);
      if (!/^https?:\/\//.test(url)) return [];
      return [{ title: text(item.title, 200), url, snippet: text(item.snippet, snippetLimit), date: optionalText(item.date), lastUpdated: optionalText(item.last_updated) }];
    }),
  };
}
