import { createAnthropicProvider } from '../services/kael-core/src/anthropic.ts';
import { createDeepSeekProvider } from '../services/kael-core/src/deepseek.ts';
import { readSse } from '../services/kael-core/src/sse.ts';
import { fingerprint } from '../services/kael-core/src/policy.ts';
import { pilotEndpoints, requirePilot } from './kael-live-policy.mjs';

export const mockModels = Object.freeze([
  Object.freeze({ provider: 'anthropic', model: 'anthropic-evaluation-mock', effort: 'low', thinking: false }),
  Object.freeze({ provider: 'deepseek', model: 'deepseek-evaluation-mock', effort: 'low', thinking: false }),
]);

const count = value => Number.isSafeInteger(value) && value >= 0;
const event = data => `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

export function mockStream(model, turn, usage) {
  if (model.provider === 'anthropic') {
    const chunks = [{ type: 'message_start', message: { model: model.model, usage: { input_tokens: usage.input, cache_read_input_tokens: usage.cache_read, cache_creation_input_tokens: usage.cache_write } } }];
    let index = 0;
    if (turn.text) {
      chunks.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, { type: 'content_block_delta', index, delta: { type: 'text_delta', text: turn.text } }, { type: 'content_block_stop', index });
      index++;
    }
    for (const call of turn.toolCalls) {
      chunks.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: call.id, name: call.name, input: {} } }, { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(call.input) } }, { type: 'content_block_stop', index });
      index++;
    }
    chunks.push({ type: 'message_delta', delta: { stop_reason: turn.toolCalls.length ? 'tool_use' : 'end_turn' }, usage: { output_tokens: usage.output } }, { type: 'message_stop' });
    return chunks.map(event).join('');
  }
  const delta = { content: turn.text, tool_calls: turn.toolCalls.map((call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.input) } })) };
  return [
    { model: model.model, choices: [{ delta, finish_reason: turn.toolCalls.length ? 'tool_calls' : 'stop' }] },
    { model: model.model, choices: [], usage: { prompt_tokens: usage.input + usage.cache_read, completion_tokens: usage.output, total_tokens: usage.input + usage.cache_read + usage.output, prompt_cache_hit_tokens: usage.cache_read, prompt_cache_miss_tokens: usage.input, completion_tokens_details: { reasoning_tokens: usage.reasoning } } },
    '[DONE]',
  ].map(event).join('');
}

export function prepareRequest(input, init, model) {
  requirePilot(String(input) === pilotEndpoints[model.provider] && init.method === 'POST', 'PROVIDER_ENDPOINT_DENIED');
  const body = JSON.parse(init.body);
  requirePilot(body.model === model.model && body.stream === true, 'REQUEST_MODEL_MISMATCH');
  delete body.fallbacks;
  const headers = new Headers(init.headers);
  headers.delete('anthropic-beta');
  return { ...init, body: JSON.stringify(body), headers };
}

function validateAnthropicBlocks(chunks) {
  let open = null;
  let nextIndex = 0;
  let finalized = false;
  let tools = 0;
  const ids = new Set();
  requirePilot(!chunks[0].message?.content?.length, 'INCOMPLETE_SSE');
  for (const chunk of chunks.slice(1, -1)) {
    if (chunk.type === 'content_block_start') {
      const block = chunk.content_block;
      requirePilot(!finalized && open === null && chunk.index === nextIndex && ['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(block?.type), 'INCOMPLETE_SSE');
      if (block.type === 'tool_use') {
        requirePilot(typeof block.id === 'string' && block.id.length > 0 && !ids.has(block.id) && typeof block.name === 'string' && block.name.length > 0 && block.input && typeof block.input === 'object' && !Array.isArray(block.input) && Object.keys(block.input).length === 0, 'INCOMPLETE_TOOL_CALL');
        ids.add(block.id); tools++;
      }
      open = { index: chunk.index, type: block.type, json: '' };
      nextIndex++;
    } else if (chunk.type === 'content_block_delta') {
      requirePilot(open && chunk.index === open.index && !finalized, 'INCOMPLETE_SSE');
      const delta = chunk.delta;
      if (open.type === 'tool_use') {
        requirePilot(delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string', 'INCOMPLETE_TOOL_CALL');
        open.json += delta.partial_json;
      } else requirePilot(delta && (open.type === 'text' ? delta.type === 'text_delta' && typeof delta.text === 'string' : open.type === 'thinking' && ['thinking_delta', 'signature_delta'].includes(delta.type)), 'INCOMPLETE_SSE');
    } else if (chunk.type === 'content_block_stop') {
      requirePilot(open && chunk.index === open.index && !finalized, 'INCOMPLETE_SSE');
      if (open.type === 'tool_use') {
        let input;
        try { input = JSON.parse(open.json || '{}'); } catch { requirePilot(false, 'INCOMPLETE_TOOL_CALL'); }
        requirePilot(input && typeof input === 'object' && !Array.isArray(input), 'INCOMPLETE_TOOL_CALL');
      }
      open = null;
    } else if (chunk.type === 'message_delta') {
      requirePilot(open === null && ['end_turn', 'stop_sequence', 'tool_use', 'max_tokens', 'refusal'].includes(chunk.delta?.stop_reason) && (chunk.delta.stop_reason === 'tool_use') === (tools > 0), 'INCOMPLETE_SSE');
      finalized = true;
    } else requirePilot(chunk.type === 'ping', 'INCOMPLETE_SSE');
  }
  requirePilot(open === null && finalized, 'INCOMPLETE_SSE');
}

function validateDeepSeekTools(chunks) {
  const calls = new Map();
  let finished = false;
  for (const chunk of chunks.slice(0, -1)) {
    requirePilot(Array.isArray(chunk.choices) && chunk.choices.length <= 1, 'INCOMPLETE_SSE');
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    requirePilot(!finished, 'INCOMPLETE_SSE');
    for (const part of choice.delta?.tool_calls ?? []) {
      requirePilot(Number.isSafeInteger(part.index) && part.index >= 0, 'INCOMPLETE_TOOL_CALL');
      const current = calls.get(part.index) ?? { id: '', name: '', args: '' };
      if (part.id !== undefined) { requirePilot(!current.id && typeof part.id === 'string', 'INCOMPLETE_TOOL_CALL'); current.id = part.id; }
      if (part.function?.name !== undefined) { requirePilot(!current.name && typeof part.function.name === 'string', 'INCOMPLETE_TOOL_CALL'); current.name = part.function.name; }
      if (part.function?.arguments !== undefined) { requirePilot(typeof part.function.arguments === 'string', 'INCOMPLETE_TOOL_CALL'); current.args += part.function.arguments; }
      calls.set(part.index, current);
    }
    if (choice.finish_reason) {
      requirePilot(['stop', 'tool_calls', 'length', 'content_filter'].includes(choice.finish_reason) && (choice.finish_reason === 'tool_calls') === (calls.size > 0), 'INCOMPLETE_SSE');
      finished = true;
    }
  }
  const ids = new Set();
  for (const call of calls.values()) {
    requirePilot(call.id && call.name && !ids.has(call.id), 'INCOMPLETE_TOOL_CALL');
    ids.add(call.id);
    let input;
    try { input = JSON.parse(call.args || '{}'); } catch { requirePilot(false, 'INCOMPLETE_TOOL_CALL'); }
    requirePilot(input && typeof input === 'object' && !Array.isArray(input), 'INCOMPLETE_TOOL_CALL');
  }
}

export async function inspectStream(response, model, signal) {
  requirePilot(Object.hasOwn(pilotEndpoints, model.provider), 'PROVIDER_ENDPOINT_DENIED');
  requirePilot(response.ok && response.body, 'PROVIDER_RESPONSE_INVALID');
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  const abort = () => { void reader.cancel(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      requirePilot(!signal.aborted, 'PROVIDER_STREAM_ABORTED');
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      requirePilot(size <= 1048576, 'PROVIDER_STREAM_TOO_LARGE');
      parts.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
    signal.removeEventListener('abort', abort);
  }
  requirePilot(!signal.aborted, 'PROVIDER_STREAM_ABORTED');
  const wire = Buffer.concat(parts);
  const chunks = [];
  for await (const chunk of readSse(new Response(wire).body, signal)) chunks.push(chunk.data === '[DONE]' ? '[DONE]' : JSON.parse(chunk.data));
  let usage;
  let rawStopReason;
  if (model.provider === 'anthropic') {
    requirePilot(chunks[0]?.type === 'message_start' && chunks.at(-1)?.type === 'message_stop' && chunks.filter(c => c.type === 'message_start').length === 1 && chunks.filter(c => c.type === 'message_stop').length === 1 && !chunks.some(c => c.type === 'error'), 'INCOMPLETE_SSE');
    requirePilot(chunks[0].message?.model === model.model, 'MODEL_IDENTITY_UNVERIFIED');
    validateAnthropicBlocks(chunks);
    const start = chunks[0].message?.usage;
    const final = chunks.filter(c => c.type === 'message_delta').at(-1);
    rawStopReason = final?.delta?.stop_reason;
    requirePilot(final?.delta?.stop_reason && start && final.usage, 'USAGE_UNKNOWN');
    usage = { input: start.input_tokens, cache_read: start.cache_read_input_tokens, cache_write: start.cache_creation_input_tokens, output: final.usage.output_tokens, reasoning: 0 };
  } else {
    requirePilot(chunks.at(-1) === '[DONE]' && chunks.filter(c => c === '[DONE]').length === 1 && chunks.some(c => c.choices?.[0]?.finish_reason), 'INCOMPLETE_SSE');
    requirePilot(chunks.slice(0, -1).length > 0 && chunks.slice(0, -1).every(c => c.model === model.model), 'MODEL_IDENTITY_UNVERIFIED');
    validateDeepSeekTools(chunks);
    const final = chunks.at(-2)?.usage;
    rawStopReason = chunks.find(c => c.choices?.[0]?.finish_reason)?.choices[0].finish_reason;
    requirePilot(final && count(final.prompt_tokens) && count(final.prompt_cache_hit_tokens) && final.prompt_cache_hit_tokens <= final.prompt_tokens && final.prompt_cache_miss_tokens === final.prompt_tokens - final.prompt_cache_hit_tokens && final.total_tokens === final.prompt_tokens + final.completion_tokens, 'USAGE_UNKNOWN');
    usage = { input: final.prompt_cache_miss_tokens, cache_read: final.prompt_cache_hit_tokens, cache_write: 0, output: final.completion_tokens, reasoning: final.completion_tokens_details?.reasoning_tokens };
  }
  requirePilot(Object.values(usage).every(count), 'USAGE_UNKNOWN');
  return { response: new Response(wire, { headers: { 'content-type': 'text/event-stream' } }), usage, served_model: model.model, raw_stop_reason: rawStopReason };
}

export function mockPilotProvider({ model, script, budget, scenario, records, mutateWire = wire => wire }) {
  requirePilot(mockModels.some(m => m.provider === model.provider && m.model === model.model), 'MOCK_MODEL_REQUIRED');
  let request;
  const config = { apiKey: 'mock-only-no-credential', model: model.model, effort: model.effort, thinking: model.thinking, timeoutMs: 15000 };
  const fetcher = async (input, init) => {
    const prepared = prepareRequest(input, init, model);
    requirePilot(Buffer.byteLength(prepared.body) <= budget.limits.max_input_tokens_per_call && request.maxOutputTokens <= budget.limits.max_output_tokens_per_call, 'INPUT_OR_OUTPUT_BOUND_UNVERIFIED');
    budget.reserve(scenario);
    try {
      const turn = await script.complete(request, () => {});
      const syntheticUsage = { input: Math.ceil(Buffer.byteLength(prepared.body) / 4), output: Math.ceil(Buffer.byteLength(JSON.stringify({ text: turn.text, calls: turn.toolCalls })) / 4), cache_read: 0, cache_write: 0, reasoning: 0 };
      const wire = mutateWire(mockStream(model, turn, syntheticUsage));
      const measured = await inspectStream(new Response(wire, { headers: { 'content-type': 'text/event-stream' } }), model, init.signal);
      const accounting = budget.reconcile(measured.usage);
      records.push({ evidence_type: 'MOCK_TRANSPORT_ONLY', provider: model.provider, requested_model: model.model, served_model: measured.served_model, usage: measured.usage, accounting, system_prompt_hash: await fingerprint(request.system), raw_stop_reason: measured.raw_stop_reason });
      return measured.response;
    } catch (error) { budget.halted = error.code ?? 'MOCK_PROVIDER_FAILED'; throw error; }
  };
  const adapter = model.provider === 'anthropic' ? createAnthropicProvider(config, fetcher) : createDeepSeekProvider(config, fetcher);
  return {
    ...adapter,
    requests: script.requests,
    async complete(value, onText) {
      requirePilot(!request && !budget.halted, budget.halted ?? 'CONCURRENT_REQUEST_FORBIDDEN');
      request = value;
      const index = records.length;
      try {
        const result = await adapter.complete(value, onText);
        records[index].stop_reason = result.stopReason;
        return result;
      } catch (error) { budget.halted ??= error.code ?? 'ADAPTER_FAILED'; throw error; } finally { request = null; }
    },
  };
}
