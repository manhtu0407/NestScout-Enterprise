import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkerGrant = 'none' | 'active' | 'revoked';

export type CapabilityResult =
  | { kind: 'resolved'; worker: WorkerGrant }
  | { kind: 'session_invalid' }
  | { kind: 'error' };

export type CapabilityRepository = {
  fetchCapabilities(): Promise<CapabilityResult>;
};

type PostgrestFailure = { code?: string; message?: string };

// Reads the caller's own row under the authenticated session; row level security
// is the authority, so a missing, unreadable or malformed row never means "active".
export function createSupabaseCapabilityRepository(client: SupabaseClient): CapabilityRepository {
  return {
    async fetchCapabilities() {
      try {
        const response = await client.from('worker_access_grants').select('status').maybeSingle();
        const failure = response.error as PostgrestFailure | null;
        if (failure) {
          const expired = response.status === 401 || (failure.code?.startsWith('PGRST30') ?? false);
          return expired ? { kind: 'session_invalid' } : { kind: 'error' };
        }
        const status = (response.data as { status?: unknown } | null)?.status;
        if (response.data === null) return { kind: 'resolved', worker: 'none' };
        if (status === 'active' || status === 'revoked') return { kind: 'resolved', worker: status };
        return { kind: 'error' };
      } catch {
        return { kind: 'error' };
      }
    },
  };
}
