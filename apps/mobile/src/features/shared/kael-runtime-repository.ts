import { authenticatedFunctionRequest, authenticatedRequest, type FunctionFetch } from '@/lib/authenticated-rest';

import { kaelFailureCodes, parseKaelConversationSnapshot, parseKaelEvent, type KaelConversationSnapshot, type KaelEvent, type KaelFailureCode } from './kael-events';

export type KaelMode = 'client' | 'worker';

export type KaelTurnAction =
  | { type: 'message'; text: string }
  | { type: 'approve' | 'reject' | 'reconcile'; approval_id: string; fingerprint: string };

export type KaelTurnRequest = { requestId: string; conversationId: string | null; mode: KaelMode; action: KaelTurnAction };

export type KaelTurnOutcome =
  | { kind: 'terminal'; event: Extract<KaelEvent, { type: 'run_completed' | 'run_failed' }> }
  | { kind: 'refused'; code: KaelFailureCode; message: string; retryable: boolean }
  | { kind: 'interrupted' }
  | { kind: 'cancelled' };

const unavailableMessage = 'Không kết nối được với Kael. Tin nhắn có thể chưa được gửi.';

const streamingFetch: FunctionFetch = async (url, init) => {
  const { fetch } = await import('expo/fetch');
  return fetch(url, init);
};

async function refusalFrom(response: Response): Promise<KaelTurnOutcome> {
  try {
    const payload = (await response.json()) as { error?: { code?: unknown; message?: unknown; retryable?: unknown } };
    const code = payload.error?.code;
    if (typeof code === 'string' && (kaelFailureCodes as readonly string[]).includes(code) && typeof payload.error?.message === 'string') {
      return { kind: 'refused', code: code as KaelFailureCode, message: payload.error.message, retryable: payload.error.retryable === true };
    }
  } catch {
    return { kind: 'refused', code: 'internal', message: unavailableMessage, retryable: true };
  }
  return { kind: 'refused', code: 'internal', message: unavailableMessage, retryable: true };
}

export async function streamKaelTurn(
  userId: string,
  request: KaelTurnRequest,
  onEvent: (event: KaelEvent) => void,
  signal: AbortSignal,
  fetcher: FunctionFetch = streamingFetch,
): Promise<KaelTurnOutcome> {
  let response: Response;
  try {
    response = await authenticatedFunctionRequest(userId, 'kael', {
      request_id: request.requestId,
      conversation_id: request.conversationId,
      mode: request.mode,
      action: request.action,
    }, signal, fetcher);
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'interrupted' };
  }
  if (!response.ok || !response.body) return refusalFrom(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let runId: string | null = null;
  let lastSeq = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        const event = parseKaelEvent(line);
        if (!event || (runId !== null && event.run_id !== runId)) {
          await reader.cancel();
          return { kind: 'interrupted' };
        }
        runId = event.run_id;
        if (event.seq <= lastSeq) continue;
        lastSeq = event.seq;
        onEvent(event);
        if (event.type === 'run_completed' || event.type === 'run_failed') {
          await reader.cancel();
          return { kind: 'terminal', event };
        }
      }
    }
  } catch {
    return signal.aborted ? { kind: 'cancelled' } : { kind: 'interrupted' };
  }
  return { kind: 'interrupted' };
}

export type KaelRestRequest = typeof authenticatedRequest;

export async function loadKaelConversation(userId: string, mode: KaelMode, signal: AbortSignal, request: KaelRestRequest = authenticatedRequest): Promise<KaelConversationSnapshot> {
  const response = await request(userId, 'rpc/kael_conversation_state', { method: 'POST', body: JSON.stringify({ p_mode: mode }), signal });
  if (!response.ok) throw new Error(`Kael conversation state failed with HTTP ${response.status}`);
  const snapshot = parseKaelConversationSnapshot(await response.json());
  if (!snapshot) throw new Error('Kael conversation state is outside the contract');
  return snapshot;
}
