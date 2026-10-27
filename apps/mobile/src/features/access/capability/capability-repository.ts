import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkerGrant = 'none' | 'active' | 'revoked';

// Why a lookup produced no usable answer. Every reason denies Worker.
export type CapabilityFailure = 'denied' | 'schema' | 'malformed' | 'unavailable';

export type CapabilityResult =
  | { kind: 'resolved'; worker: WorkerGrant }
  // The backend rejected the access token itself; identity must be re-verified.
  | { kind: 'unauthenticated' }
  | { kind: 'error'; reason: CapabilityFailure };

export type CapabilityRequest = { userId: string; signal: AbortSignal };

export type CapabilityRepository = {
  fetchCapabilities(request: CapabilityRequest): Promise<CapabilityResult>;
};

type PostgrestFailure = { code?: string; message?: string };

// PostgREST error semantics (https://docs.postgrest.org/en/stable/references/errors.html):
// PGRST301/PGRST303 are JWT verification or claims failures and PGRST302 is a request
// without credentials, all HTTP 401. PGRST300 is a server configuration fault and is
// NOT a session problem. Insufficient privilege (42501) is 401 for the anon role and
// 403 for an authenticated role. A missing table surfaces as 42P01 or PGRST205.
const tokenRejectedCodes = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

function classifyFailure(status: number, failure: PostgrestFailure): CapabilityResult {
  const code = failure.code ?? '';
  if (tokenRejectedCodes.has(code) || (status === 401 && (code === '' || code === '42501'))) return { kind: 'unauthenticated' };
  if (code === '42501' || status === 403) return { kind: 'error', reason: 'denied' };
  if (code === '42P01' || code === 'PGRST205') return { kind: 'error', reason: 'schema' };
  if (code === 'PGRST116') return { kind: 'error', reason: 'malformed' };
  return { kind: 'error', reason: 'unavailable' };
}

// Reads the caller's own row under the authenticated session; row level security
// is the authority, so a missing, unreadable, foreign or malformed row never means
// "active". The expected user id is checked against the row, not only trusted to RLS.
export function createSupabaseCapabilityRepository(client: SupabaseClient): CapabilityRepository {
  return {
    async fetchCapabilities({ userId, signal }) {
      try {
        const response = await client.from('worker_access_grants').select('user_id, status').abortSignal(signal).maybeSingle();
        if (response.error) return classifyFailure(response.status, response.error as PostgrestFailure);
        if (response.data === null) return { kind: 'resolved', worker: 'none' };
        const row = response.data as { user_id?: unknown; status?: unknown };
        if (row.user_id !== userId) return { kind: 'error', reason: 'malformed' };
        if (row.status === 'active' || row.status === 'revoked') return { kind: 'resolved', worker: row.status };
        return { kind: 'error', reason: 'malformed' };
      } catch {
        return { kind: 'error', reason: 'unavailable' };
      }
    },
  };
}
