import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { anthropicEndpoint, anthropicVersion, createAnthropicProvider } from '../services/kael-core/src/anthropic.ts';
import { configurationReport, defaultLimits, readKaelConfig } from '../services/kael-core/src/config.ts';
import { createDeepSeekProvider, deepseekEndpoint } from '../services/kael-core/src/deepseek.ts';
import { completeWithFallback, ProviderError } from '../services/kael-core/src/model.ts';
import { perplexitySearchEndpoint, searchWeb } from '../services/kael-core/src/perplexity.ts';
import { canonicalJson, evaluateCall, fingerprint, selectTools } from '../services/kael-core/src/policy.ts';
import { readSse } from '../services/kael-core/src/sse.ts';
import { checkModelTransition, taskTransitions } from '../services/kael-core/src/tasks.ts';
import { findTool, validateArguments } from '../services/kael-core/src/tools.ts';
import { parseKaelEvent } from '../apps/mobile/src/features/shared/kael-events.ts';
import { baseEnv, harness, users } from './kael-test-harness.mjs';

const encoder = new TextEncoder();

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function sse(events) {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

function recordingFetch(response) {
  const calls = [];
  return { calls, fetcher: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return typeof response === 'function' ? response() : response; } };
}

const request = (overrides = {}) => ({
  system: 'system prompt',
  transcript: [{ role: 'user', text: 'Xin chào' }],
  tools: [{ name: 'task_create', description: 'd', inputSchema: findTool('task_create').inputSchema }],
  maxOutputTokens: 1024,
  signal: new AbortController().signal,
  ...overrides,
});

const anthropicConfig = { apiKey: 'test-anthropic-key', model: 'claude-opus-5-5', effort: 'medium', timeoutMs: 5000 };
const deepseekConfig = { apiKey: 'test-deepseek-key', model: 'deepseek-flash', thinking: false, timeoutMs: 5000 };

const anthropicStream = sse([
  ['message_start', { type: 'message_start', message: { usage: { input_tokens: 40, cache_read_input_tokens: 10 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig-1' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Để mình ' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'ghi nhận.' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 1 }],
  ['content_block_start', { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_1', name: 'task_create', input: {} } }],
  ['content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"title":"Sửa máy lạnh",' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"kind":"service_request","status":"running","note":""}' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 2 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 33 } }],
  ['message_stop', { type: 'message_stop' }],
]);

test('Anthropic adapter sends the current Messages API shape without sampling parameters', async () => {
  const { calls, fetcher } = recordingFetch(new Response(streamOf([anthropicStream]), { status: 200 }));
  const provider = createAnthropicProvider(anthropicConfig, fetcher);
  await provider.complete(request(), () => {});
  const [{ url, init, body }] = calls;
  assert.equal(url, anthropicEndpoint);
  assert.equal(init.headers['x-api-key'], 'test-anthropic-key');
  assert.equal(init.headers['anthropic-version'], anthropicVersion);
  assert.equal(init.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.stream, true);
  assert.deepEqual(body.output_config, { effort: 'medium' });
  assert.equal(body.tools[0].eager_input_streaming, true);
  assert.equal(body.tools[0].input_schema.additionalProperties, false);
  for (const key of ['temperature', 'top_p', 'top_k', 'thinking', 'tool_choice']) assert.equal(key in body, false, key);
  assert.equal(body.system[0].cache_control.type, 'ephemeral');
});

test('Anthropic adapter streams text, parses tool input strictly and keeps thinking blocks for same-run replay', async () => {
  const { fetcher } = recordingFetch(new Response(streamOf([anthropicStream.slice(0, 200), anthropicStream.slice(200)]), { status: 200 }));
  const provider = createAnthropicProvider(anthropicConfig, fetcher);
  const deltas = [];
  const turn = await provider.complete(request(), delta => deltas.push(delta));
  assert.deepEqual(deltas, ['Để mình ', 'ghi nhận.']);
  assert.equal(turn.text, 'Để mình ghi nhận.');
  assert.equal(turn.stopReason, 'tool_use');
  assert.deepEqual(turn.toolCalls, [{ id: 'toolu_1', name: 'task_create', input: { title: 'Sửa máy lạnh', kind: 'service_request', status: 'running', note: '' } }]);
  assert.deepEqual(turn.usage, { inputTokens: 50, outputTokens: 33, cachedInputTokens: 10 });
  assert.equal(turn.providerState.data[0].signature, 'sig-1');

  const replay = recordingFetch(new Response(streamOf([sse([['message_stop', { type: 'message_stop' }]])]), { status: 200 }));
  const next = createAnthropicProvider(anthropicConfig, replay.fetcher);
  await next.complete(request({ transcript: [{ role: 'user', text: 'Xin chào' }, { role: 'assistant', text: turn.text, toolCalls: turn.toolCalls, providerState: turn.providerState }, { role: 'tool', results: [{ callId: 'toolu_1', content: '{}', isError: false }] }] }), () => {});
  const messages = replay.calls[0].body.messages;
  assert.deepEqual(messages[1].content, turn.providerState.data, 'thinking and tool_use blocks are replayed unchanged');
  assert.deepEqual(messages[2].content, [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}', is_error: false }]);

  const other = recordingFetch(new Response(streamOf([sse([['message_stop', { type: 'message_stop' }]])]), { status: 200 }));
  await createAnthropicProvider({ ...anthropicConfig, model: 'claude-sonnet-5-5' }, other.fetcher).complete(request({ transcript: [{ role: 'user', text: 'a' }, { role: 'assistant', text: turn.text, toolCalls: turn.toolCalls, providerState: turn.providerState }] }), () => {});
  assert.equal(other.calls[0].body.messages[1].content.some(block => block.type === 'thinking'), false, 'state from another model is rebuilt from text and tool calls');
});

test('Anthropic adapter treats a stream without message_stop as incomplete and classifies HTTP failures', async () => {
  const truncated = anthropicStream.split('event: message_delta')[0];
  const provider = createAnthropicProvider(anthropicConfig, recordingFetch(new Response(streamOf([truncated]), { status: 200 })).fetcher);
  await assert.rejects(provider.complete(request(), () => {}), error => error instanceof ProviderError && error.kind === 'incomplete' && error.outputStarted);
  for (const [status, kind] of [[529, 'overloaded'], [429, 'rate_limit'], [401, 'auth'], [400, 'bad_request'], [500, 'server']]) {
    const failing = createAnthropicProvider(anthropicConfig, recordingFetch(new Response('{}', { status })).fetcher);
    await assert.rejects(failing.complete(request(), () => {}), error => error.kind === kind && !error.outputStarted, String(status));
  }
  const refusal = sse([['message_delta', { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 1 } }], ['message_stop', { type: 'message_stop' }]]);
  const refused = await createAnthropicProvider(anthropicConfig, recordingFetch(new Response(streamOf([refusal]), { status: 200 })).fetcher).complete(request(), () => {});
  assert.equal(refused.stopReason, 'refusal');
  const escaped = text => JSON.stringify(text).slice(1, -1);
  const badJson = anthropicStream.replace(escaped('"kind":"service_request",'), escaped('"kind" "broken",'));
  assert.notEqual(badJson, anthropicStream);
  const invalid = await createAnthropicProvider(anthropicConfig, recordingFetch(new Response(streamOf([badJson]), { status: 200 })).fetcher).complete(request(), () => {});
  assert.equal(invalid.toolCalls[0].input, null, 'malformed tool JSON never reaches a tool as a partial object');
});

function deepseekChunks(parts) {
  return parts.map(part => `data: ${typeof part === 'string' ? part : JSON.stringify(part)}\n\n`).join('');
}

const deepseekStream = deepseekChunks([
  { choices: [{ index: 0, delta: { role: 'assistant', reasoning_content: 'cân nhắc' }, finish_reason: null }], usage: null },
  { choices: [{ index: 0, delta: { content: 'Mình sẽ ' }, finish_reason: null }], usage: null },
  { choices: [{ index: 0, delta: { content: 'xem.', tool_calls: [{ index: 0, id: 'call_0', type: 'function', function: { name: 'customer_requests', arguments: '{"li' } }] }, finish_reason: null }], usage: null },
  { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'mit":3}' } }] }, finish_reason: null }], usage: null },
  { choices: [{ index: 0, delta: { content: '' }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 70, completion_tokens: 12, prompt_cache_hit_tokens: 30 } },
  '[DONE]',
]);

test('DeepSeek adapter uses chat completions with explicit thinking mode and assembles fragmented tool calls', async () => {
  const { calls, fetcher } = recordingFetch(new Response(streamOf([deepseekStream]), { status: 200 }));
  const deltas = [];
  const turn = await createDeepSeekProvider(deepseekConfig, fetcher).complete(request(), delta => deltas.push(delta));
  const [{ url, init, body }] = calls;
  assert.equal(url, deepseekEndpoint);
  assert.equal(init.headers.authorization, 'Bearer test-deepseek-key');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(body.tools[0].type, 'function');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(deltas, ['Mình sẽ ', 'xem.']);
  assert.deepEqual(turn.toolCalls, [{ id: 'call_0', name: 'customer_requests', input: { limit: 3 } }]);
  assert.equal(turn.stopReason, 'tool_use');
  assert.deepEqual(turn.usage, { inputTokens: 70, outputTokens: 12, cachedInputTokens: 30 });
  assert.deepEqual(turn.providerState.data, { reasoning: 'cân nhắc' });
});

test('DeepSeek thinking mode replays reasoning_content inside the run and never across providers', async () => {
  const assistant = { role: 'assistant', text: 'Mình sẽ xem.', toolCalls: [{ id: 'call_0', name: 'customer_requests', input: { limit: 3 } }], providerState: { provider: 'deepseek', model: 'deepseek-flash', data: { reasoning: 'cân nhắc' } } };
  const transcript = [{ role: 'user', text: 'a' }, assistant, { role: 'tool', results: [{ callId: 'call_0', content: '{"requests":[]}', isError: false }] }];
  const thinking = recordingFetch(new Response(streamOf([deepseekChunks([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }, '[DONE]'])]), { status: 200 }));
  await createDeepSeekProvider({ ...deepseekConfig, thinking: true }, thinking.fetcher).complete(request({ transcript }), () => {});
  const sent = thinking.calls[0].body;
  assert.deepEqual(sent.thinking, { type: 'enabled' });
  assert.equal(sent.messages[2].reasoning_content, 'cân nhắc');
  assert.equal(sent.messages[2].content, 'Mình sẽ xem.');
  assert.equal(sent.messages[2].tool_calls[0].function.arguments, '{"limit":3}');
  assert.deepEqual(sent.messages[3], { role: 'tool', tool_call_id: 'call_0', content: '{"requests":[]}' });

  const foreign = recordingFetch(new Response(streamOf([deepseekChunks([{ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }, '[DONE]'])]), { status: 200 }));
  await createDeepSeekProvider({ ...deepseekConfig, thinking: true }, foreign.fetcher).complete(request({ transcript: [transcript[0], { ...assistant, providerState: { provider: 'anthropic', model: 'x', data: [] } }] }), () => {});
  assert.equal('reasoning_content' in foreign.calls[0].body.messages[2], false);
});

test('DeepSeek adapter reports missing finish reasons, truncation and provider errors honestly', async () => {
  const cut = deepseekChunks([{ choices: [{ index: 0, delta: { content: 'Đang' }, finish_reason: null }] }]);
  await assert.rejects(createDeepSeekProvider(deepseekConfig, recordingFetch(new Response(streamOf([cut]), { status: 200 })).fetcher).complete(request(), () => {}),
    error => error.kind === 'incomplete' && error.outputStarted);
  const length = deepseekChunks([{ choices: [{ index: 0, delta: { content: 'Dài' }, finish_reason: 'length' }] }, '[DONE]']);
  assert.equal((await createDeepSeekProvider(deepseekConfig, recordingFetch(new Response(streamOf([length]), { status: 200 })).fetcher).complete(request(), () => {})).stopReason, 'max_tokens');
  const busy = deepseekChunks([{ choices: [{ index: 0, delta: {}, finish_reason: 'insufficient_system_resource' }] }, '[DONE]']);
  await assert.rejects(createDeepSeekProvider(deepseekConfig, recordingFetch(new Response(streamOf([busy]), { status: 200 })).fetcher).complete(request(), () => {}),
    error => error.kind === 'overloaded' && !error.outputStarted);
  await assert.rejects(createDeepSeekProvider(deepseekConfig, recordingFetch(new Response('{}', { status: 401 })).fetcher).complete(request(), () => {}), error => error.kind === 'auth');
});

test('Perplexity adapter uses the Search API and keeps only bounded, sourced results', async () => {
  const { calls, fetcher } = recordingFetch(new Response(JSON.stringify({ id: 'x', results: [
    { title: 'Nguồn A', url: 'https://example.vn/a', snippet: 'x'.repeat(2000), date: '2026-10-01', last_updated: null },
    { title: 'Bad', url: 'javascript:alert(1)', snippet: 'y' },
  ] }), { status: 200 }));
  const outcome = await searchWeb({ apiKey: 'test-perplexity-key', maxResults: 5, timeoutMs: 5000 }, 'giá điện', new AbortController().signal, fetcher);
  assert.equal(calls[0].url, perplexitySearchEndpoint);
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-perplexity-key');
  assert.deepEqual(calls[0].body, { query: 'giá điện', max_results: 5, max_tokens_per_page: 512 });
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.results.length, 1);
  assert.equal(outcome.results[0].snippet.length, 600);
  assert.equal(outcome.results[0].date, '2026-10-01');
  const limited = await searchWeb({ apiKey: 'k', maxResults: 5, timeoutMs: 5000 }, 'q', new AbortController().signal, recordingFetch(new Response('{}', { status: 429 })).fetcher);
  assert.deepEqual(limited, { status: 'failed', reason: 'rate_limit' });
});

test('model gateway falls back only before any output and never after an interrupted stream', async () => {
  const signal = new AbortController().signal;
  const failing = kind => ({ id: 'anthropic', model: 'a', async complete() { throw new ProviderError('anthropic', kind, 'x'); } });
  const working = { id: 'deepseek', model: 'd', async complete(_request, onText) { onText('ok'); return { provider: 'deepseek', model: 'd', text: 'ok', toolCalls: [], stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 }, providerState: null }; } };
  const fallbacks = [];
  const turn = await completeWithFallback([failing('overloaded'), working], request({ signal }), () => {}, error => fallbacks.push(error.kind));
  assert.equal(turn.provider, 'deepseek');
  assert.deepEqual(fallbacks, ['overloaded']);
  const partial = { id: 'anthropic', model: 'a', async complete(_request, onText) { onText('nửa'); throw new ProviderError('anthropic', 'incomplete', 'cut', true); } };
  await assert.rejects(completeWithFallback([partial, working], request({ signal }), () => {}), error => error.kind === 'incomplete');
  await assert.rejects(completeWithFallback([failing('cancelled'), working], request({ signal }), () => {}), error => error.kind === 'cancelled');
  await assert.rejects(completeWithFallback([], request({ signal }), () => {}), error => error.kind === 'unavailable');
});

test('SSE reader handles CRLF framing and split chunks', async () => {
  const messages = [];
  for await (const message of readSse(streamOf(['event: a\r\ndata: {"x"', ':1}\r\n\r\ndata: tail\n\n']), new AbortController().signal)) messages.push(message);
  assert.deepEqual(messages, [{ event: 'a', data: '{"x":1}' }, { event: 'message', data: 'tail' }]);
});

test('tool arguments are validated strictly against the registry contract', () => {
  const create = findTool('task_create');
  assert.ok(validateArguments(create, { title: 'A', kind: 'general', status: 'running', note: '' }));
  assert.ok(!validateArguments(create, { title: 'A', kind: 'general', status: 'running', note: '', admin: true }), 'unknown properties');
  assert.ok(!validateArguments(create, { title: 'A', kind: 'general', status: 'completed', note: '' }), 'creating completed tasks');
  assert.ok(!validateArguments(create, { title: ' ', kind: 'general', status: 'running', note: '' }), 'blank titles');
  assert.ok(!validateArguments(findTool('task_update'), { task_id: '1; drop table', status: 'paused', note: '' }), 'non-uuid ids');
  assert.ok(!validateArguments(findTool('customer_requests'), { limit: 1000 }), 'unbounded reads');
  assert.ok(!validateArguments(findTool('service_request_draft'), { task_id: users.customer.id, description: 'x', location: '', preferred_time: '', missing: ['location', 'location'] }), 'duplicate items');
  assert.ok(!validateArguments(create, null));
});

const config = (overrides = {}) => ({ ...readKaelConfig(baseEnv), ...overrides });

test('capability selection depends on mode, verified capability and owner-enabled effects, never on the model', () => {
  const customer = { userId: users.customer.id, capabilities: new Set(['customer']), mode: 'client' };
  const names = (actor, cfg = config()) => selectTools(actor, cfg).map(tool => tool.id);
  assert.deepEqual(names(customer), ['task_create', 'task_update', 'service_request_draft', 'customer_requests']);
  assert.ok(names(customer, config({ enabledEffects: new Set(['service_request_submit']) })).includes('service_request_submit'));
  assert.ok(names(customer, config({ perplexity: { apiKey: 'k', maxResults: 5, timeoutMs: 1 } })).includes('web_search'));
  assert.deepEqual(names({ ...customer, mode: 'worker' }), ['task_create', 'task_update'], 'worker mode without worker capability exposes no worker data');
  assert.deepEqual(names({ ...customer, mode: 'worker', capabilities: new Set(['customer', 'worker']) }), ['task_create', 'task_update', 'worker_jobs', 'worker_earnings', 'worker_job_status']);

  const offered = selectTools(customer, config());
  const deny = (name, input, cfg = config()) => evaluateCall({ id: 'c', name, input }, offered, customer, cfg, 0);
  assert.equal(deny('worker_earnings', {}).reason, 'not_offered');
  assert.equal(deny('run_sql', { sql: 'delete' }).reason, 'unknown_tool');
  assert.equal(deny('service_request_submit', { task_id: users.customer.id }).reason, 'not_offered');
  assert.equal(deny('customer_requests', { limit: 3, owner_id: users.other.id }).reason, 'invalid_arguments');
  assert.equal(evaluateCall({ id: 'c', name: 'customer_requests', input: { limit: 3 } }, offered, customer, config(), defaultLimits.maxToolCalls).reason, 'tool_budget');
  assert.equal(deny('customer_requests', { limit: 3 }).kind, 'execute');
  const withEffect = config({ enabledEffects: new Set(['service_request_submit']) });
  assert.equal(evaluateCall({ id: 'c', name: 'service_request_submit', input: { task_id: users.customer.id } }, selectTools(customer, withEffect), customer, withEffect, 0).kind, 'approval');
});

test('fingerprints are canonical over key order and sensitive to every bound value', async () => {
  assert.equal(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] }), '{"a":[1,{"c":3,"d":2}],"b":1}');
  const base = { tool: 'service_request_submit', actor: 'u', task_id: 't', base_version: 3, args: { description: 'a', location: 'b' } };
  assert.equal(await fingerprint(base), await fingerprint({ args: { location: 'b', description: 'a' }, base_version: 3, task_id: 't', actor: 'u', tool: 'service_request_submit' }));
  assert.notEqual(await fingerprint(base), await fingerprint({ ...base, base_version: 4 }));
  assert.notEqual(await fingerprint(base), await fingerprint({ ...base, actor: 'v' }));
  assert.notEqual(await fingerprint(base), await fingerprint({ ...base, args: { description: 'a', location: 'c' } }));
});

test('the TypeScript task state machine matches the authoritative SQL transition table', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261103130000_create_kael_runtime.sql', import.meta.url), 'utf8');
  const body = migration.split('create function nestscout_private.kael_task_transition_allowed')[1].split('$$;')[0];
  const sqlPairs = [...body.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map(match => `${match[1]}>${match[2]}`).sort();
  const tsPairs = Object.entries(taskTransitions).flatMap(([from, targets]) => targets.map(to => `${from}>${to}`)).sort();
  assert.deepEqual(sqlPairs, tsPairs);
  const task = { id: 'x', title: 't', kind: 'service_request', status: 'running', version: 1, summary: '', conversation_id: 'c', updated_at: '', artifact: { effect_required: true } };
  assert.deepEqual(checkModelTransition(task, 'completed'), { ok: false, reason: 'effect_not_observed' });
  assert.deepEqual(checkModelTransition({ ...task, status: 'waiting_for_approval' }, 'running'), { ok: false, reason: 'not_model_settable' });
  assert.deepEqual(checkModelTransition(task, 'waiting_for_approval'), { ok: false, reason: 'not_model_settable' });
  assert.deepEqual(checkModelTransition({ ...task, status: 'cancelled' }, 'running'), { ok: false, reason: 'invalid_transition' });
  assert.deepEqual(checkModelTransition({ ...task, artifact: { effect_required: true, effect_result: { status: 'succeeded', resource_kind: 'service_request', resource_id: 'r' } } }, 'completed'), { ok: true });
});

test('configuration never invents models, keeps spending opt-in and reports only setting names', () => {
  assert.equal(readKaelConfig({}), null);
  const keysOnly = readKaelConfig({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a', DEEPSEEK_API_KEY: 'secret-d', PERPLEXITY_API_KEY: 'secret-p' });
  assert.equal(keysOnly.anthropic, null, 'a key without an explicitly configured model is not a usable provider');
  assert.equal(keysOnly.deepseek, null);
  assert.equal(keysOnly.perplexity, null, 'web search needs explicit enablement');
  assert.deepEqual(keysOnly.route, []);
  const full = readKaelConfig({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a', KAEL_ANTHROPIC_MODEL: 'claude-opus-5-5', DEEPSEEK_API_KEY: 'secret-d', KAEL_DEEPSEEK_MODEL: 'deepseek-flash', KAEL_MODEL_ROUTE: 'deepseek,anthropic,openai', KAEL_ENABLED_EFFECTS: 'service_request_submit,mark_paid' });
  assert.deepEqual(full.route, ['deepseek', 'anthropic'], 'only approved providers are routable');
  assert.deepEqual([...full.enabledEffects], ['service_request_submit']);
  const report = JSON.stringify(configurationReport({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a' }));
  assert.ok(!report.includes('secret-a') && !report.includes('anon-key-for-tests'));
});

test('the gateway rejects unauthenticated, malformed and misconfigured requests without starting runs', async () => {
  const { handle, db } = harness();
  const post = (headers, body) => handle(new Request('https://edge.test/functions/v1/kael', { method: 'POST', headers, body }));
  assert.equal((await post({}, '{}')).status, 401);
  assert.equal((await post({ authorization: 'Bearer token-nobody-zzzzzzzzzzzzzzzzzzzzzzzz' }, JSON.stringify({ request_id: crypto.randomUUID(), conversation_id: null, mode: 'client', action: { type: 'message', text: 'hi' } }))).status, 401);
  assert.equal((await post({ authorization: `Bearer ${users.customer.token}` }, '{"request_id":"nope"}')).status, 400);
  assert.equal((await post({ authorization: `Bearer ${users.customer.token}` }, JSON.stringify({ request_id: crypto.randomUUID(), conversation_id: null, mode: 'admin', action: { type: 'message', text: 'hi' } }))).status, 400);
  assert.equal((await post({ authorization: `Bearer ${users.customer.token}` }, JSON.stringify({ request_id: crypto.randomUUID(), conversation_id: null, mode: 'client', action: { type: 'approve', approval_id: crypto.randomUUID(), fingerprint: 'a'.repeat(64) } }))).status, 400);
  assert.equal((await handle(new Request('https://edge.test/functions/v1/kael', { method: 'GET' }))).status, 405);
  assert.equal(db.runs.size, 0);
  const logs = [];
  const { createKaelHandler } = await import('../services/kael-core/src/gateway.ts');
  const misconfigured = createKaelHandler({ env: { ANTHROPIC_API_KEY: 'secret-a' }, log: event => logs.push(event) });
  const response = await misconfigured(new Request('https://edge.test', { method: 'POST', headers: { authorization: `Bearer ${users.customer.token}` }, body: '{}' }));
  assert.equal(response.status, 503);
  assert.ok(!JSON.stringify(logs).includes('secret-a'));
});

test('the mobile parser rejects malformed or out-of-contract events', () => {
  const base = { v: 1, run_id: users.customer.id, seq: 1 };
  assert.ok(parseKaelEvent(JSON.stringify({ ...base, type: 'message_delta', text: 'x' })));
  for (const bad of [
    'not json', JSON.stringify({ ...base, v: 2, type: 'message_delta', text: 'x' }), JSON.stringify({ ...base, seq: 0, type: 'message_delta', text: 'x' }),
    JSON.stringify({ ...base, type: 'run_completed_ok', text: 'x' }), JSON.stringify({ ...base, type: 'run_failed', code: 'pwned', message: 'x', retryable: true }),
    JSON.stringify({ ...base, type: 'task_updated', task: { id: 'x', title: 't', kind: 'k', status: 'done', version: 1, summary: '' } }),
    JSON.stringify({ ...base, type: 'approval_required', approval: { id: users.customer.id, task_id: users.customer.id, tool: 't', summary: 's', details: {}, fingerprint: 'short', expires_at: 'x' } }),
  ]) assert.equal(parseKaelEvent(bad), null, bad);
});
