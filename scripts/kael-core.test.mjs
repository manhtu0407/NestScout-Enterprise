import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { anthropicEndpoint, anthropicVersion, createAnthropicProvider } from '../services/kael-core/src/anthropic.ts';
import { configurationReport, defaultLimits, readKaelConfig } from '../services/kael-core/src/config.ts';
import { createDeepSeekProvider, deepseekEndpoint } from '../services/kael-core/src/deepseek.ts';
import { completeWithFallback, ProviderError } from '../services/kael-core/src/model.ts';
import { perplexitySearchEndpoint, searchWeb } from '../services/kael-core/src/perplexity.ts';
import { canonicalJson, confirmableTools, evaluateCall, fingerprint, selectTools } from '../services/kael-core/src/policy.ts';
import { createRest, createServerRpc, createSupabaseStore, kaelServerOperations } from '../services/kael-core/src/store.ts';
import { readSse } from '../services/kael-core/src/sse.ts';
import { checkModelTransition, taskTransitions } from '../services/kael-core/src/tasks.ts';
import { findTool, toolRegistry, validateArguments } from '../services/kael-core/src/tools.ts';
import { createKaelHandler } from '../services/kael-core/src/gateway.ts';
import { parseKaelEvent } from '../apps/mobile/src/features/shared/kael-events.ts';
import { baseEnv, harness, scriptedProvider, users } from './kael-test-harness.mjs';
import { developerPilotProviders, pilotRoute, pilotServedModels } from '../services/kael-core/src/developer-pilot.ts';
import { parsePilotAuthorization, parsePilotRenewal } from './kael-developer-pilot.mjs';

const encoder = new TextEncoder();

const pilotEnv = { ...baseEnv, SUPABASE_URL: 'http://127.0.0.1:23624', KAEL_DEVELOPER_PILOT: 'local_8085',
  KAEL_DEVELOPER_PILOT_ID: '00000000-0000-4000-8000-000000008085', DEEPSEEK_API_KEY: 'test-deepseek-key' };

function pilotStream(model = 'DeepSeek-V4.1-Flash-1017', usage = { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 40, prompt_cache_miss_tokens: 60, total_tokens: 110 }) {
  return sse([['message', { model, choices: [{ delta: { content: 'Chào bạn' }, finish_reason: null }] }],
    ['message', { model, choices: [{ delta: {}, finish_reason: 'stop' }] }],
    ...(usage ? [['message', { model, choices: [], usage }]] : [])]) + 'data: [DONE]\n\n';
}

const pilotResponse = body => new Response(body, { headers: { 'content-type': 'text/event-stream' } });

test('developer pilot requires local identity and isolates all unapproved providers and effects', () => {
  assert.equal(readKaelConfig({ ...pilotEnv, SUPABASE_URL: baseEnv.SUPABASE_URL }), null);
  assert.equal(readKaelConfig({ ...pilotEnv, KAEL_DEVELOPER_PILOT: 'enabled' }), null);
  assert.equal(readKaelConfig({ ...pilotEnv, KAEL_DEVELOPER_PILOT_ID: '' }), null);
  assert.equal(readKaelConfig({ ...pilotEnv, KAEL_DEEPSEEK_MODEL: 'unapproved-pro' }), null);
  const config = readKaelConfig({ ...pilotEnv, ANTHROPIC_API_KEY: 'test-key', KAEL_ANTHROPIC_MODEL: 'unapproved',
    KAEL_DEEPSEEK_MODEL: 'deepseek-flash', PERPLEXITY_API_KEY: 'test-key', KAEL_WEB_SEARCH: 'enabled',
    KAEL_ENABLED_EFFECTS: 'service_request_submit', KAEL_ESTIMATE_PREVIEW: 'local_only' });
  assert.deepEqual(config.route, ['deepseek']);
  assert.equal(config.deepseek.model, 'deepseek-flash');
  assert.equal(config.anthropic, null);
  assert.equal(config.perplexity, null);
  assert.equal(config.enabledEffects.size, 0);
  assert.equal(config.localEstimatePreview, false);
  assert.equal(config.limits.maxModelCalls, 3);
  assert.equal(pilotRoute('Xin chào, kể một chuyện vui').thinking, false);
  assert.equal(pilotRoute('Hãy suy nghĩ kỹ về hai phương án').thinking, true);
});

test('developer pilot authorization has no implicit cap, price, model, provider or lifetime', () => {
  const now = new Date('2026-11-05T04:00:00Z');
  const valid = { purpose: 'kael_developer_8085', model: 'deepseek-flash', provider: 'deepseek', owner_approved: true,
    cap_micro_usd: 1000000, max_calls: 20, rates_checked_at: '2026-11-05T03:55:00Z', expires_at: '2026-11-05T04:30:00Z',
    rate_source: 'https://api-docs.deepseek.com/quick_start/pricing/', input_rate: 0.3, cached_rate: 0.006, output_rate: 1.2 };
  assert.equal(parsePilotAuthorization(valid, now), valid);
  assert.equal(parsePilotAuthorization({ ...valid, max_calls: 35 }, now).max_calls, 35);
  for (const patch of [{ cap_micro_usd: 1000001 }, { model: 'deepseek-v4-pro' }, { provider: 'anthropic' },
    { owner_approved: false }, { input_rate: 0 }, { output_rate: undefined }, { cached_rate: NaN },
    { rates_checked_at: '2026-11-01T00:00:00Z' }, { expires_at: '2026-11-05T06:00:00Z' }, { max_calls: 0 }, { max_calls: 2147483648 }]) {
    assert.throws(() => parsePilotAuthorization({ ...valid, ...patch }, now));
  }
});

test('renewal requires a fresh explicit approval for this pilot and copies only approved fields', () => {
  const now = new Date('2026-11-05T03:00:00Z');
  const id = pilotEnv.KAEL_DEVELOPER_PILOT_ID;
  const approval = { approval_id: crypto.randomUUID(), pilot_id: id, approved_at: now.toISOString(),
    purpose: 'kael_developer_8085', provider: 'deepseek', model: 'deepseek-flash', owner_approved: true,
    cap_micro_usd: 1000000, max_calls: 3, expires_at: '2026-11-05T03:30:00Z', rates_checked_at: now.toISOString(),
    rate_source: 'https://api-docs.deepseek.com/quick_start/pricing/', input_rate: 0.3, cached_rate: 0.006, output_rate: 1.2 };
  assert.deepEqual(parsePilotRenewal({ ...approval, extra: 'discard' }, id, now), approval);
  assert.throws(() => parsePilotRenewal(approval, crypto.randomUUID(), now), /identify this pilot/);
  assert.throws(() => parsePilotRenewal({ ...approval, approved_at: '2026-11-05T02:00:00Z' }, id, now), /one hour/);
});

test('local Edge probe identifies its pilot configuration without dispatching or exposing a key', async () => {
  const generation = '2026-11-05T03:00:00.123456+00:00';
  const worker = crypto.randomUUID();
  const env = { ...pilotEnv, KAEL_PILOT_GENERATION: generation, KAEL_PILOT_WORKER_ID: worker };
  const handler = createKaelHandler({ env, fetcher: async () => { throw new Error('Probe attempted a network call'); } });
  const request = new Request('http://localhost/functions/v1/kael', { headers: { 'x-kael-pilot-probe': '1' } });
  const result = await handler(request);
  assert.deepEqual(await result.json(), { pilot_id: env.KAEL_DEVELOPER_PILOT_ID, generation, worker_id: worker,
    credential_loaded: true, model: 'deepseek-flash' });
  const invalid = await createKaelHandler({ env: { ...env, KAEL_DEEPSEEK_MODEL: 'wrong-model' } })(request);
  assert.equal(invalid.status, 503);
  assert.deepEqual(await invalid.json(), { status: 'EDGE_INVALID_CONFIG' });
  assert.equal((await createKaelHandler({ env: baseEnv })(request)).status, 405);
});

test('strict Flash streams validate actual identity and final cache-aware usage while streaming text', async () => {
  const config = { ...deepseekConfig, verifiedModels: pilotServedModels };
  const seen = [];
  let release;
  const continued = new Promise(resolve => { release = resolve; });
  const chunks = pilotStream().split('event: message');
  const body = new ReadableStream({ async start(controller) {
    controller.enqueue(encoder.encode('event: message' + chunks[1]));
    await continued;
    controller.enqueue(encoder.encode(chunks.slice(2).map(c => 'event: message' + c).join('')));
    controller.close();
  } });
  const provider = createDeepSeekProvider(config, async () => pilotResponse(body));
  const turn = await provider.complete(request(), delta => { seen.push(delta); release(); });
  assert.deepEqual(seen, ['Chào bạn']);
  assert.equal(turn.model, 'DeepSeek-V4.1-Flash-1017');
  assert.equal(turn.requestedModel, 'deepseek-flash');
  assert.deepEqual(turn.usage, { inputTokens: 100, cachedInputTokens: 40, outputTokens: 10 });
});

test('strict Flash denies foreign models, absent or inconsistent usage and truncated SSE', async () => {
  const validUsage = { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 40, prompt_cache_miss_tokens: 60, total_tokens: 110 };
  for (const payload of [pilotStream('deepseek-v4-pro'), pilotStream('', validUsage), pilotStream(undefined, null),
    pilotStream(undefined, { ...validUsage, total_tokens: 111 }), pilotStream(undefined, { ...validUsage, prompt_cache_hit_tokens: -1 }),
    pilotStream(undefined, { ...validUsage, completion_tokens: '10' }), pilotStream().replace('data: [DONE]\n\n', ''),
    pilotStream().replace('DeepSeek-V4.1-Flash-1017', 'deepseek-flash')]) {
    const provider = createDeepSeekProvider({ ...deepseekConfig, verifiedModels: pilotServedModels }, async () => pilotResponse(streamOf([payload])));
    await assert.rejects(provider.complete(request(), () => {}), error => error instanceof ProviderError);
  }
});

test('pilot reserves before transport, records real served identity and reconciles without fallback', async () => {
  const actions = [];
  const providers = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), 'suy nghĩ kỹ', async (url, init) => {
    const body = JSON.parse(init.body);
    if (url.endsWith('/kael_pilot_charge')) {
      actions.push(body.p_action);
      if (body.p_action === 'settle') {
        assert.equal(body.p_model, 'DeepSeek-V4.1-Flash-1017');
        assert.equal(body.p_cached, 40);
      }
      return Response.json({ ok: true });
    }
    assert.equal(url, deepseekEndpoint);
    assert.equal(init.redirect, 'error');
    assert.equal(body.thinking.type, 'enabled');
    actions.push('transport');
    return pilotResponse(streamOf([pilotStream()]));
  });
  assert.equal(providers.length, 1);
  await providers[0].complete(request(), () => {});
  assert.deepEqual(actions, ['reserve', 'transport', 'settle']);
});

test('budget refusal, reservation outage, missing key and oversized input never reach a provider', async () => {
  for (const response of [Response.json({ ok: false }), new Response('', { status: 503 })]) {
    let calls = 0;
    const providers = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), '', async url => {
      assert.ok(url.endsWith('/kael_pilot_charge'));
      calls++;
      return response;
    });
    await assert.rejects(providers[0].complete(request(), () => {}), error => error.kind === 'budget');
    assert.equal(calls, 1);
  }
  const noKey = readKaelConfig({ ...pilotEnv, DEEPSEEK_API_KEY: '' });
  assert.deepEqual(developerPilotProviders(noKey, users.customer.id, crypto.randomUUID(), '', () => { throw new Error('unexpected network'); }), []);
  const oversized = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), '', () => { throw new Error('unexpected network'); });
  await assert.rejects(oversized[0].complete(request({ system: 'x'.repeat(60001) }), () => {}), error => error.kind === 'budget');
});

test('uncertain usage holds the reservation and stops further paid requests after partial output', async () => {
  const actions = [];
  const seen = [];
  const provider = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), '', async (url, init) => {
    if (url === deepseekEndpoint) return pilotResponse(streamOf([pilotStream(undefined, null)]));
    actions.push(JSON.parse(init.body).p_action);
    return Response.json({ ok: true });
  })[0];
  await assert.rejects(provider.complete(request(), delta => seen.push(delta)), error => error.kind === 'incomplete');
  assert.deepEqual(actions, ['reserve', 'uncertain']);
  assert.deepEqual(seen, ['Chào bạn']);
});

test('pilot diagnostics distinguish HTTP rejection, timeout and invalid SSE without logging provider content', async () => {
  const fixtures = [
    ['auth', 401, () => new Response('private provider body', { status: 401 })],
    ['timeout', undefined, () => { throw new DOMException('private transport detail', 'TimeoutError'); }],
    ['incomplete', undefined, () => pilotResponse('data: malformed\n\n')],
  ];
  for (const [kind, status, response] of fixtures) {
    const diagnostics = [];
    const actions = [];
    const provider = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), '', async (url, init) => {
      if (url === deepseekEndpoint) return response();
      actions.push(JSON.parse(init.body).p_action);
      return Response.json({ ok: true });
    }, (...details) => diagnostics.push(details))[0];
    await assert.rejects(provider.complete(request(), () => {}), error => error.kind === kind);
    assert.deepEqual(diagnostics, [[kind, status]]);
    assert.deepEqual(actions, ['reserve', 'uncertain']);
  }
});

test('paid stream lifecycle violations retain reservations rather than settling a fabricated completion', async () => {
  const model = 'DeepSeek-V4.1-Flash-1017';
  const extraChoice = sse([['message', { model, choices: [{ delta: { content: ' forbidden after terminal' }, finish_reason: null }] }]]);
  const valid = pilotStream();
  const afterFinish = valid.indexOf('event: message', valid.indexOf('finish_reason":"stop"'));
  for (const payload of [valid.slice(0, afterFinish) + extraChoice + valid.slice(afterFinish),
    valid.replace('finish_reason":"stop"', 'finish_reason":"unexpected_reason"'),
    valid.replace('finish_reason":"stop"', 'finish_reason":["stop"]'),
    valid.replace('finish_reason":"stop"', 'finish_reason":"tool_calls"')]) {
    const actions = [];
    let visible = '';
    const provider = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), '', async (url, init) => {
      if (url === deepseekEndpoint) return pilotResponse(streamOf([payload]));
      actions.push(JSON.parse(init.body).p_action);
      return Response.json({ ok: true });
    })[0];
    await assert.rejects(provider.complete(request(), delta => { visible += delta; }), error => error.kind === 'incomplete');
    assert.equal(visible, 'Chào bạn');
    assert.deepEqual(actions, ['reserve', 'uncertain']);
  }
});

test('strict Flash accepts a consistent thinking tool stream without exposing reasoning as visible text', async () => {
  const model = 'DeepSeek-V4.1-Flash-1017';
  const payload = sse([
    ['message', { model, choices: [{ delta: { reasoning_content: 'private ephemeral reasoning' }, finish_reason: null }] }],
    ['message', { model, choices: [{ delta: { tool_calls: [{ index: 0, id: 'read-1', function: { name: 'knowledge_search', arguments: '{"query":"an toàn"}' } }] }, finish_reason: null }] }],
    ['message', { model, choices: [{ delta: {}, finish_reason: 'tool_calls' }] }],
    ['message', { model, choices: [], usage: { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 40, prompt_cache_miss_tokens: 60, total_tokens: 110 } }],
  ]) + 'data: [DONE]\n\n';
  const provider = createDeepSeekProvider({ ...deepseekConfig, thinking: true, verifiedModels: pilotServedModels }, async () => pilotResponse(streamOf([payload])));
  const visible = [];
  const result = await provider.complete(request(), delta => visible.push(delta));
  assert.equal(result.stopReason, 'tool_use');
  assert.deepEqual(result.toolCalls, [{ id: 'read-1', name: 'knowledge_search', input: { query: 'an toàn' } }]);
  assert.deepEqual(visible, []);
  assert.equal(result.usage.outputTokens, 10);
});

test('lost accounting acknowledgements fail as budget errors and request a durable halt after visible output', async () => {
  const actions = [];
  const visible = [];
  const provider = developerPilotProviders(readKaelConfig(pilotEnv), users.customer.id, crypto.randomUUID(), '', async (url, init) => {
    if (url === deepseekEndpoint) return pilotResponse(streamOf([pilotStream()]));
    const action = JSON.parse(init.body).p_action;
    actions.push(action);
    if (action === 'settle') throw new TypeError('Synthetic lost settlement acknowledgement');
    return Response.json({ ok: action === 'reserve' });
  })[0];
  await assert.rejects(provider.complete(request(), delta => visible.push(delta)), error => error instanceof ProviderError && error.kind === 'budget');
  assert.deepEqual(actions, ['reserve', 'settle', 'uncertain']);
  assert.deepEqual(visible, ['Chào bạn']);
});

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

test('Anthropic adapter attributes the turn to the model the stream reports, never to an invented one', async () => {
  const served = anthropicStream.replace('"message":{"usage"', '"message":{"model":"claude-sonnet-5-5","usage"');
  assert.notEqual(served, anthropicStream);
  const turn = await createAnthropicProvider(anthropicConfig, recordingFetch(new Response(streamOf([served]), { status: 200 })).fetcher).complete(request(), () => {});
  assert.equal(turn.model, 'claude-sonnet-5-5', 'a server-side fallback is recorded as the model that answered');
  assert.equal(turn.requestedModel, 'claude-opus-5-5');
  assert.equal(turn.providerState.model, 'claude-sonnet-5-5');

  const replay = recordingFetch(new Response(streamOf([sse([['message_stop', { type: 'message_stop' }]])]), { status: 200 }));
  await createAnthropicProvider(anthropicConfig, replay.fetcher).complete(request({ transcript: [{ role: 'user', text: 'a' }, { role: 'assistant', text: turn.text, toolCalls: turn.toolCalls, providerState: turn.providerState }] }), () => {});
  const rebuilt = replay.calls[0].body.messages[1].content;
  assert.equal(rebuilt.some(block => block.type === 'thinking'), false, 'thinking from the fallback model is not replayed to the requested model');
  assert.deepEqual(rebuilt.map(block => block.type), ['text', 'tool_use'], 'the turn is rebuilt from its text and tool calls');

  const silent = await createAnthropicProvider(anthropicConfig, recordingFetch(new Response(streamOf([anthropicStream]), { status: 200 })).fetcher).complete(request(), () => {});
  assert.equal(silent.model, 'claude-opus-5-5', 'without a reported model the requested model is kept, not a guessed fallback');
  const odd = anthropicStream.replace('"message":{"usage"', '"message":{"model":"bad model\\n","usage"');
  assert.equal((await createAnthropicProvider(anthropicConfig, recordingFetch(new Response(streamOf([odd]), { status: 200 })).fetcher).complete(request(), () => {})).model, 'claude-opus-5-5');
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
  const noTerminator = deepseekChunks([{ choices: [{ index: 0, delta: { content: 'Xong' }, finish_reason: 'stop' }] }]);
  await assert.rejects(createDeepSeekProvider(deepseekConfig, recordingFetch(new Response(streamOf([noTerminator]), { status: 200 })).fetcher).complete(request(), () => {}),
    error => error.kind === 'incomplete' && error.outputStarted, 'a finish reason without the [DONE] terminator is an incomplete stream');
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
  assert.deepEqual(names(customer), ['task_create', 'task_update', 'service_request_draft', 'customer_requests', 'knowledge_search', 'price_estimate_preview']);
  assert.ok(names(customer, config({ enabledEffects: new Set(['service_request_submit']) })).includes('service_request_submit'));
  assert.ok(names(customer, config({ perplexity: { apiKey: 'k', maxResults: 5, timeoutMs: 1 } })).includes('web_search'));
  assert.deepEqual(names({ ...customer, mode: 'worker' }), ['task_create', 'task_update', 'knowledge_search', 'price_estimate_preview'], 'worker mode without worker capability exposes no worker data');
  assert.deepEqual(names({ ...customer, mode: 'worker', capabilities: new Set(['customer', 'worker']) }), ['task_create', 'task_update', 'worker_jobs', 'worker_earnings', 'worker_job_status', 'knowledge_search', 'price_estimate_preview']);

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

test('server configuration defaults to Flash and keeps other routes and effects explicit', () => {
  assert.equal(readKaelConfig({}), null);
  const keysOnly = readKaelConfig({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a', DEEPSEEK_API_KEY: 'secret-d', PERPLEXITY_API_KEY: 'secret-p' });
  assert.equal(keysOnly.anthropic, null, 'a key without an explicitly configured model is not a usable provider');
  assert.equal(keysOnly.deepseek.model, 'deepseek-flash');
  assert.equal(keysOnly.perplexity, null, 'web search needs explicit enablement');
  assert.deepEqual(keysOnly.route, ['deepseek']);
  assert.deepEqual(readKaelConfig({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a', KAEL_ANTHROPIC_MODEL: 'claude-opus-5-5' }).route, [],
    'Anthropic is not an implicit fallback when Flash is unavailable');
  const full = readKaelConfig({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a', KAEL_ANTHROPIC_MODEL: 'claude-opus-5-5', DEEPSEEK_API_KEY: 'secret-d', KAEL_DEEPSEEK_MODEL: 'deepseek-flash', KAEL_MODEL_ROUTE: 'deepseek,anthropic,openai', KAEL_ENABLED_EFFECTS: 'service_request_submit,mark_paid' });
  assert.deepEqual(full.route, ['deepseek', 'anthropic'], 'only approved providers are routable');
  assert.deepEqual([...full.enabledEffects], ['service_request_submit']);
  const report = JSON.stringify(configurationReport({ ...baseEnv, ANTHROPIC_API_KEY: 'secret-a' }));
  assert.ok(!report.includes('secret-a') && !report.includes('anon-key-for-tests') && !report.includes('server-key-for-tests'));
  const withoutServer = { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: '' };
  assert.equal(readKaelConfig(withoutServer), null, 'the gateway does not run without its server credential');
  assert.match(configurationReport(withoutServer).gateway, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('the normal authenticated Edge route reuses a server credential across conversations without a pilot budget', async () => {
  let calls = 0;
  const { message, db } = harness({ providers: null, env: { DEEPSEEK_API_KEY: 'test-server-credential' },
    wrapFetcher: next => async (url, init) => {
      assert.ok(!url.endsWith('/kael_pilot_charge'), 'Hosted inference has no dependency on the local pilot ledger');
      if (url !== deepseekEndpoint) return next(url, init);
      assert.equal(init.headers.authorization, 'Bearer test-server-credential');
      assert.equal(JSON.parse(init.body).model, 'deepseek-flash');
      calls++;
      return pilotResponse(streamOf([pilotStream()]));
    } });
  for (const prompt of ['Chào Kael', 'Tôi nên bắt đầu từ đâu?']) {
    const result = await message(users.customer, prompt);
    assert.equal(result.events.at(-1).type, 'run_completed');
    assert.equal(result.events.at(-1).text, 'Chào bạn');
  }
  assert.equal(calls, 2);
  assert.equal(db.conversations.size, 2);
  assert.equal(db.messages.filter(message => message.role === 'assistant' && message.content === 'Chào bạn').length, 2);
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
  const misconfigured = createKaelHandler({ env: { ANTHROPIC_API_KEY: 'secret-a' }, log: event => logs.push(event) });
  const response = await misconfigured(new Request('https://edge.test', { method: 'POST', headers: { authorization: `Bearer ${users.customer.token}` }, body: '{}' }));
  assert.equal(response.status, 503);
  assert.ok(!JSON.stringify(logs).includes('secret-a'));
});

test('the mobile parser rejects malformed or out-of-contract events', () => {
  const base = { v: 1, run_id: users.customer.id, seq: 1 };
  assert.ok(parseKaelEvent(JSON.stringify({ ...base, type: 'message_delta', text: 'x' })));
  const approval = { id: users.customer.id, task_id: users.customer.id, tool: 't', summary: 's', details: {}, fingerprint: 'a'.repeat(64) };
  assert.ok(parseKaelEvent(JSON.stringify({ ...base, type: 'approval_required', approval: { ...approval, kind: 'confirm', expires_at: '2026-11-03T04:00:00Z' } })));
  assert.ok(parseKaelEvent(JSON.stringify({ ...base, type: 'approval_required', approval: { ...approval, kind: 'reconcile', expires_at: null } })));
  for (const bad of [
    JSON.stringify({ ...base, type: 'approval_required', approval: { ...approval, expires_at: '2026-11-03T04:00:00Z' } }),
    JSON.stringify({ ...base, type: 'approval_required', approval: { ...approval, kind: 'confirm', expires_at: null } }),
    JSON.stringify({ ...base, type: 'approval_required', approval: { ...approval, kind: 'reconcile', expires_at: '2026-11-03T04:00:00Z' } }),
    JSON.stringify({ ...base, type: 'approval_required', approval: { ...approval, kind: 'execute', expires_at: null } }),
    'not json', JSON.stringify({ ...base, v: 2, type: 'message_delta', text: 'x' }), JSON.stringify({ ...base, seq: 0, type: 'message_delta', text: 'x' }),
    JSON.stringify({ ...base, type: 'run_completed_ok', text: 'x' }), JSON.stringify({ ...base, type: 'run_failed', code: 'pwned', message: 'x', retryable: true }),
    JSON.stringify({ ...base, type: 'task_updated', task: { id: 'x', title: 't', kind: 'k', status: 'done', version: 1, summary: '' } }),
    JSON.stringify({ ...base, type: 'approval_required', approval: { id: users.customer.id, task_id: users.customer.id, tool: 't', summary: 's', details: {}, fingerprint: 'short', expires_at: 'x' } }),
  ]) assert.equal(parseKaelEvent(bad), null, bad);
});

const validInputs = {
  task_create: { title: 'Viết thư', kind: 'writing', status: 'running', note: '' },
  task_update: { task_id: users.customer.id, status: 'paused', note: '' },
  service_request_draft: { task_id: users.customer.id, description: 'Máy lạnh rò nước', location: '', preferred_time: '', missing: ['location'] },
  service_request_submit: { task_id: users.customer.id },
  customer_requests: { limit: 3 },
  worker_jobs: {},
  worker_earnings: {},
  worker_job_status: { job_id: users.customer.id },
  web_search: { query: 'giá điện sinh hoạt' },
  knowledge_search: { query: 'Máy lạnh chảy nước' },
  price_estimate_preview: { case_id: 'cleaning.desk-surface', scope_confirmed: true, area_m2: 1, units: 1, material: 'coated_wood', floor_access: true, clear_surface: true, no_visible_damage: true },
};

test('each operation has one execution class and only explicit confirmation turns a call into an approval', () => {
  assert.deepEqual(Object.keys(validInputs), toolRegistry.map(tool => tool.id), 'every registered operation has a classification case');
  const classes = ['internal_prepare', 'authorized_read', 'explicit_confirmation'];
  const all = config({ enabledEffects: new Set(['service_request_submit']), perplexity: { apiKey: 'k', maxResults: 5, timeoutMs: 1 } });
  for (const tool of toolRegistry) {
    assert.ok(classes.includes(tool.executionClass), tool.id);
    assert.equal(tool.effect !== null, tool.executionClass === 'explicit_confirmation', `${tool.id}: an owner gate exists exactly for confirmed operations`);
    assert.equal(tool.sideEffect === 'consequential', tool.executionClass === 'explicit_confirmation', tool.id);
    const actor = { userId: users.worker.id, capabilities: new Set(['customer', 'worker']), mode: tool.modes[0] };
    const decision = evaluateCall({ id: 'c', name: tool.id, input: validInputs[tool.id] }, selectTools(actor, all), actor, all, 0);
    assert.equal(decision.kind, tool.executionClass === 'explicit_confirmation' ? 'approval' : 'execute', tool.id);
  }
  const customer = { userId: users.customer.id, capabilities: new Set(['customer']), mode: 'client' };
  const gated = config({ enabledEffects: new Set(['service_request_submit']) });
  assert.deepEqual(confirmableTools(customer, gated), ['service_request_submit']);
  assert.deepEqual(confirmableTools(customer, config()), [], 'a disabled owner gate leaves nothing to confirm');
  assert.deepEqual(confirmableTools({ ...customer, mode: 'worker' }, gated), [], 'worker mode cannot confirm a customer operation');
  assert.deepEqual(confirmableTools({ ...customer, capabilities: new Set() }, gated), [], 'a revoked capability leaves nothing to confirm');
});

test('the workflow reference maps every Kael capability exactly as the registry and executor define it', () => {
  const doc = readFileSync(new URL('../docs/service-workflow.md', import.meta.url), 'utf8');
  const executor = ['executor.ts', 'intelligence.ts'].map(file => readFileSync(new URL(`../services/kael-core/src/${file}`, import.meta.url), 'utf8')).join('\n');
  const section = doc.split('\n## Kael capability boundary\n')[1].split('\n## ')[0];
  const rows = [...section.matchAll(/^\| `([a-z_]+)` \| ([a-z_]+) \| ([a-z_]+) \| ([^|]+) \| ([^|]+) \|/gm)]
    .map(match => ({ id: match[1], executionClass: match[2], resource: match[3], permission: match[4], command: match[5] }));
  assert.deepEqual(rows.map(({ id, executionClass, resource }) => ({ id, executionClass, resource })),
    toolRegistry.map(tool => ({ id: tool.id, executionClass: tool.executionClass, resource: tool.resource })));
  const documentedCommands = new Set();
  for (const tool of toolRegistry) {
    const row = rows.find(item => item.id === tool.id);
    const label = `${tool.id} permission column`;
    assert.equal(/Customer capability/.test(row.permission), tool.requires === 'customer', label);
    assert.equal(/Worker capability/.test(row.permission), tool.requires === 'worker', label);
    assert.equal(/client mode/.test(row.permission), tool.modes.length === 1 && tool.modes[0] === 'client', label);
    assert.equal(/worker mode/.test(row.permission), tool.modes.length === 1 && tool.modes[0] === 'worker', label);
    assert.equal(/KAEL_ENABLED_EFFECTS/.test(row.permission), tool.effect !== null, label);
    assert.equal(/KAEL_WEB_SEARCH/.test(row.permission), tool.needsWebSearch, label);
    for (const [, command] of row.command.matchAll(/`([a-z_]+)`/g)) {
      documentedCommands.add(command);
      assert.match(executor, new RegExp(`['\`](rpc/)?${command}[?'\`]`), `${tool.id}: documented command ${command} is what the executor calls`);
    }
  }
  const called = new Set([...executor.matchAll(/'rpc\/([a-z_]+)'|`([a-z_]+)\?/g)].map(match => match[1] ?? match[2]));
  assert.deepEqual([...called].sort(), [...documentedCommands].sort(), 'every backend command the executor calls is documented');
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const serverAuthorization = `Bearer ${baseEnv.SUPABASE_SERVICE_ROLE_KEY}`;
const isServerOperation = path => kaelServerOperations.some(operation => path === `/rest/v1/rpc/${operation}`);

test('Kael-internal writes leave only through named server RPCs bound to the verified account, never with the user token', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, authorization: init.headers.authorization, apikey: init.headers.apikey, body: init.body ? JSON.parse(init.body) : null });
    if (path.endsWith('/kael_actor_capabilities')) return json({ customer: true, worker: false });
    if (path.endsWith('/kael_messages') || path.endsWith('/kael_context_tasks')) return json([]);
    return json({ status: 'ok' });
  };
  const cfg = readKaelConfig(baseEnv);
  const server = createServerRpc(cfg, fetcher);
  const store = createSupabaseStore(createRest(cfg, users.customer.token, fetcher), server, users.customer.id);
  const signal = AbortSignal.timeout(5000);
  const id = users.other.id;
  await store.capabilities(signal);
  await store.loadContext(id, 'client', 4, signal);
  await store.startRun(id, null, 'client', 'Xin chào', signal);
  await store.finishRun({ runId: id, status: 'completed', text: 'x', complete: true, provider: null, model: null, inputTokens: 0, outputTokens: 0, steps: 1, error: null });
  await store.saveTask({ taskId: null, conversationId: id, runId: id, expectedVersion: null, title: 't', kind: 'general', status: 'running', summary: '', artifact: {}, event: 'created' });
  await store.recordTool({ runId: id, callId: 'c', taskId: null, tool: 'task_create', sideEffect: 'internal', outcome: 'succeeded', fingerprint: 'a'.repeat(64), error: null });
  await store.requestApproval({ runId: id, taskId: id, expectedVersion: 1, tool: 'service_request_submit', args: {}, fingerprint: 'a'.repeat(64), summary: 's', details: { 'Mô tả': 'x' }, ttlSeconds: 900 });
  await store.consumeApproval(id, id, 'a'.repeat(64), ['service_request_submit'], 'reconcile');
  await store.completeApproval(id, id, 'failed', { reason: 'x' });
  await store.rejectApproval(id, id, 'b'.repeat(64));

  const internal = calls.filter(entry => isServerOperation(entry.path));
  assert.deepEqual(internal.map(entry => entry.path.split('/rpc/')[1]).sort(), [...kaelServerOperations].sort());
  for (const entry of internal) {
    assert.equal(entry.authorization, serverAuthorization, entry.path);
    assert.equal(entry.apikey, baseEnv.SUPABASE_SERVICE_ROLE_KEY, entry.path);
    assert.equal(entry.body.p_actor, users.customer.id, `${entry.path} carries the verified account, not a caller-chosen one`);
  }
  const userScoped = calls.filter(entry => !isServerOperation(entry.path));
  assert.equal(userScoped.length, 3);
  for (const entry of userScoped) {
    assert.equal(entry.authorization, `Bearer ${users.customer.token}`, entry.path);
    assert.equal(entry.apikey, baseEnv.SUPABASE_ANON_KEY, entry.path);
  }
  assert.deepEqual(internal.find(entry => entry.path.endsWith('kael_consume_approval')).body.p_allowed_tools, ['service_request_submit']);
  assert.equal(internal.find(entry => entry.path.endsWith('kael_consume_approval')).body.p_intent, 'reconcile', 'the store forwards whether the user approved or only asked to reconcile');
  const bodyOf = name => internal.find(entry => entry.path.endsWith(name)).body;
  assert.deepEqual(bodyOf('kael_complete_approval'), { p_actor: users.customer.id, p_run_id: id, p_approval_id: id, p_outcome: 'failed', p_result: { reason: 'x' } });
  assert.deepEqual(bodyOf('kael_reject_approval'), { p_actor: users.customer.id, p_run_id: id, p_approval_id: id, p_fingerprint: 'b'.repeat(64) }, 'rejecting carries the run and fingerprint like approving');
  assert.deepEqual(bodyOf('kael_request_approval').p_details, { 'Mô tả': 'x' });
  assert.throws(() => server('service_requests', {}), /HTTP 403/, 'the server credential cannot reach an arbitrary table');
  assert.throws(() => server('submit_service_request', {}), /HTTP 403/, 'the server credential cannot run a business command');
});

test('an opaque sb_secret_ key is refused instead of being sent as a bearer JWT', () => {
  const placeholder = 'placeholder'.repeat(2);
  const opaque = { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: ['sb', 'secret', placeholder].join('_') };
  assert.equal(readKaelConfig(opaque), null);
  const report = configurationReport(opaque);
  assert.match(report.gateway, /legacy service-role JWT; sb_secret_ keys are not supported yet/);
  assert.ok(!JSON.stringify(report).includes(placeholder));
});

test('the gateway persists runs only through the server boundary for the account Auth verified, whatever the request claims', async () => {
  const runId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    const authorization = init.headers?.authorization;
    calls.push({ path, authorization, body: init.body ? JSON.parse(init.body) : null });
    if (path === '/auth/v1/user') return authorization === `Bearer ${users.customer.token}` ? json({ id: users.customer.id, is_anonymous: false }) : json({}, 401);
    if (isServerOperation(path) && authorization !== serverAuthorization) return json({ message: 'permission denied' }, 403);
    if (path === '/rest/v1/rpc/kael_actor_capabilities') return json({ customer: true, worker: false });
    if (path === '/rest/v1/rpc/kael_start_run') return json({ status: 'started', run_id: runId, conversation_id: conversationId });
    if (path === '/rest/v1/kael_messages') return json([{ role: 'user', content: 'Xin chào', status: 'complete' }]);
    if (path === '/rest/v1/rpc/kael_context_tasks') return json([]);
    if (path === '/rest/v1/rpc/kael_finish_run') return json(true);
    return json({}, 404);
  };
  const provider = scriptedProvider('anthropic', [{ text: ['Chào bạn!'] }]);
  const handle = createKaelHandler({ env: baseEnv, fetcher, log: () => {}, providers: () => [provider] });
  const response = await handle(new Request('https://edge.test/functions/v1/kael', {
    method: 'POST',
    headers: { authorization: `Bearer ${users.customer.token}` },
    body: JSON.stringify({ request_id: crypto.randomUUID(), conversation_id: null, mode: 'client', p_actor: users.other.id, action: { type: 'message', text: 'Xin chào', p_actor: users.other.id } }),
  }));
  const events = (await response.text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(events.at(-1).type, 'run_completed');
  const writes = calls.filter(entry => isServerOperation(entry.path));
  assert.deepEqual(writes.map(entry => entry.path.split('/rpc/')[1]), ['kael_start_run', 'kael_finish_run']);
  assert.ok(writes.every(entry => entry.authorization === serverAuthorization && entry.body.p_actor === users.customer.id));
  assert.ok(calls.filter(entry => entry.authorization === serverAuthorization).every(entry => writes.includes(entry)), 'the server credential is used for nothing else');
  assert.ok(!JSON.stringify(events).includes(baseEnv.SUPABASE_SERVICE_ROLE_KEY));
});
