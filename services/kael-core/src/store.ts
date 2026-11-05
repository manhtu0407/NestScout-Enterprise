import { selectHistory } from './context.ts';
import type { KaelConfig } from './config.ts';
import type { KaelTaskStatus } from './events.ts';
import type { Fetcher } from './model.ts';
import type { TaskArtifact, TaskRecord } from './tasks.ts';
import type { Capability, KaelMode } from './tools.ts';

export class StoreError extends Error {
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`Kael persistence operation ${operation} failed with HTTP ${status}.`);
    this.name = 'StoreError';
    this.status = status;
  }
}

export type Rest = (path: string, init?: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }) => Promise<Response>;

export function createRest(config: KaelConfig, accessToken: string, fetcher: Fetcher = fetch): Rest {
  return (path, init = {}) => fetcher(`${config.supabaseUrl}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: config.supabaseAnonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
}

export const kaelServerOperations = [
  'kael_start_run', 'kael_finish_run', 'kael_save_task', 'kael_record_tool',
  'kael_request_approval', 'kael_consume_approval', 'kael_complete_approval', 'kael_reject_approval',
] as const;

export type KaelServerOperation = typeof kaelServerOperations[number] | 'kael_runtime_ready';

export type ServerRpc = (operation: KaelServerOperation, body: Record<string, unknown>, signal?: AbortSignal) => Promise<Response>;

export function createServerRpc(config: KaelConfig, fetcher: Fetcher = fetch): ServerRpc {
  return (operation, body, signal) => {
    if (operation !== 'kael_runtime_ready' && !(kaelServerOperations as readonly string[]).includes(operation)) throw new StoreError(String(operation), 403);
    return fetcher(`${config.supabaseUrl}/rest/v1/rpc/${operation}`, {
      method: 'POST',
      headers: { apikey: config.supabaseServiceKey, authorization: `Bearer ${config.supabaseServiceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  };
}

export type RunStart =
  | { status: 'started'; run_id: string; conversation_id: string }
  | { status: 'replay'; run_id: string; conversation_id: string; run_status: string; assistant_text: string | null }
  | { status: 'rate_limited' | 'busy' | 'invalid' };

export type HistoryMessage = { seq?: number; role: 'user' | 'assistant'; content: string; status: 'complete' | 'incomplete' };

export type PersonalContext = { summary: { version: number; items: unknown[] } | null; preferences: { preference: string; value: string; updated_at: string; source: 'settings' | 'explicit_chat' }[]; memoryChange?: 'saved' | 'not_saved' };

export type ConversationContext = { history: HistoryMessage[]; tasks: TaskRecord[] };

function memoryCorrection(text: string): { preference: string; value: string; previous?: string } | null {
  const cleaned = text.trim().toLocaleLowerCase('vi').replace(/[.!]$/, '');
  const choices: Record<string, { preference: string; value: string }> = {
    'tiếng việt': { preference: 'language', value: 'vi' }, 'tiếng anh': { preference: 'language', value: 'en' },
    'ngắn gọn': { preference: 'detail', value: 'brief' }, 'chi tiết': { preference: 'detail', value: 'detailed' },
    'đoạn văn': { preference: 'format', value: 'paragraphs' }, 'từng bước': { preference: 'format', value: 'steps' },
  };
  const lookup = (key: string | undefined) => key && Object.hasOwn(choices, key) ? choices[key] : undefined;
  const save = /^ghi nhớ: (.+)$/.exec(cleaned);
  if (save?.[1]) return lookup(save[1]) ?? null;
  const correction = /^không phải (.+), là (.+)$/.exec(cleaned);
  const previous = lookup(correction?.[1]);
  const next = lookup(correction?.[2]);
  return previous && next && previous.preference === next.preference ? { ...next, previous: previous.value } : null;
}

function relevantPreference(preference: string, query: string): boolean {
  return preference !== 'format' || /\b(plan|compare|how|steps|instructions|recipe)\b|cách|hướng dẫn|so sánh|kế hoạch|các bước/i.test(query);
}

export type SaveTaskInput = {
  taskId: string | null;
  conversationId: string;
  runId: string;
  expectedVersion: number | null;
  title: string;
  kind: string;
  status: KaelTaskStatus;
  summary: string;
  artifact: TaskArtifact;
  event: string;
};

export type SaveTaskResult = { status: 'ok'; task: TaskRecord } | { status: 'conflict' | 'invalid_transition' | 'not_found' | 'limit' };

export type ToolRecord = {
  runId: string;
  callId: string;
  taskId: string | null;
  tool: string;
  sideEffect: string;
  outcome: 'succeeded' | 'failed' | 'denied' | 'approval_required' | 'unavailable' | 'uncertain';
  fingerprint: string;
  error: string | null;
};

export type ApprovalRequest = {
  runId: string;
  taskId: string;
  expectedVersion: number;
  tool: string;
  args: Record<string, unknown>;
  fingerprint: string;
  summary: string;
  details: Record<string, string>;
  ttlSeconds: number;
};

export type ApprovalRequestResult = { status: 'ok'; approval_id: string; expires_at: string; task: TaskRecord } | { status: 'invalid' | 'stale' | 'unresolved' };

export type ApprovalIntent = 'approve' | 'reconcile';

export type ApprovalConsume =
  | { status: 'ok' | 'reconcile'; tool: string; args: Record<string, unknown>; task_id: string; summary: string; details: Record<string, string> }
  | { status: 'consumed'; outcome: string; result: Record<string, unknown> | null; task_id: string }
  | { status: 'expired' | 'mismatch' | 'invalid' | 'stale' | 'rejected' | 'unavailable' | 'unconfirmed' | 'unresolved' | 'busy' };

export type ApprovalCompletion =
  | { status: 'ok' | 'final' | 'conflict'; outcome: 'succeeded' | 'failed' | 'uncertain'; result: Record<string, unknown> | null; task: TaskRecord }
  | { status: 'invalid' };

export type ApprovalRejection =
  | { status: 'ok'; task: TaskRecord }
  | { status: 'invalid' | 'mismatch' | 'rejected' | 'consumed' | 'expired' | 'stale' };

export type KaelStore = {
  capabilities(signal: AbortSignal): Promise<Set<Capability>>;
  startRun(requestId: string, conversationId: string | null, mode: KaelMode, userText: string, signal: AbortSignal): Promise<RunStart>;
  finishRun(input: { runId: string; status: 'completed' | 'failed' | 'cancelled' | 'interrupted'; text: string; complete: boolean; provider: string | null; model: string | null; inputTokens: number; outputTokens: number; steps: number; error: string | null }): Promise<void>;
  loadContext(conversationId: string, mode: KaelMode, historyLimit: number, signal: AbortSignal): Promise<ConversationContext>;
  loadPersonalContext?(conversationId: string, mode: KaelMode, history: readonly HistoryMessage[], maxHistoryChars: number, signal: AbortSignal, onFailure: (part: string) => void): Promise<PersonalContext>;
  saveTask(input: SaveTaskInput): Promise<SaveTaskResult>;
  recordTool(input: ToolRecord): Promise<void>;
  requestApproval(input: ApprovalRequest): Promise<ApprovalRequestResult>;
  consumeApproval(runId: string, approvalId: string, fingerprint: string, allowedTools: readonly string[], intent: ApprovalIntent): Promise<ApprovalConsume>;
  completeApproval(runId: string, approvalId: string, outcome: 'succeeded' | 'failed' | 'uncertain', result: Record<string, unknown>): Promise<ApprovalCompletion>;
  rejectApproval(runId: string, approvalId: string, fingerprint: string): Promise<ApprovalRejection>;
};

async function parsed<T>(name: string, response: Response): Promise<T> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new StoreError(name, response.status);
  }
  return await response.json() as T;
}

async function rpc<T>(rest: Rest, name: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return await parsed<T>(name, await rest(`rpc/${name}`, { method: 'POST', body, signal }));
}

export function createSupabaseStore(rest: Rest, server: ServerRpc, actorId: string): KaelStore {
  const internal = async <T>(operation: KaelServerOperation, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> =>
    await parsed<T>(operation, await server(operation, { p_actor: actorId, ...body }, signal));
  return {
    async capabilities(signal) {
      const result = await rpc<{ customer?: boolean; worker?: boolean }>(rest, 'kael_actor_capabilities', {}, signal);
      const capabilities = new Set<Capability>();
      if (result.customer === true) capabilities.add('customer');
      if (result.worker === true) capabilities.add('worker');
      return capabilities;
    },
    startRun(requestId, conversationId, mode, userText, signal) {
      return internal<RunStart>('kael_start_run', { p_request_id: requestId, p_conversation_id: conversationId, p_mode: mode, p_user_text: userText }, signal);
    },
    async finishRun(input) {
      const finished = await internal<boolean>('kael_finish_run', {
        p_run_id: input.runId, p_status: input.status, p_text: input.text, p_complete: input.complete, p_provider: input.provider,
        p_model: input.model, p_input_tokens: input.inputTokens, p_output_tokens: input.outputTokens, p_steps: input.steps, p_error: input.error,
      });
      if (!finished) throw new StoreError('kael_finish_run', 409);
    },
    async loadContext(conversationId, mode, historyLimit, signal) {
      const response = await rest(`kael_messages?select=seq,role,content,status&conversation_id=eq.${encodeURIComponent(conversationId)}&order=seq.desc&limit=${historyLimit}`, { signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new StoreError('kael_messages', response.status);
      }
      const rows = await response.json() as HistoryMessage[];
      const tasks = await rpc<TaskRecord[]>(rest, 'kael_context_tasks', { p_conversation_id: conversationId, p_mode: mode }, signal);
      return { history: rows.reverse(), tasks };
    },
    async loadPersonalContext(conversationId, mode, history, maxHistoryChars, signal, onFailure) {
      const selected = selectHistory(history, maxHistoryChars);
      const before = selected[0]?.seq ?? 1;
      const query = history.at(-1)?.role === 'user' ? history.at(-1)?.content ?? '' : '';
      const fallback = <T>(part: string, value: T) => () => { onFailure(part); return value; };
      const correction = memoryCorrection(query);
      let memoryChange: PersonalContext['memoryChange'] = correction ? 'not_saved' : undefined;
      const read = async () => parsed<PersonalContext['preferences']>('kael_memory_preferences', await rest(
        `kael_memory_preferences?select=preference,value,updated_at,source&mode=eq.${mode}&order=preference`, { signal }));
      const [summary, preferences] = await Promise.all([
        before > 1 ? rpc<PersonalContext['summary']>(rest, 'kael_context_summary', {
          p_conversation_id: conversationId, p_mode: mode, p_before_seq: before,
        }, signal).catch(fallback('summary', null)) : null,
        (async () => {
          if (correction) {
            const saved = await rpc<boolean>(rest, 'kael_manage_memory', {
              p_mode: mode, p_action: correction.previous ? 'correct' : 'remember', p_preference: correction.preference,
              p_value: correction.value, p_previous: correction.previous,
            }, signal);
            if (saved) memoryChange = 'saved';
          }
          return read();
        })().catch(fallback('preferences', [])),
      ]);
      return { summary: summary?.version === 1 && Array.isArray(summary.items) && summary.items.length ? summary : null, preferences: preferences.filter(row => relevantPreference(row.preference, query)), memoryChange };
    },
    saveTask(input) {
      return internal<SaveTaskResult>('kael_save_task', {
        p_task_id: input.taskId, p_conversation_id: input.conversationId, p_run_id: input.runId, p_expected_version: input.expectedVersion,
        p_title: input.title, p_kind: input.kind, p_status: input.status, p_summary: input.summary, p_artifact: input.artifact, p_event: input.event,
      });
    },
    async recordTool(input) {
      await internal<boolean>('kael_record_tool', {
        p_run_id: input.runId, p_call_id: input.callId, p_task_id: input.taskId, p_tool: input.tool, p_side_effect: input.sideEffect,
        p_outcome: input.outcome, p_fingerprint: input.fingerprint, p_error: input.error,
      });
    },
    requestApproval(input) {
      return internal<ApprovalRequestResult>('kael_request_approval', {
        p_run_id: input.runId, p_task_id: input.taskId, p_expected_version: input.expectedVersion, p_tool: input.tool, p_args: input.args, p_fingerprint: input.fingerprint,
        p_summary: input.summary, p_details: input.details, p_ttl_seconds: input.ttlSeconds,
      });
    },
    consumeApproval(runId, approvalId, fingerprintValue, allowedTools, intent) {
      return internal<ApprovalConsume>('kael_consume_approval', {
        p_run_id: runId, p_approval_id: approvalId, p_fingerprint: fingerprintValue, p_allowed_tools: allowedTools, p_intent: intent,
      });
    },
    completeApproval(runId, approvalId, outcome, result) {
      return internal<ApprovalCompletion>('kael_complete_approval', { p_run_id: runId, p_approval_id: approvalId, p_outcome: outcome, p_result: result });
    },
    rejectApproval(runId, approvalId, fingerprintValue) {
      return internal<ApprovalRejection>('kael_reject_approval', { p_run_id: runId, p_approval_id: approvalId, p_fingerprint: fingerprintValue });
    },
  };
}
