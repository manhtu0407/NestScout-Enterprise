import { authenticatedRequest } from '@/lib/authenticated-rest';

import { parseKaelConversationSnapshot, type KaelConversationSnapshot } from './kael-events';
import type { KaelMode, KaelRestRequest } from './kael-runtime-repository';

export type KaelSession = { id: string; title: string; preview: string; updatedAt: string; pinned: boolean; archived: boolean };

export type KaelSessionFailure = 'unavailable' | 'run_active' | 'effect_unresolved' | 'invalid' | 'failed';

export class KaelSessionError extends Error {
  readonly failure: KaelSessionFailure;

  constructor(failure: KaelSessionFailure) {
    super(`Kael session operation ${failure}`);
    this.name = 'KaelSessionError';
    this.failure = failure;
  }
}

export type KaelSessionQuery = { search?: string; archived?: boolean; before?: string | null; limit?: number };

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failureByMessage: Readonly<Record<string, KaelSessionFailure>> = {
  'conversation unavailable': 'unavailable',
  'run active': 'run_active',
  'effect unresolved': 'effect_unresolved',
  'invalid request': 'invalid',
};

async function failureFrom(response: Response): Promise<KaelSessionError> {
  try {
    const body: unknown = await response.json();
    const message = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).message : undefined;
    return new KaelSessionError(typeof message === 'string' && Object.hasOwn(failureByMessage, message) ? failureByMessage[message]! : 'failed');
  } catch {
    return new KaelSessionError('failed');
  }
}

async function call(userId: string, name: string, body: Record<string, unknown>, signal: AbortSignal, request: KaelRestRequest): Promise<unknown> {
  const response = await request(userId, `rpc/${name}`, { method: 'POST', body: JSON.stringify(body), signal });
  if (!response.ok) throw await failureFrom(response);
  return response.json();
}

function parseSession(value: unknown): KaelSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !idPattern.test(item.id) || typeof item.title !== 'string' || typeof item.preview !== 'string'
    || typeof item.updated_at !== 'string' || Number.isNaN(Date.parse(item.updated_at)) || typeof item.pinned !== 'boolean' || typeof item.archived !== 'boolean') return null;
  return { id: item.id, title: item.title, preview: item.preview, updatedAt: item.updated_at, pinned: item.pinned, archived: item.archived };
}

export async function listKaelSessions(userId: string, mode: KaelMode, query: KaelSessionQuery, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelSession[]> {
  const result = await call(userId, 'kael_list_conversations', {
    p_mode: mode,
    p_search: query.search?.trim() ? query.search.trim() : null,
    p_archived: query.archived === true,
    p_limit: query.limit ?? 30,
    p_before: query.before ?? null,
  }, signal, request);
  const sessions = Array.isArray(result) && result.length <= 100 ? result.map(parseSession) : null;
  if (!sessions || sessions.some(session => session === null)) throw new KaelSessionError('failed');
  return sessions as KaelSession[];
}

export async function openKaelConversation(userId: string, mode: KaelMode, conversationId: string, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelConversationSnapshot> {
  const snapshot = parseKaelConversationSnapshot(await call(userId, 'kael_open_conversation', { p_conversation_id: conversationId, p_mode: mode }, signal, request));
  if (!snapshot || snapshot.conversationId !== conversationId) throw new KaelSessionError('failed');
  return snapshot;
}

async function confirmed(userId: string, name: string, body: Record<string, unknown>, id: string, signal: AbortSignal, request: KaelRestRequest): Promise<Record<string, unknown>> {
  const result = await call(userId, name, body, signal, request);
  if (typeof result !== 'object' || result === null || (result as Record<string, unknown>).id !== id) throw new KaelSessionError('failed');
  return result as Record<string, unknown>;
}

export async function renameKaelSession(userId: string, id: string, title: string | null, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<string> {
  const result = await confirmed(userId, 'kael_rename_conversation', { p_conversation_id: id, p_title: title }, id, signal, request);
  if (typeof result.title !== 'string') throw new KaelSessionError('failed');
  return result.title;
}

export async function setKaelSessionPinned(userId: string, id: string, pinned: boolean, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<void> {
  const result = await confirmed(userId, 'kael_set_conversation_pinned', { p_conversation_id: id, p_pinned: pinned }, id, signal, request);
  if (result.pinned !== pinned) throw new KaelSessionError('failed');
}

export async function setKaelSessionArchived(userId: string, id: string, archived: boolean, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<void> {
  const result = await confirmed(userId, 'kael_set_conversation_archived', { p_conversation_id: id, p_archived: archived }, id, signal, request);
  if (result.archived !== archived) throw new KaelSessionError('failed');
}

export async function deleteKaelSession(userId: string, id: string, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<void> {
  const result = await confirmed(userId, 'kael_delete_conversation', { p_conversation_id: id }, id, signal, request);
  if (result.deleted !== true) throw new KaelSessionError('failed');
}
