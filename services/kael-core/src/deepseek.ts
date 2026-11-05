import { classifyStatus, classifyThrown, ProviderError, validUsage } from './model.ts';
import type { Fetcher, ModelProvider, ModelRequest, ModelTurn, StopReason, ToolCall, TranscriptItem } from './model.ts';
import { readSse } from './sse.ts';

export const deepseekEndpoint = 'https://api.deepseek.com/chat/completions';

export type DeepSeekConfig = { apiKey: string; model: string; thinking: boolean; timeoutMs: number; verifiedModels?: readonly string[] };

type DeepSeekState = { reasoning: string };

function toMessages(system: string, transcript: readonly TranscriptItem[], config: DeepSeekConfig): unknown[] {
  const messages: unknown[] = [{ role: 'system', content: system }];
  for (const item of transcript) {
    if (item.role === 'user') messages.push({ role: 'user', content: item.text });
    else if (item.role === 'tool') {
      for (const result of item.results) messages.push({ role: 'tool', tool_call_id: result.callId, content: result.content });
    } else {
      const message: Record<string, unknown> = { role: 'assistant', content: item.text || (item.toolCalls.length > 0 ? null : '') };
      if (item.toolCalls.length > 0) {
        message.tool_calls = item.toolCalls.map(call => ({
          id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
        }));
      }
      const state = item.providerState;
      if (config.thinking && state?.provider === 'deepseek' && state.model === config.model) {
        message.reasoning_content = (state.data as DeepSeekState).reasoning;
      }
      messages.push(message);
    }
  }
  return messages;
}

function stopReasonOf(raw: unknown): StopReason {
  if (raw === 'stop') return 'end_turn';
  if (raw === 'tool_calls') return 'tool_use';
  if (raw === 'length') return 'max_tokens';
  if (raw === 'content_filter') return 'content_filter';
  return 'other';
}

export function deepseekRequestBody(config: DeepSeekConfig, request: ModelRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: toMessages(request.system, request.transcript, config),
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: request.maxOutputTokens,
    thinking: { type: config.thinking ? 'enabled' : 'disabled' },
  };
  if (request.tools.length > 0) {
    body.tools = request.tools.map(tool => ({
      type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
    body.tool_choice = 'auto';
  }
  return body;
}

export function createDeepSeekProvider(config: DeepSeekConfig, fetcher: Fetcher = fetch): ModelProvider {
  return {
    id: 'deepseek',
    model: config.model,
    async complete(request, onText): Promise<ModelTurn> {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)]);
      let started = false;
      try {
        const response = await fetcher(deepseekEndpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(deepseekRequestBody(config, request)),
          signal,
          redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new ProviderError('deepseek', classifyStatus(response.status), `DeepSeek responded with HTTP ${response.status}.`, false, response.status);
        }
        if (!response.body) throw new ProviderError('deepseek', 'incomplete', 'The provider did not return a stream body.');
        if (config.verifiedModels && !/^text\/event-stream(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
          await response.body.cancel();
          throw new ProviderError('deepseek', 'incomplete', 'The provider did not return an SSE stream.');
        }
        let text = '';
        let reasoning = '';
        let finishReason: unknown = null;
        let inputTokens = 0;
        let outputTokens = 0;
        let cachedInputTokens = 0;
        let servedModel: string | null = null;
        let verifiedUsage = false;
        const calls = new Map<number, { id: string; name: string; args: string }>();
        let terminated = false;
        for await (const message of readSse(response.body, signal)) {
          if (message.data === '[DONE]') {
            terminated = true;
            break;
          }
          const chunk = JSON.parse(message.data) as Record<string, unknown>;
          {
            if (chunk.error !== undefined || !Array.isArray(chunk.choices) || chunk.choices.length > 1
              || (finishReason !== null && chunk.choices.length > 0)) {
              throw new ProviderError('deepseek', 'incomplete', 'The stream violated the completion lifecycle.', started);
            }
            const first = chunk.choices[0];
            if (chunk.choices.length && (typeof first !== 'object' || first === null || Array.isArray(first))) {
              throw new ProviderError('deepseek', 'incomplete', 'The stream choice was malformed.', started);
            }
            const finish = (first as Record<string, unknown> | undefined)?.finish_reason;
            if (finish !== null && finish !== undefined && (typeof finish !== 'string'
              || !['stop', 'tool_calls', 'length', 'content_filter', 'insufficient_system_resource', 'aborted'].includes(finish))) {
              throw new ProviderError('deepseek', 'incomplete', 'The completion reason was not recognized.', started);
            }
          }
          const reportedModel = typeof chunk.model === 'string' && /^deepseek-[a-z0-9][a-z0-9._-]{0,70}$/i.test(chunk.model) ? chunk.model : null;
          if (config.verifiedModels && chunk.model !== undefined && reportedModel === null) {
            throw new ProviderError('deepseek', 'incomplete', 'The served model identity was malformed.', started);
          }
          if (reportedModel !== null) {
            if (servedModel !== null && servedModel !== reportedModel) throw new ProviderError('deepseek', 'incomplete', 'The served model changed within the stream.', started);
            servedModel = reportedModel;
          }
          if (config.verifiedModels && (servedModel === null || !config.verifiedModels.includes(servedModel))) {
            throw new ProviderError('deepseek', 'incomplete', 'The served model identity was not authorized.', started);
          }
          const choice = (chunk.choices as Record<string, unknown>[] | undefined)?.[0];
          const delta = (choice?.delta ?? {}) as Record<string, unknown>;
          if (verifiedUsage && choice) throw new ProviderError('deepseek', 'incomplete', 'Content followed the final usage.', started);
          const usage = chunk.usage as Record<string, unknown> | null | undefined;
          if (usage) {
            if (verifiedUsage || !validUsage(usage.prompt_tokens) || !validUsage(usage.completion_tokens)
              || (usage.prompt_cache_hit_tokens !== undefined && (!validUsage(usage.prompt_cache_hit_tokens) || usage.prompt_cache_hit_tokens > usage.prompt_tokens))) {
              throw new ProviderError('deepseek', 'incomplete', 'The final usage was malformed.', started);
            }
            if (config.verifiedModels) {
              if (choice && (choice.finish_reason == null || typeof delta !== 'object' || Array.isArray(delta)
                || Object.entries(delta).some(([name, value]) => value !== null && value !== ''
                  && !(name === 'tool_calls' && Array.isArray(value) && value.length === 0)
                  && !(name === 'role' && value === 'assistant')))) {
                throw new ProviderError('deepseek', 'incomplete', 'Usage accompanied non-terminal content.', started);
              }
              const fields = ['prompt_tokens', 'completion_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens', 'total_tokens'];
              if (verifiedUsage || !fields.every(name => Number.isSafeInteger(usage[name]) && Number(usage[name]) >= 0)
                || Number(usage.prompt_tokens) !== Number(usage.prompt_cache_hit_tokens) + Number(usage.prompt_cache_miss_tokens)
                || Number(usage.total_tokens) !== Number(usage.prompt_tokens) + Number(usage.completion_tokens)
                || Number(usage.completion_tokens) > request.maxOutputTokens || Number(usage.prompt_tokens) > 1_048_576) {
                throw new ProviderError('deepseek', 'incomplete', 'The final usage was missing or inconsistent.', started);
              }
            }
            if (finishReason === null && choice?.finish_reason == null) throw new ProviderError('deepseek', 'incomplete', 'Usage arrived before the terminal choice.', started);
            verifiedUsage = true;
            inputTokens = Number(usage.prompt_tokens ?? 0);
            outputTokens = Number(usage.completion_tokens ?? 0);
            cachedInputTokens = Number(usage.prompt_cache_hit_tokens ?? 0);
          }
          if (!choice) continue;
          if (typeof delta.reasoning_content === 'string') reasoning += delta.reasoning_content;
          if (typeof delta.content === 'string' && delta.content.length > 0) {
            text += delta.content;
            started = true;
            onText(delta.content);
          }
          for (const part of (delta.tool_calls as Record<string, unknown>[] | undefined) ?? []) {
            const index = Number(part.index ?? 0);
            const fn = (part.function ?? {}) as Record<string, unknown>;
            const current = calls.get(index) ?? { id: '', name: '', args: '' };
            if (typeof part.id === 'string') current.id = part.id;
            if (typeof fn.name === 'string') current.name = fn.name;
            if (typeof fn.arguments === 'string') current.args += fn.arguments;
            calls.set(index, current);
          }
          if (choice.finish_reason !== null && choice.finish_reason !== undefined) finishReason = choice.finish_reason;
        }
        if (finishReason === null || !terminated) throw new ProviderError('deepseek', 'incomplete', 'The DeepSeek stream ended before completion.', started);
        if (!verifiedUsage) throw new ProviderError('deepseek', 'incomplete', 'The final usage was unavailable.', started);
        if ((config.verifiedModels || finishReason !== 'length') && ((finishReason === 'tool_calls') !== (calls.size > 0))) {
          throw new ProviderError('deepseek', 'incomplete', 'The tool completion reason did not match the stream.', started);
        }
        if (finishReason === 'insufficient_system_resource' || finishReason === 'aborted') {
          throw new ProviderError('deepseek', started ? 'incomplete' : 'overloaded', 'DeepSeek stopped before completing the response.', started);
        }
        const toolCalls: ToolCall[] = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
          let input: unknown = null;
          try { input = call.args === '' ? {} : JSON.parse(call.args); } catch { input = null; }
          return { id: call.id, name: call.name, input };
        });
        return {
          provider: 'deepseek',
          model: servedModel ?? config.model,
          requestedModel: config.model,
          text,
          toolCalls,
          stopReason: stopReasonOf(finishReason),
          usage: { inputTokens, outputTokens, cachedInputTokens },
          providerState: { provider: 'deepseek', model: config.model, data: { reasoning } satisfies DeepSeekState },
        };
      } catch (error) {
        if (error instanceof SyntaxError) throw new ProviderError('deepseek', 'incomplete', 'DeepSeek sent malformed stream data.', started);
        if (signal.aborted && !request.signal.aborted) throw classifyThrown('deepseek', signal.reason, request.signal, started);
        throw classifyThrown('deepseek', error, request.signal, started);
      }
    },
  };
}
