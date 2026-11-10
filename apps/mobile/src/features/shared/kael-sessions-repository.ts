import { authenticatedRequest } from '@/lib/authenticated-rest';

import { parseKaelConversationSnapshot, type KaelConversationSnapshot } from './kael-events';
import type { KaelMode, KaelRestRequest } from './kael-runtime-repository';

export type KaelSessionSummary = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  busy: boolean;
  attention: boolean;
};

export type KaelSessionPage = { pinned: KaelSessionSummary[]; items: KaelSessionSummary[]; hasMore: boolean };

export type KaelSessionDetail = KaelConversationSnapshot & { title: string | null; pinned: boolean; archived: boolean };

export type KaelSessionListQuery = { mode: KaelMode; search: string; archived: boolean; before: string | null; limit?: number };

export type KaelSessionDeleteResult = 'deleted' | 'busy' | 'unresolved_effect' | 'not_found';

export class KaelSessionError extends Error {
  readonly reason: 'not_found' | 'invalid' | 'failed';

  constructor(reason: 'not_found' | 'invalid' | 'failed', message: string) {
    super(message);
    this.name = 'KaelSessionError';
    this.reason = reason;
  }
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
const isIso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function parseSummary(value: unknown): KaelSessionSummary | null {
  if (!isObject(value)) return null;
  const { id, title, preview, updated_at: updatedAt, pinned, archived, busy, attention } = value;
  if (!isId(id) || typeof title !== 'string' || title.length === 0 || title.length > 80 || !isIso(updatedAt)) return null;
  if (typeof pinned !== 'boolean' || typeof archived !== 'boolean' || typeof busy !== 'boolean' || typeof attention !== 'boolean') return null;
  return { id, title, preview: typeof preview === 'string' ? preview : '', updatedAt, pinned, archived, busy, attention };
}

function parseSummaries(value: unknown): KaelSessionSummary[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const parsed = value.map(parseSummary);
  return parsed.every(item => item !== null) ? (parsed as KaelSessionSummary[]) : null;
}

export function parseKaelSessionPage(value: unknown): KaelSessionPage | null {
  if (!isObject(value) || typeof value.has_more !== 'boolean') return null;
  const pinned = parseSummaries(value.pinned);
  const items = parseSummaries(value.items);
  return pinned && items ? { pinned, items, hasMore: value.has_more } : null;
}

export function parseKaelSessionDetail(value: unknown): KaelSessionDetail | null {
  const snapshot = parseKaelConversationSnapshot(value);
  if (!snapshot || !isObject(value)) return null;
  const { title, pinned, archived } = value;
  if ((title !== null && typeof title !== 'string') || typeof pinned !== 'boolean' || typeof archived !== 'boolean') return null;
  return { ...snapshot, title, pinned, archived };
}

async function failure(response: Response, action: string): Promise<KaelSessionError> {
  let code: unknown;
  try {
    code = ((await response.json()) as { code?: unknown }).code;
  } catch {
    code = undefined;
  }
  if (code === 'P0002' || response.status === 404) return new KaelSessionError('not_found', `${action}: session not found`);
  if (code === '22023' || response.status === 400) return new KaelSessionError('invalid', `${action}: request rejected`);
  return new KaelSessionError('failed', `${action} failed with HTTP ${response.status}`);
}

async function call(userId: string, rpc: string, body: Json, signal: AbortSignal, request: KaelRestRequest): Promise<unknown> {
  const response = await request(userId, `rpc/${rpc}`, { method: 'POST', body: JSON.stringify(body), signal });
  if (!response.ok) throw await failure(response, rpc);
  return response.json();
}

export async function listKaelSessions(userId: string, query: KaelSessionListQuery, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelSessionPage> {
  const search = query.search.trim();
  const page = parseKaelSessionPage(await call(userId, 'kael_list_sessions', {
    p_mode: query.mode,
    p_search: search === '' ? null : search,
    p_archived: query.archived,
    p_limit: query.limit ?? 30,
    p_before: query.before,
  }, signal, request));
  if (!page) throw new KaelSessionError('failed', 'Kael session list is outside the contract');
  return page;
}

export async function openKaelSession(userId: string, mode: KaelMode, sessionId: string, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelSessionDetail> {
  const detail = parseKaelSessionDetail(await call(userId, 'kael_open_session', { p_mode: mode, p_session_id: sessionId }, signal, request));
  if (!detail) throw new KaelSessionError('failed', 'Kael session is outside the contract');
  return detail;
}

export async function renameKaelSession(userId: string, sessionId: string, title: string, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<string> {
  const result = await call(userId, 'kael_rename_session', { p_session_id: sessionId, p_title: title }, signal, request);
  if (typeof result !== 'string') throw new KaelSessionError('failed', 'Kael rename is outside the contract');
  return result;
}

export async function pinKaelSession(userId: string, sessionId: string, pinned: boolean, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<void> {
  await call(userId, 'kael_pin_session', { p_session_id: sessionId, p_pinned: pinned }, signal, request);
}

export async function archiveKaelSession(userId: string, sessionId: string, archived: boolean, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<void> {
  await call(userId, 'kael_archive_session', { p_session_id: sessionId, p_archived: archived }, signal, request);
}

export async function deleteKaelSession(userId: string, sessionId: string, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelSessionDeleteResult> {
  const result = await call(userId, 'kael_delete_session', { p_session_id: sessionId }, signal, request);
  const status = isObject(result) ? result.status : null;
  if (status === 'deleted' || status === 'busy' || status === 'unresolved_effect' || status === 'not_found') return status;
  throw new KaelSessionError('failed', 'Kael delete is outside the contract');
}
