import { loadConfig } from './config';
import { getSupabaseClient } from './supabase-client';

export async function authenticatedRequest(userId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  if (init.signal?.aborted || error || !session || session.user.id !== userId) throw new Error('Session changed or unavailable');
  const config = loadConfig();
  return fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}
