import { loadConfig } from './config';
import { getSupabaseClient } from './supabase-client';

export type StorageSource = { uri: string; headers: Record<string, string> };

async function sessionFor(userId: string, signal: AbortSignal | null | undefined) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  if (signal?.aborted || error || !session || session.user.id !== userId) throw new Error('Session changed or unavailable');
  return { session, config: loadConfig() };
}

export async function authenticatedRequest(userId: string, path: string, init: RequestInit = {}): Promise<Response> {
  const { session, config } = await sessionFor(userId, init.signal);
  return fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
}

export async function authenticatedStorageRequest(
  userId: string,
  path: string,
  init: Omit<RequestInit, 'headers'> & { contentType?: string; upsert?: boolean } = {},
): Promise<Response> {
  const { contentType, upsert, ...request } = init;
  const { session, config } = await sessionFor(userId, request.signal);
  return fetch(`${config.supabaseUrl}/storage/v1/object/${path}`, {
    ...request,
    headers: {
      apikey: config.supabasePublishableKey,
      Authorization: `Bearer ${session.access_token}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(upsert ? { 'x-upsert': 'true' } : {}),
    },
  });
}

export async function storageSource(userId: string, bucket: string, objectPath: string, version: string, signal: AbortSignal): Promise<StorageSource> {
  const { session, config } = await sessionFor(userId, signal);
  return {
    uri: `${config.supabaseUrl}/storage/v1/object/authenticated/${bucket}/${objectPath}?v=${encodeURIComponent(version)}`,
    headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` },
  };
}
