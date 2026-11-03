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
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: ModelUsage;
  providerState: ProviderState | null;
};

export type ProviderErrorKind =
  | 'unavailable' | 'auth' | 'rate_limit' | 'overloaded' | 'bad_request' | 'server' | 'network' | 'timeout' | 'incomplete' | 'cancelled';

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderId;
  readonly outputStarted: boolean;

  constructor(provider: ProviderId, kind: ProviderErrorKind, message: string, outputStarted = false) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
    this.outputStarted = outputStarted;
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
  if (status === 402) return 'unavailable';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status === 529 || status === 503) return 'overloaded';
  if (status >= 500) return 'server';
  return 'bad_request';
}

export function classifyThrown(provider: ProviderId, error: unknown, signal: AbortSignal, outputStarted: boolean): ProviderError {
  if (error instanceof ProviderError) return error;
  if (signal.aborted) return new ProviderError(provider, 'cancelled', 'The run was cancelled.', outputStarted);
  if (error instanceof DOMException && error.name === 'TimeoutError') return new ProviderError(provider, 'timeout', 'The provider timed out.', outputStarted);
  return new ProviderError(provider, outputStarted ? 'incomplete' : 'network', 'The provider connection failed.', outputStarted);
}

export function canFallBack(error: ProviderError): boolean {
  return !error.outputStarted && error.kind !== 'cancelled' && error.kind !== 'incomplete';
}

export async function completeWithFallback(
  providers: readonly ModelProvider[],
  request: ModelRequest,
  onText: (delta: string) => void,
  onFallback: (from: ProviderError) => void = () => {},
): Promise<ModelTurn> {
  if (providers.length === 0) throw new ProviderError('anthropic', 'unavailable', 'No model provider is configured.');
  let lastError: ProviderError | null = null;
  for (const provider of providers) {
    let started = false;
    try {
      return await provider.complete(request, delta => {
        started = true;
        onText(delta);
      });
    } catch (error) {
      const failure = classifyThrown(provider.id, error, request.signal, started);
      if (!canFallBack(failure)) throw failure;
      lastError = failure;
      onFallback(failure);
    }
  }
  throw lastError ?? new ProviderError('anthropic', 'unavailable', 'No model provider is configured.');
}

export function costMicroUsd(usage: ModelUsage, price: { inputPerMillion: number; outputPerMillion: number } | null): number | null {
  if (!price) return null;
  return Math.round(usage.inputTokens * price.inputPerMillion + usage.outputTokens * price.outputPerMillion);
}
