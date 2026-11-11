export type ProviderId = 'anthropic' | 'deepseek';

export type JsonSchema = {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
};

export type ToolDefinition = { name: string; description: string; inputSchema: JsonSchema };

export type ToolCall = { id: string; name: string; input: unknown };

export type ToolResult = { callId: string; content: string; isError: boolean };

export type ProviderState = { provider: ProviderId; model: string; data: unknown };

export type TranscriptItem =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[]; providerState: ProviderState | null }
  | { role: 'tool'; results: ToolResult[] };

export type ModelRequest = {
  system: string;
  transcript: TranscriptItem[];
  tools: ToolDefinition[];
  maxOutputTokens: number;
  signal: AbortSignal;
};

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'content_filter' | 'other';

export type ModelUsage = { inputTokens: number; outputTokens: number; cachedInputTokens: number };

export type ModelTurn = {
  provider: ProviderId;
  model: string;
  requestedModel: string;
  httpStatus?: number;
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: ModelUsage;
  providerState: ProviderState | null;
};

export type ProviderErrorKind =
  | 'unavailable' | 'auth' | 'billing' | 'rate_limit' | 'overloaded' | 'bad_request' | 'server' | 'network' | 'timeout' | 'incomplete' | 'cancelled' | 'budget';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderId;
  readonly outputStarted: boolean;
  readonly httpStatus: number | undefined;

  constructor(provider: ProviderId, kind: ProviderErrorKind, message: string, outputStarted = false, httpStatus?: number) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
    this.outputStarted = outputStarted;
    this.httpStatus = httpStatus;
  }
}

export type ModelProvider = {
  readonly id: ProviderId;
  readonly model: string;
  complete(request: ModelRequest, onText: (delta: string) => void): Promise<ModelTurn>;
};

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export function classifyStatus(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'billing';
  if (status === 404 || status === 410) return 'unavailable';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status === 529 || status === 503) return 'overloaded';
  if (status >= 500) return 'server';
  return 'bad_request';
}

export function classifyThrown(provider: ProviderId, error: unknown, signal: AbortSignal, outputStarted: boolean): ProviderError {
  if (signal.aborted) return new ProviderError(provider, 'cancelled', 'The run was cancelled.', outputStarted);
  if (error instanceof ProviderError) return outputStarted && !error.outputStarted
    ? new ProviderError(provider, error.kind, error.message, true, error.httpStatus) : error;
  if (error instanceof DOMException && error.name === 'TimeoutError') return new ProviderError(provider, 'timeout', 'The provider timed out.', outputStarted);
  return new ProviderError(provider, outputStarted ? 'incomplete' : 'network', 'The provider connection failed.', outputStarted);
}

export function canFallBack(error: ProviderError): boolean {
  return !error.outputStarted && ['rate_limit', 'overloaded', 'server', 'network', 'timeout', 'auth', 'billing', 'unavailable'].includes(error.kind);
}

export const retryableKinds: readonly ProviderErrorKind[] = ['overloaded', 'server', 'network'];
export const providerRetryDelayMs = 250;

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal.removeEventListener('abort', done); resolve(); }
    signal.addEventListener('abort', done, { once: true });
  });
}

export async function completeWithFallback(
  providers: readonly ModelProvider[],
  request: ModelRequest,
  onText: (delta: string) => void,
  onFallback?: (from: ProviderError, next: ProviderId) => void,
  onFailure?: (failure: ProviderError, requestedModel: string, fallback: boolean) => void,
  retries = 1,
): Promise<ModelTurn> {
  if (providers.length === 0) throw new ProviderError('anthropic', 'unavailable', 'No model provider is configured.');
  for (const [index, provider] of providers.entries()) {
    for (let attempt = 0; ; attempt += 1) {
      let started = false;
      try {
        return await provider.complete(request, delta => {
          started = true;
          onText(delta);
        });
      } catch (error) {
        const failure = classifyThrown(provider.id, error, request.signal, started);
        const next = providers[index + 1];
        const retry = attempt < retries && !failure.outputStarted && !request.signal.aborted && retryableKinds.includes(failure.kind);
        const fallback = !retry && next !== undefined && canFallBack(failure);
        onFailure?.(failure, provider.model, fallback);
        if (retry) {
          await pause(providerRetryDelayMs * (attempt + 1), request.signal);
          continue;
        }
        if (!fallback) throw failure;
        onFallback?.(failure, next.id);
        break;
      }
    }
  }
  throw new ProviderError('anthropic', 'unavailable', 'No model provider is configured.');
}

export function validUsage(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647;
}

export function costMicroUsd(usage: ModelUsage, price: { inputPerMillion: number; outputPerMillion: number } | null): number | null {
  if (!price) return null;
  return Math.round(usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion);
}
