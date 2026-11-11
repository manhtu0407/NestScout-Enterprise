import { loadConfig } from './config';
import { getSupabaseClient } from './supabase-client';

export type StorageSource = { uri: string; headers: Record<string, string> };

export class AuthSessionError extends Error {
  constructor() {
    super('Session changed or unavailable');
    this.name = 'AuthSessionError';
  }
}

async function sessionFor(userId: string, signal: AbortSignal | null | undefined) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  const session = data.session;
  if (signal?.aborted || error || !session || session.user.id !== userId) throw new AuthSessionError();
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

export type FunctionFetch = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<Response>;

export async function authenticatedFunctionRequest(userId: string, name: string, body: unknown, signal: AbortSignal, fetcher: FunctionFetch): Promise<Response> {
  const send = (accessToken: string, supabaseUrl: string, publishableKey: string) => fetcher(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    signal,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson',
    },
    body: JSON.stringify(body),
  });
  const { session, config } = await sessionFor(userId, signal);
  const first = await send(session.access_token, config.supabaseUrl, config.supabasePublishableKey);
  if (first.status !== 401) return first;
  await first.body?.cancel();
  const { data, error } = await getSupabaseClient().auth.refreshSession();
  if (signal.aborted || error || !data.session || data.session.user.id !== userId) throw new AuthSessionError();
  return send(data.session.access_token, config.supabaseUrl, config.supabasePublishableKey);
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
