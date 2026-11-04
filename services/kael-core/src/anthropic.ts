import { classifyStatus, classifyThrown, ProviderError } from './model.ts';
import type { Fetcher, ModelProvider, ModelRequest, ModelTurn, StopReason, ToolCall, TranscriptItem } from './model.ts';
import { readSse } from './sse.ts';

export const anthropicEndpoint = 'https://api.anthropic.com/v1/messages';
export const anthropicVersion = '2026-10-21';
const serverFallbackBeta = 'server-side-fallback-2026-07-01';
const serverFallbackModels = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export type AnthropicConfig = { apiKey: string; model: string; effort: 'low' | 'medium' | 'high'; timeoutMs: number };

type Block = Record<string, unknown> & { type: string };

const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,79}$/;

function reportedModel(value: unknown): string | null {
  return typeof value === 'string' && modelIdPattern.test(value) ? value : null;
}

function toMessages(transcript: readonly TranscriptItem[], model: string): unknown[] {
  return transcript.map(item => {
    if (item.role === 'user') return { role: 'user', content: item.text };
    if (item.role === 'tool') {
      return {
        role: 'user',
        content: item.results.map(result => ({ type: 'tool_result', tool_use_id: result.callId, content: result.content, is_error: result.isError })),
      };
    }
    if (item.providerState?.provider === 'anthropic' && item.providerState.model === model && Array.isArray(item.providerState.data)) {
      return { role: 'assistant', content: item.providerState.data };
    }
    const content: unknown[] = [];
    if (item.text) content.push({ type: 'text', text: item.text });
    for (const call of item.toolCalls) content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
    return { role: 'assistant', content };
  });
}

function stopReasonOf(raw: unknown): StopReason {
  if (raw === 'end_turn' || raw === 'stop_sequence') return 'end_turn';
  if (raw === 'tool_use' || raw === 'max_tokens' || raw === 'refusal') return raw;
  return 'other';
}

export function anthropicRequestBody(config: AnthropicConfig, request: ModelRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: request.maxOutputTokens,
    stream: true,
    system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
    messages: toMessages(request.transcript, config.model),
    output_config: { effort: config.effort },
  };
  if (request.tools.length > 0) {
    body.tools = request.tools.map(tool => ({
      name: tool.name, description: tool.description, input_schema: tool.inputSchema, eager_input_streaming: true,
    }));
  }
  if (serverFallbackModels.has(config.model)) body.fallbacks = 'default';
  return body;
}

export function createAnthropicProvider(config: AnthropicConfig, fetcher: Fetcher = fetch): ModelProvider {
  return {
    id: 'anthropic',
    model: config.model,
    async complete(request, onText): Promise<ModelTurn> {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)]);
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': anthropicVersion,
      };
      if (serverFallbackModels.has(config.model)) headers['anthropic-beta'] = serverFallbackBeta;
      let started = false;
      try {
        const response = await fetcher(anthropicEndpoint, { method: 'POST', headers, body: JSON.stringify(anthropicRequestBody(config, request)), signal });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new ProviderError('anthropic', classifyStatus(response.status), `Anthropic responded with HTTP ${response.status}.`);
        }
        const blocks: Block[] = [];
        const partialInputs = new Map<number, string>();
        let text = '';
        let stopReason: StopReason = 'other';
        let inputTokens = 0;
        let cachedInputTokens = 0;
        let outputTokens = 0;
        let finished = false;
        let servedModel: string | null = null;
        for await (const message of readSse(response.body, signal)) {
          const data = JSON.parse(message.data) as Record<string, unknown>;
          const index = typeof data.index === 'number' ? data.index : -1;
          if (data.type === 'message_start') {
            const opened = data.message as { model?: unknown; usage?: Record<string, unknown> } | undefined;
            servedModel = reportedModel(opened?.model);
            const usage = opened?.usage ?? {};
            inputTokens = Number(usage.input_tokens ?? 0);
            cachedInputTokens = Number(usage.cache_read_input_tokens ?? 0);
          } else if (data.type === 'content_block_start') {
            const block = { ...(data.content_block as Block) };
            if (block.type === 'tool_use') { partialInputs.set(index, ''); block.input = {}; }
            blocks[index] = block;
          } else if (data.type === 'content_block_delta') {
            const delta = data.delta as Record<string, unknown>;
            const block = blocks[index];
            if (!block) continue;
            if (delta.type === 'text_delta' && typeof delta.text === 'string') {
              block.text = `${String(block.text ?? '')}${delta.text}`;
              text += delta.text;
              started = true;
              onText(delta.text);
            } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
              partialInputs.set(index, `${partialInputs.get(index) ?? ''}${delta.partial_json}`);
            } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
              block.thinking = `${String(block.thinking ?? '')}${delta.thinking}`;
            } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
              block.signature = delta.signature;
            }
          } else if (data.type === 'content_block_stop') {
            const block = blocks[index];
            if (block?.type === 'tool_use') {
              const raw = partialInputs.get(index) ?? '';
              try {
                block.input = raw === '' ? {} : JSON.parse(raw);
              } catch {
                block.input = { invalid_json: raw.slice(0, 2000) };
                block.invalid = true;
              }
            }
          } else if (data.type === 'message_delta') {
            const delta = data.delta as Record<string, unknown> | undefined;
            if (delta && 'stop_reason' in delta) stopReason = stopReasonOf(delta.stop_reason);
            const usage = data.usage as Record<string, unknown> | undefined;
            if (usage?.output_tokens !== undefined) outputTokens = Number(usage.output_tokens);
          } else if (data.type === 'message_stop') {
            finished = true;
          } else if (data.type === 'error') {
            const kind = (data.error as { type?: string } | undefined)?.type === 'overloaded_error' ? 'overloaded' : 'server';
            throw new ProviderError('anthropic', started ? 'incomplete' : kind, 'Anthropic reported a stream error.', started);
          }
        }
        if (!finished) throw new ProviderError('anthropic', 'incomplete', 'The Anthropic stream ended before completion.', started);
        const toolCalls: ToolCall[] = [];
        const replay = blocks.filter(Boolean).map(block => {
          if (block.type !== 'tool_use') return block;
          toolCalls.push({ id: String(block.id), name: String(block.name), input: block.invalid ? null : block.input });
          const { invalid: _invalid, ...rest } = block;
          return rest;
        });
        const model = servedModel ?? config.model;
        return {
          provider: 'anthropic',
          model,
          requestedModel: config.model,
          text,
          toolCalls,
          stopReason,
          usage: { inputTokens: inputTokens + cachedInputTokens, outputTokens, cachedInputTokens },
          providerState: { provider: 'anthropic', model, data: replay },
        };
      } catch (error) {
        if (error instanceof SyntaxError) throw new ProviderError('anthropic', started ? 'incomplete' : 'server', 'Anthropic sent malformed stream data.', started);
        throw classifyThrown('anthropic', error, request.signal, started);
      }
    },
  };
}
