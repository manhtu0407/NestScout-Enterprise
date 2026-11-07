import { AuthSessionError, authenticatedFunctionRequest, authenticatedRequest, type FunctionFetch } from '@/lib/authenticated-rest';
import { ConfigError } from '@/lib/config';

import { createKaelSequence, kaelFailureCodes, parseKaelConversationSnapshot, parseKaelEvent, type KaelConversationSnapshot, type KaelEvent, type KaelFailureCode } from './kael-events';

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

function refused(code: KaelFailureCode, message: string, retryable: boolean): KaelTurnOutcome {
  return { kind: 'refused', code, message, retryable };
}

function requestFailure(error: unknown, signal: AbortSignal): KaelTurnOutcome {
  if (signal.aborted) return { kind: 'cancelled' };
  if (error instanceof ConfigError) {
    return refused('provider_unavailable', `Cấu hình kết nối Kael trên bản TestFlight chưa hợp lệ: ${error.message}`, false);
  }
  if (error instanceof AuthSessionError) {
    return refused('unauthenticated', 'Phiên Supabase Auth không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.', false);
  }
  return { kind: 'interrupted' };
}

const streamingFetch: FunctionFetch = async (url, init) => {
  const { fetch } = await import('expo/fetch');
  return fetch(url, init);
};

async function refusalFrom(response: Response): Promise<KaelTurnOutcome> {
  try {
    const payload = (await response.json()) as { error?: { code?: unknown; message?: unknown; retryable?: unknown } };
    const code = payload.error?.code;
    if (typeof code === 'string' && (kaelFailureCodes as readonly string[]).includes(code) && typeof payload.error?.message === 'string') {
      return refused(code as KaelFailureCode, payload.error.message, payload.error.retryable === true);
    }
  } catch { return refusalForStatus(response.status); }
  return refusalForStatus(response.status);
}

function refusalForStatus(status: number): KaelTurnOutcome {
  if (status === 401) return refused('unauthenticated', 'Phiên Supabase Auth không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.', false);
  if (status === 403) return refused('invalid_request', 'Tài khoản này chưa được cấp quyền dùng Kael ở chế độ hiện tại.', false);
  if (status === 429) return refused('rate_limited', 'Kael đang nhận quá nhiều yêu cầu từ tài khoản này. Vui lòng thử lại sau ít phút.', true);
  if ([502, 503, 504].includes(status)) return refused('provider_unavailable', `Kael Backend hoặc AI Provider hiện không sẵn sàng (HTTP ${status}). Vui lòng thử lại sau.`, true);
  return refused('provider_error', `Kael không nhận được phản hồi hợp lệ từ Backend (HTTP ${status}). Vui lòng thử lại.`, true);
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
  } catch (error) {
    return requestFailure(error, signal);
  }
  if (!response.ok) return refusalFrom(response);
  if (!response.body) return { kind: 'interrupted' };

  return readKaelStream(response.body.getReader(), onEvent, signal);
}

export type KaelStreamReader = { read: () => Promise<{ value?: Uint8Array; done: boolean }>; cancel: () => Promise<void> };

export async function readKaelStream(reader: KaelStreamReader, onEvent: (event: KaelEvent) => void, signal: AbortSignal): Promise<KaelTurnOutcome> {
  const decoder = new TextDecoder();
  let buffer = '';
  const sequence = createKaelSequence();
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
        const verdict = event ? sequence(event) : 'broken';
        if (!event || verdict === 'broken') {
          await reader.cancel();
          return { kind: 'interrupted' };
        }
        if (verdict === 'duplicate') continue;
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
