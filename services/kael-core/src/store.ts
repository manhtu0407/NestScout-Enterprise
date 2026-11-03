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

export type KaelServerOperation = typeof kaelServerOperations[number];

export type ServerRpc = (operation: KaelServerOperation, body: Record<string, unknown>, signal?: AbortSignal) => Promise<Response>;

export function createServerRpc(config: KaelConfig, fetcher: Fetcher = fetch): ServerRpc {
  return (operation, body, signal) => {
    if (!(kaelServerOperations as readonly string[]).includes(operation)) throw new StoreError(String(operation), 403);
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

export type HistoryMessage = { role: 'user' | 'assistant'; content: string; status: 'complete' | 'incomplete' };

export type ConversationContext = { history: HistoryMessage[]; tasks: TaskRecord[] };

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
  ttlSeconds: number;
};

export type ApprovalRequestResult = { status: 'ok'; approval_id: string; expires_at: string; task: TaskRecord } | { status: 'invalid' | 'stale' };

export type ApprovalConsume =
  | { status: 'ok' | 'reconcile'; tool: string; args: Record<string, unknown>; task_id: string }
  | { status: 'consumed'; outcome: string; result: Record<string, unknown> | null; task_id: string }
  | { status: 'expired' | 'mismatch' | 'invalid' | 'stale' | 'rejected' | 'unavailable' };

export type KaelStore = {
  capabilities(signal: AbortSignal): Promise<Set<Capability>>;
  startRun(requestId: string, conversationId: string | null, mode: KaelMode, userText: string, signal: AbortSignal): Promise<RunStart>;
  finishRun(input: { runId: string; status: 'completed' | 'failed' | 'cancelled' | 'interrupted'; text: string; complete: boolean; provider: string | null; model: string | null; inputTokens: number; outputTokens: number; steps: number; error: string | null }): Promise<void>;
  loadContext(conversationId: string, mode: KaelMode, historyLimit: number, signal: AbortSignal): Promise<ConversationContext>;
  saveTask(input: SaveTaskInput): Promise<SaveTaskResult>;
  recordTool(input: ToolRecord): Promise<void>;
  requestApproval(input: ApprovalRequest): Promise<ApprovalRequestResult>;
  consumeApproval(runId: string, approvalId: string, fingerprint: string, allowedTools: readonly string[]): Promise<ApprovalConsume>;
  completeApproval(approvalId: string, outcome: 'succeeded' | 'failed' | 'uncertain', result: Record<string, unknown>): Promise<TaskRecord | null>;
  rejectApproval(approvalId: string): Promise<TaskRecord | null>;
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
      await internal<boolean>('kael_finish_run', {
        p_run_id: input.runId, p_status: input.status, p_text: input.text, p_complete: input.complete, p_provider: input.provider,
        p_model: input.model, p_input_tokens: input.inputTokens, p_output_tokens: input.outputTokens, p_steps: input.steps, p_error: input.error,
      });
    },
    async loadContext(conversationId, mode, historyLimit, signal) {
      const response = await rest(`kael_messages?select=role,content,status&conversation_id=eq.${encodeURIComponent(conversationId)}&order=seq.desc&limit=${historyLimit}`, { signal });
      if (!response.ok) {
        await response.body?.cancel();
        throw new StoreError('kael_messages', response.status);
      }
      const rows = await response.json() as HistoryMessage[];
      const tasks = await rpc<TaskRecord[]>(rest, 'kael_context_tasks', { p_conversation_id: conversationId, p_mode: mode }, signal);
      return { history: rows.reverse(), tasks };
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
        p_summary: input.summary, p_ttl_seconds: input.ttlSeconds,
      });
    },
    consumeApproval(runId, approvalId, fingerprintValue, allowedTools) {
      return internal<ApprovalConsume>('kael_consume_approval', { p_run_id: runId, p_approval_id: approvalId, p_fingerprint: fingerprintValue, p_allowed_tools: allowedTools });
    },
    completeApproval(approvalId, outcome, result) {
      return internal<TaskRecord | null>('kael_complete_approval', { p_approval_id: approvalId, p_outcome: outcome, p_result: result });
    },
    rejectApproval(approvalId) {
      return internal<TaskRecord | null>('kael_reject_approval', { p_approval_id: approvalId });
    },
  };
}
