import { createAnthropicProvider } from './anthropic.ts';
import { configurationReport, readKaelConfig } from './config.ts';
import type { Environment, KaelConfig } from './config.ts';
import { createDeepSeekProvider } from './deepseek.ts';
import { encodeEvent, isTerminalEvent, kaelProtocolVersion } from './events.ts';
import type { KaelEventBody, KaelFailureCode } from './events.ts';
import type { Fetcher, ModelProvider } from './model.ts';
import type { Actor } from './policy.ts';
import { failureMessage, isRetryable, resolveApproval, runAgentTurn } from './runtime.ts';
import type { RunOutcome } from './runtime.ts';
import { createRest, createServerRpc, createSupabaseStore } from './store.ts';
import type { KaelStore, Rest, RunStart } from './store.ts';
import type { Capability, KaelMode } from './tools.ts';

export type GatewayDependencies = {
  env: Environment;
  fetcher?: Fetcher;
  now?: () => Date;
  log?: (event: Record<string, string | number | null>) => void;
  providers?: (config: KaelConfig) => ModelProvider[];
  store?: (rest: Rest, userId: string) => KaelStore;
};

type Action =
  | { type: 'message'; text: string }
  | { type: 'approve' | 'reject'; approval_id: string; fingerprint: string };

type TurnRequest = { request_id: string; conversation_id: string | null; mode: KaelMode; action: Action };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBodyChars = 16_384;
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

function failure(status: number, code: KaelFailureCode): Response {
  return json(status, { error: { code, message: failureMessage(code), retryable: isRetryable(code) } });
}

export function parseTurnRequest(raw: string, maxInputChars: number): TurnRequest | null {
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const action = record.action as Record<string, unknown> | undefined;
  if (typeof record.request_id !== 'string' || !uuidPattern.test(record.request_id)) return null;
  if (record.conversation_id !== null && (typeof record.conversation_id !== 'string' || !uuidPattern.test(record.conversation_id))) return null;
  if (record.mode !== 'client' && record.mode !== 'worker') return null;
  if (!action || typeof action !== 'object') return null;
  const mode: KaelMode = record.mode;
  const base = { request_id: record.request_id.toLowerCase(), conversation_id: record.conversation_id === null ? null : String(record.conversation_id).toLowerCase(), mode };
  if (action.type === 'message') {
    const text = typeof action.text === 'string' ? action.text.trim() : '';
    if (text.length === 0 || text.length > maxInputChars) return null;
    return { ...base, action: { type: 'message', text } };
  }
  if ((action.type === 'approve' || action.type === 'reject') && base.conversation_id !== null
    && typeof action.approval_id === 'string' && uuidPattern.test(action.approval_id)
    && typeof action.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(action.fingerprint)) {
    return { ...base, action: { type: action.type, approval_id: action.approval_id.toLowerCase(), fingerprint: action.fingerprint } };
  }
  return null;
}

async function verifyUser(config: KaelConfig, token: string, fetcher: Fetcher): Promise<string | null> {
  try {
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: { apikey: config.supabaseAnonKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const user = await response.json() as { id?: unknown; is_anonymous?: unknown };
    return typeof user.id === 'string' && uuidPattern.test(user.id) && user.is_anonymous !== true ? user.id : null;
  } catch {
    return null;
  }
}

export function configuredProviders(config: KaelConfig, fetcher: Fetcher): ModelProvider[] {
  return config.route.flatMap(id => {
    if (id === 'anthropic' && config.anthropic) return [createAnthropicProvider(config.anthropic, fetcher)];
    if (id === 'deepseek' && config.deepseek) return [createDeepSeekProvider(config.deepseek, fetcher)];
    return [];
  });
}

function userTextFor(action: Action): string {
  if (action.type === 'message') return action.text;
  return action.type === 'approve' ? 'Đồng ý thực hiện thao tác Kael đề xuất.' : 'Không thực hiện thao tác Kael đề xuất.';
}

function todayIn(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function createKaelHandler(dependencies: GatewayDependencies) {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const log = dependencies.log ?? (event => console.log(JSON.stringify(event)));
  const config = readKaelConfig(dependencies.env);

  return async function handle(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== 'POST') return json(405, { error: { code: 'invalid_request', message: 'Method not allowed.' } });
    if (!config) {
      log({ event: 'kael_misconfigured', ...configurationReport(dependencies.env) });
      return failure(503, 'provider_unavailable');
    }
    const token = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/.exec(request.headers.get('authorization') ?? '')?.[1];
    if (!token) return failure(401, 'unauthenticated');
    const raw = await request.text();
    if (raw.length > maxBodyChars) return failure(413, 'invalid_request');
    const parsed = parseTurnRequest(raw, config.limits.maxInputChars);
    if (!parsed) return failure(400, 'invalid_request');
    const turn: TurnRequest = parsed;
    const userId = await verifyUser(config, token, fetcher);
    if (!userId) return failure(401, 'unauthenticated');

    const rest = createRest(config, token, fetcher);
    const store = dependencies.store ? dependencies.store(rest, userId) : createSupabaseStore(rest, createServerRpc(config, fetcher), userId);
    const setup = AbortSignal.timeout(10_000);
    let capabilities: Set<Capability>;
    let started: RunStart;
    try {
      capabilities = await store.capabilities(setup);
      if (!capabilities.has('customer')) return failure(401, 'unauthenticated');
      started = await store.startRun(turn.request_id, turn.conversation_id, turn.mode, userTextFor(turn.action), setup);
    } catch {
      log({ event: 'kael_setup_failed' });
      return failure(503, 'internal');
    }
    if (started.status === 'rate_limited') return failure(429, 'rate_limited');
    if (started.status === 'busy') return failure(409, 'busy');
    if (started.status !== 'started' && started.status !== 'replay') return failure(400, 'invalid_request');
    const replay = started.status === 'replay' ? started : null;

    const runId = started.run_id;
    const conversationId = started.conversation_id;
    const actor: Actor = { userId, capabilities, mode: turn.mode };
    const controller = new AbortController();
    let seq = 0;
    let closed = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const encoder = new TextEncoder();
    const emit = (event: KaelEventBody) => {
      if (closed || !streamController) return;
      seq += 1;
      streamController.enqueue(encoder.encode(encodeEvent({ ...event, v: kaelProtocolVersion, run_id: runId, seq })));
      if (isTerminalEvent(event)) {
        closed = true;
        streamController.close();
      }
    };

    const body = new ReadableStream<Uint8Array>({
      start(controllerRef) {
        streamController = controllerRef;
        emit({ type: 'run_started', conversation_id: conversationId, request_id: turn.request_id, replayed: replay !== null });
        if (replay) {
          if (replay.run_status === 'completed' && replay.assistant_text !== null) emit({ type: 'run_completed', text: replay.assistant_text });
          else if (replay.run_status === 'running') emit({ type: 'run_failed', code: 'busy', message: failureMessage('busy'), retryable: true });
          else emit({ type: 'run_failed', code: 'incomplete_output', message: failureMessage('incomplete_output'), retryable: false });
          return;
        }
        void execute();
      },
      cancel() {
        closed = true;
        controller.abort();
      },
    });

    async function execute() {
      let result: RunOutcome;
      try {
        result = turn.action.type === 'message'
          ? await runAgentTurn({
            actor, config: config as KaelConfig, store, rest, providers: (dependencies.providers ?? (value => configuredProviders(value, fetcher)))(config as KaelConfig),
            fetcher, runId, conversationId, emit, signal: controller.signal, today: todayIn(now()),
          })
          : await resolveApproval({
            approvalId: turn.action.approval_id, fingerprint: turn.action.fingerprint, approve: turn.action.type === 'approve',
            actor, config: config as KaelConfig, store, rest, runId, emit, signal: controller.signal,
          });
      } catch {
        result = { status: 'failed', text: '', complete: false, provider: null, model: null, inputTokens: 0, outputTokens: 0, steps: 0, error: 'internal' };
      }
      const status = result.status === 'completed' ? 'completed' : controller.signal.aborted ? 'interrupted' : result.status;
      try {
        await store.finishRun({
          runId, status, text: result.text, complete: result.complete, provider: result.provider, model: result.model,
          inputTokens: result.inputTokens, outputTokens: result.outputTokens, steps: result.steps, error: result.error,
        });
      } catch {
        log({ event: 'kael_finish_failed', run_id: runId });
        if (result.status === 'completed') result = { ...result, status: 'failed', error: 'internal' };
      }
      log({
        event: 'kael_run', run_id: runId, action: turn.action.type, status, provider: result.provider, model: result.model,
        steps: result.steps, input_tokens: result.inputTokens, output_tokens: result.outputTokens, error: result.error,
      });
      if (result.status === 'completed') emit({ type: 'run_completed', text: result.text });
      else {
        const code = result.error ?? 'internal';
        emit({ type: 'run_failed', code, message: failureMessage(code), retryable: isRetryable(code) });
      }
    }

    return new Response(body, {
      status: 200,
      headers: { ...corsHeaders, 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-kael-run-id': runId },
    });
  };
}
