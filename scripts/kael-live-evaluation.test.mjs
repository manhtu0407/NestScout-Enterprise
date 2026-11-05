import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test, mock } from 'node:test';
import { canonicalJson, fingerprint } from '../services/kael-core/src/policy.ts';
import { knowledgeSnapshot, knowledgeSeedSnapshot } from '../services/kael-core/src/knowledge-sources.ts';
import { root } from './tool-path.mjs';
import { anchorReviewSheet, authorizationTemplate, exportAnchorReview, liveRubric } from './kael-live-review.mjs';
import { assertReadTarget, loopbackOrigin, makePlan, moneyUnits, PilotBudget, pilotEndpoints, pilotLimits, preflight, rejectOverrides, verifyEnvelope } from './kael-live-policy.mjs';
import { inspectStream, mockModels, mockPilotProvider, mockStream, prepareRequest } from './kael-live-provider.mjs';
import { dryRun, privatePath, readPrivate, sanitizeVisible } from './kael-live-evaluation.mjs';
import { loadFixture, gradeScenario } from './kael-intelligence-grading.mjs';
import { evaluationBoundary } from './kael-intelligence-evaluation.mjs';
import { call, harness, scriptedProvider, terminal, users } from './kael-test-harness.mjs';

const limits = { max_total_model_requests: 8, max_requests_per_scenario: 4, max_input_tokens_per_call: 65536, max_output_tokens_per_call: 512, max_total_tokens: 400000, max_wall_seconds: 30, max_total_spend_usd: '1' };
const rates = { input_usd_per_million: '1', output_usd_per_million: '2', cache_read_usd_per_million: '0.1', cache_write_usd_per_million: '1.25' };
const usage = { input: 100, output: 20, cache_read: 10, cache_write: 5, reasoning: 0 };
const budget = (overrides = {}, options = {}) => new PilotBudget({ ...limits, ...overrides }, rates, options);
const envelope = (payload, id, key) => ({ payload, signer_id: id, signature: sign(null, Buffer.from(canonicalJson(payload)), key).toString('base64') });
const turn = { text: 'Chào bạn.', toolCalls: [], stopReason: 'end_turn' };
const inspect = (wire, model) => inspectStream(new Response(wire), model, AbortSignal.timeout(5000));

test('review exports exactly the unchanged 20 anchors with no human decisions or fabricated holdout', async () => {
  const sheet = await anchorReviewSheet();
  const registry = loadFixture('kael-intelligence-registry');
  assert.deepEqual(sheet.anchors.map(a => a.scenario_id), registry.anchors);
  assert.equal(sheet.anchors.length, 20);
  for (const a of sheet.anchors) {
    const original = loadFixture('kael-intelligence-scenarios').find(s => s.id === a.scenario_id);
    assert.deepEqual(a.turns, original.turns);
    assert.deepEqual(a.ground_truth, original.ground_truth);
    assert.equal(a.human_reviewed, false);
    assert.equal(a.reviewer_id, null);
    assert.ok(Object.values(a.dimensions).every(v => v === null));
  }
  assert.deepEqual(sheet.holdout.probes, []);
  assert.equal(liveRubric.dimensions.length, 5);
  assert.ok(liveRubric.illustrative_examples.length >= 2);
  const relative = `test-review-${randomUUID()}`;
  const directory = privatePath(relative);
  try {
    const exported = await exportAnchorReview(directory);
    assert.equal(exported.status, 'PENDING_HUMAN_REVIEW');
    assert.equal(readFileSync(path.join(directory, 'anchor-review.csv'), 'utf8').trim().split('\n').length, 21);
    assert.equal(readPrivate(`${relative}/review-envelope-template.json`).signature, null);
    const original = readFileSync(path.join(directory, 'anchor-review.json'), 'utf8');
    await assert.rejects(exportAnchorReview(directory), /Review destination already exists/u);
    assert.equal(readFileSync(path.join(directory, 'anchor-review.json'), 'utf8'), original);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('pilot selects versioned canonical scenarios and retains synthetic and historical provenance', async () => {
  const scenarios = loadFixture('kael-intelligence-scenarios');
  assert.equal(scenarios.length, 120);
  assert.equal(scenarios.find(s => s.id === 'grounded_knowledge.015').version, 2);
  assert.equal(scenarios.find(s => s.id === 'grounded_knowledge.015').ground_truth.knowledge_expected, 'optional');
  assert.equal(loadFixture('kael-retrieval-probes').length, 72);
  assert.equal((await knowledgeSnapshot()).filter(s => s.source_kind === 'synthetic_case').length, 180);
  assert.deepEqual((await knowledgeSeedSnapshot()).filter(s => s.source_id === 'product.provenance').map(s => s.revision), [1, 2, 3]);
});

test('dry-run uses both real adapters inside the real Runtime, with dummy keys and zero global network', async () => {
  let outbound = 0;
  const spy = mock.method(globalThis, 'fetch', async () => { outbound++; throw new Error('network forbidden in test'); });
  try {
    const env = { ANTHROPIC_API_KEY: 'dummy-present', DEEPSEEK_API_KEY: 'dummy-present' };
    const isolated = [];
    const a = await dryRun({ env, observeTrial: value => isolated.push(value) });
    const b = await dryRun({ env });
    assert.equal(outbound, 0);
    assert.equal(a.live_provider_status, 'LIVE_PROVIDER_NOT_RUN');
    assert.equal(a.trials, 50);
    assert.equal(a.mock_adapter_requests, 66);
    assert.equal(a.passed, true);
    assert.equal(new Set(isolated.map(r => r.actor_id)).size, 50);
    assert.equal(new Set(isolated.map(r => r.conversation)).size, 50);
    assert.equal(new Set(isolated.map(r => r.store)).size, 50);
    assert.ok(isolated.every(r => r.store.conversations.size === 1 && [...r.store.conversations.values()].every(c => c.owner === r.actor_id)));
    assert.equal(a.quality, null);
    assert.equal(a.model_results, null);
    assert.equal(a.cost_usd, null);
    assert.equal(a.comparison.pairs.length, 10);
    assert.equal(a.comparison.rag_off_is_true_no_knowledge, false);
    assert.equal(a.mock_accounting.currency, 'MOCK_UNITS');
    assert.deepEqual(a.results.map(r => r.evidence_hash), b.results.map(r => r.evidence_hash));
    assert.ok(a.results.some(r => r.deterministic.trajectory.length));
    assert.ok(a.results.every(r => r.deterministic.hard_passed && r.deterministic.business_unchanged && r.dimension_scores === null));
    assert.ok(a.results.filter(r => r.manifest.condition === 'knowledge_off').every(r => !r.deterministic.trajectory.some(t => t.tool === 'knowledge_search')));
    assert.ok(a.results.flatMap(r => r.deterministic.sources).every(s => /^[a-f0-9]{64}$/u.test(s.hash) && s.revision >= 1 && Number.isInteger(s.turn_index)));
  } finally { spy.mock.restore(); }
});

test('paired order is reproducible, only meaningful RAG tasks are paired, invalid seeds/repeats deny', () => {
  const scenarios = loadFixture('kael-intelligence-scenarios');
  const a = makePlan(scenarios, mockModels, 42);
  assert.deepEqual(a, makePlan(scenarios, mockModels, 42));
  assert.notDeepEqual(a, makePlan(scenarios, mockModels, 43));
  assert.ok(a.filter(t => t.paired).every(t => scenarios.find(s => s.id === t.scenario_id).ground_truth.knowledge_expected !== 'not_needed'));
  assert.ok(a.filter(t => !t.paired).every(t => t.condition === 'knowledge_off'));
  for (const seed of [-1, 1.5, 0x100000000]) assert.throws(() => makePlan(scenarios, mockModels, seed));
  assert.throws(() => makePlan(scenarios, mockModels, 1, 4));
});

for (const model of mockModels) {
  test(`${model.provider} raw SSE verifies exact served model and all usage classes before adapter visibility`, async () => {
    const validUsage = { ...usage, cache_write: model.provider === 'deepseek' ? 0 : usage.cache_write };
    const wire = mockStream(model, turn, validUsage);
    const measured = await inspect(wire, model);
    assert.deepEqual(measured.usage, validUsage);
    await assert.rejects(inspect(wire.replaceAll(model.model, 'foreign-served-model'), model), { code: 'MODEL_IDENTITY_UNVERIFIED' });
    await assert.rejects(inspect(wire.replace(/data: (?:\{"type":"message_stop"\}|\[DONE\])\n\n$/u, ''), model), { code: 'INCOMPLETE_SSE' });
    await assert.rejects(inspect(wire.replace(model.provider === 'anthropic' ? '"output_tokens":20' : '"completion_tokens":20', '"missing_usage":20'), model), { code: 'USAGE_UNKNOWN' });
    await assert.rejects(inspect('x'.repeat(1048577), model), { code: 'PROVIDER_STREAM_TOO_LARGE' });
  });
}

test('provider request strips server fallback and denies endpoint or requested-model substitution', () => {
  const model = { ...mockModels[0], model: 'claude-fable-5-1' };
  const init = { method: 'POST', headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' }, body: JSON.stringify({ model: model.model, stream: true, fallbacks: 'default' }) };
  const safe = prepareRequest(pilotEndpoints.anthropic, init, model);
  assert.equal(JSON.parse(safe.body).fallbacks, undefined);
  assert.equal(safe.headers.has('anthropic-beta'), false);
  for (const endpoint of ['https://api.anthropic.com/v1/messages?x=1', 'https://foreign.example/v1/messages', 'http://api.anthropic.com/v1/messages']) assert.throws(() => prepareRequest(endpoint, init, model), { code: 'PROVIDER_ENDPOINT_DENIED' });
  assert.throws(() => prepareRequest(pilotEndpoints.anthropic, { ...init, body: JSON.stringify({ model: 'foreign', stream: true }) }, model), { code: 'REQUEST_MODEL_MISMATCH' });
});

test('unknown model identity halts queue, preserves reservation and never tries a fallback provider', async () => {
  const b = budget();
  const script = scriptedProvider('anthropic', [{ text: ['Chào'] }, { text: ['must never run'] }]);
  const provider = mockPilotProvider({ model: mockModels[0], script, budget: b, scenario: 'fixture', records: [], mutateWire: wire => wire.replace(mockModels[0].model, 'foreign') });
  const request = { system: '', transcript: [], tools: [], maxOutputTokens: 50, signal: AbortSignal.timeout(5000) };
  await assert.rejects(provider.complete(request, () => {}));
  assert.equal(b.halted, 'MODEL_IDENTITY_UNVERIFIED');
  assert.notEqual(b.reservation, null);
  assert.equal(b.summary().estimated_micro_units, null);
  await assert.rejects(provider.complete(request, () => {}), { code: 'MODEL_IDENTITY_UNVERIFIED' });
  assert.equal(script.requests.length, 1);
});

test('incomplete tool blocks, wrong indices and malformed tool JSON halt before adapter visibility and deny continuation', async () => {
  const mutations = [
    wire => wire.replace(/data: \{"type":"content_block_stop","index":0\}\n\n/u, ''),
    wire => wire.replace('"index":0,"delta"', '"index":1,"delta"'),
    wire => wire.replace('"partial_json":"{}"', '"partial_json":"{"'),
    wire => wire.replace('"stop_reason":"tool_use"', '"stop_reason":"end_turn"'),
  ];
  for (const mutateWire of mutations) {
    const b = budget();
    const script = scriptedProvider('anthropic', [{ tools: [call('customer_requests', {})] }, { text: ['must never run'] }]);
    const provider = mockPilotProvider({ model: mockModels[0], script, budget: b, scenario: 'fixture', records: [], mutateWire });
    const request = { system: '', transcript: [], tools: [], maxOutputTokens: 50, signal: AbortSignal.timeout(5000) };
    let visible = '';
    await assert.rejects(provider.complete(request, text => { visible += text; }));
    assert.equal(visible, '');
    assert.ok(['INCOMPLETE_SSE', 'INCOMPLETE_TOOL_CALL'].includes(b.halted));
    assert.notEqual(b.reservation, null);
    await assert.rejects(provider.complete(request, () => {}));
    assert.equal(script.requests.length, 1);
  }
  const deepseek = mockModels[1];
  const wire = mockStream(deepseek, { ...turn, toolCalls: [call('worker_jobs', {})] }, { ...usage, cache_write: 0 });
  await assert.rejects(inspect(wire.replace('"arguments":"{}"', '"arguments":"{"'), deepseek), { code: 'INCOMPLETE_TOOL_CALL' });
  const valid = await inspect(wire, deepseek);
  assert.equal(valid.served_model, deepseek.model);
  const b = budget();
  const script = scriptedProvider('anthropic', [{ tools: [call('worker_jobs', {})] }, { text: ['must never run'] }]);
  const records = [];
  const provider = mockPilotProvider({ model: deepseek, script, budget: b, scenario: 'fixture', records, mutateWire: value => value.replace('"finish_reason":"tool_calls"', '"finish_reason":"stop"') });
  const request = { system: '', transcript: [], tools: [], maxOutputTokens: 50, signal: AbortSignal.timeout(5000) };
  await assert.rejects(provider.complete(request, () => assert.fail('Partial output must not be visible')));
  assert.equal(b.halted, 'INCOMPLETE_SSE');
  assert.notEqual(b.reservation, null);
  assert.equal(records.length, 0);
  await assert.rejects(provider.complete(request, () => {}));
  assert.equal(script.requests.length, 1);
});

test('budgets reject zero, unknown rates, concurrency, turn capacity, deadline, token overrun and unknown usage', () => {
  for (const name of Object.keys(limits)) assert.throws(() => budget({ [name]: 0 }));
  assert.throws(() => new PilotBudget(limits, { ...rates, cache_write_usd_per_million: null }));
  for (const value of ['NaN', '-1', '1e3', '0.0000001']) assert.throws(() => moneyUnits(value));
  const b = budget();
  b.assertTurnCapacity('s', 3);
  b.reserve('s');
  assert.throws(() => b.reserve('s'), { code: 'CONCURRENT_REQUEST_FORBIDDEN' });
  const accounted = b.reconcile(usage);
  assert.equal(accounted.billing_verified, false);
  assert.equal(b.tokens, 135);
  assert.throws(() => budget({ max_total_model_requests: 2 }).assertTurnCapacity('s', 3), { code: 'TURN_BUDGET_RESERVATION_DENIED' });
  assert.throws(() => budget({ max_total_spend_usd: '0.000001' }).reserve('s'), { code: 'BUDGET_RESERVATION_DENIED' });
  assert.throws(() => budget({ max_total_tokens: 1 }).reserve('s'));
  let clock = 0;
  const expired = budget({}, { clock: () => clock });
  clock = 30000;
  assert.throws(() => expired.reserve('s'), { code: 'WALL_BUDGET_EXHAUSTED' });
  for (const bad of [undefined, { ...usage, cache_write: undefined }, { ...usage, input: 65537 }, { ...usage, reasoning: 21 }]) {
    const candidate = budget(); candidate.reserve('s');
    assert.throws(() => candidate.reconcile(bad));
    assert.notEqual(candidate.halted, null);
    assert.notEqual(candidate.reservation, null);
    assert.throws(() => candidate.reserve('s'));
  }
  const tiny = new PilotBudget({ ...limits, max_input_tokens_per_call: 3, max_output_tokens_per_call: 1 }, { input_usd_per_million: '0.1', output_usd_per_million: '0.1', cache_read_usd_per_million: '0.1', cache_write_usd_per_million: '0.1' });
  tiny.reserve('s'); tiny.reconcile({ input: 1, output: 1, cache_read: 1, cache_write: 1, reasoning: 0 });
});

test('the actual shared replay transport blocks foreign, credentialed, wrong-method and consequential paths', async () => {
  let forwarded = 0;
  const boundary = evaluationBoundary(async () => { forwarded++; return new Response('{}'); }, []);
  for (const [destination, method] of [['https://project.supabase.test/rest/v1/rpc/service_request_submit', 'POST'], ['https://project.supabase.test/rest/v1/service_requests', 'POST'], ['https://foreign.test/auth/v1/user', 'GET'], ['https://user:secret@project.supabase.test/auth/v1/user', 'GET'], ['https://project.supabase.test/auth/v1/user#fragment', 'GET']]) {
    assert.throws(() => assertReadTarget(destination, { method }), { code: 'READ_ONLY_TRANSPORT_DENIAL' });
    await assert.rejects(boundary(destination, { method }), /evaluation_read_only_boundary/u);
  }
  assert.equal(forwarded, 0);
  assertReadTarget('https://project.supabase.test/rest/v1/rpc/kael_knowledge_search', { method: 'POST' });
  assert.equal(loopbackOrigin('https://remote.example'), false);
  assert.equal(loopbackOrigin('http://127.0.0.1:54321'), true);
  for (const env of [{ KAEL_ENABLED_EFFECTS: 'service_request_submit' }, { KAEL_ESTIMATE_PREVIEW: 'enabled' }, { KAEL_MODEL_ROUTE: 'fallback' }, { KAEL_WEB_SEARCH: 'enabled' }]) assert.throws(() => rejectOverrides(env));
});

test('pilot Runtime denies consequential and wrong-mode attempts, isolates fresh actors and never exposes another account', async () => {
  const seen = [];
  for (const actor of [users.customer, users.worker]) {
    const b = budget();
    const script = scriptedProvider('anthropic', [{ tools: [call('service_request_submit', {}), call(actor === users.customer ? 'worker_earnings' : 'customer_requests', {})] }, { text: ['Tôi chưa thực hiện thao tác nào.'] }]);
    const provider = mockPilotProvider({ model: mockModels[0], script, budget: b, scenario: 'boundary', records: [] });
    const h = harness({ env: { KAEL_ENABLED_EFFECTS: '', KAEL_ESTIMATE_PREVIEW: 'disabled', KAEL_WEB_SEARCH: 'disabled', KAEL_KNOWLEDGE: 'disabled' }, providers: config => { config.limits = { ...config.limits, ...pilotLimits }; return [provider]; }, fixtures: { requests: [{ id: 'foreign', owner_id: users.other.id, description: 'PRIVATE_FOREIGN_SENTINEL' }] }, wrapFetcher: fetcher => (input, init) => { assertReadTarget(input, init); return fetcher(input, init); } });
    if (actor === users.worker) h.db.capabilities.set(actor.id, ['customer', 'worker']);
    const result = await h.message(actor, 'Chỉ kiểm tra, không thực hiện nghiệp vụ.', { mode: actor === users.worker ? 'worker' : 'client' });
    assert.equal(terminal(result).type, 'run_completed');
    assert.equal(h.db.requests.size, 0);
    assert.equal(h.db.approvals.size, 0);
    assert.ok(!JSON.stringify(script.requests).includes('PRIVATE_FOREIGN_SENTINEL'));
    assert.ok(h.db.tools.some(t => t.tool === 'service_request_submit' && t.outcome !== 'succeeded'));
    seen.push(h.db);
  }
  assert.notEqual(seen[0], seen[1]);
});

test('authorization and human evidence require trusted signatures; tampering and pending reviews deny', async () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const trust = { keys: [{ id: 'TEST_ONLY_OWNER_NOT_A_HUMAN_REVIEW', role: 'owner', public_key: publicKey.export({ type: 'spki', format: 'pem' }).toString() }] };
  const signed = envelope(authorizationTemplate().payload, trust.keys[0].id, privateKey);
  assert.deepEqual(verifyEnvelope(signed, trust.keys, 'owner'), signed.payload);
  const tampered = structuredClone(signed); tampered.payload.approval_status = 'APPROVED';
  assert.throws(() => verifyEnvelope(tampered, trust.keys, 'owner'), { code: 'EVIDENCE_SIGNATURE_INVALID' });
  assert.throws(() => verifyEnvelope(signed, trust.keys, 'human_reviewer'), { code: 'UNTRUSTED_SIGNER' });
  const report = await preflight({ authorization: signed, review: { ...signed, payload: { human_reviewed: true } }, trust, trustedFingerprint: await fingerprint(trust) });
  assert.equal(report.status, 'BLOCKED');
  assert.ok(report.reasons.includes('OWNER_APPROVAL_REQUIRED'));
  assert.ok(report.reasons.includes('HUMAN_ANCHOR_REVIEW_REQUIRED'));
  assert.ok(report.reasons.includes('EXACT_TWO_PROVIDER_MODELS_REQUIRED'));
  assert.ok(report.reasons.includes('EXECUTE_UNAVAILABLE_PENDING_SEPARATE_AUTHORIZATION_AND_REVIEW'));
  assert.equal(report.cost_usd, null);
  const badTrust = await preflight({ authorization: signed, trust, trustedFingerprint: 'foreign' });
  assert.ok(badTrust.reasons.includes('OWNER_TRUST_NOT_VERIFIED'));
});

test('private evidence is ignored, untracked and bounded; summaries remove tokens and reasoning is never exported', () => {
  assert.throws(() => privatePath('../../../package.json'), { code: 'PRIVATE_PATH_REQUIRED' });
  const relative = `test-evidence-${randomUUID()}`;
  const directory = privatePath(relative);
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(path.join(directory, 'oversize.json'), ' '.repeat(1048577));
    assert.throws(() => readPrivate(`${relative}/oversize.json`), { code: 'PRIVATE_EVIDENCE_INVALID' });
    assert.equal(sanitizeVisible('Bearer private-value sk-test-secret token-test-private'), '[REDACTED] [REDACTED] [REDACTED]');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('TEST ONLY signed approvals exercise full preflight; even complete test attestations cannot enable execute', async () => {
  const ids = ['owner', 'reviewer-one', 'reviewer-two', 'expert'];
  const keys = Object.fromEntries(ids.map(id => [id, generateKeyPairSync('ed25519')]));
  const trust = { keys: ids.map(id => ({ id, role: id === 'owner' ? 'owner' : id === 'expert' ? 'technical_expert' : 'human_reviewer', public_key: keys[id].publicKey.export({ type: 'spki', format: 'pem' }).toString() })) };
  const signed = (payload, id) => envelope(payload, id, keys[id].privateKey);
  const now = new Date('2026-11-05T10:00:00Z');
  const sheet = await anchorReviewSheet();
  const dimensions = Object.fromEntries(liveRubric.dimensions.map(d => [d.id, 2]));
  const anchors = sheet.anchors.map(a => ({ ...a, human_reviewed: true, decision: 'APPROVE', reviewer_id: 'reviewer-one', reviewed_at: now.toISOString(), expert_review_required: a.expert_review_recommended, dimensions }));
  const calibration = ['reviewer-one', 'reviewer-two'].map(id => signed({ evidence_type: 'CALIBRATION_RATING', dataset_hash: sheet.dataset_hash, rubric_hash: sheet.rubric_hash, ratings: anchors.map(a => ({ scenario_id: a.scenario_id, scenario_hash: a.scenario_hash, dimensions })) }, id));
  const reviewPayload = { evidence_type: 'HUMAN_REVIEW', dataset_hash: sheet.dataset_hash, rubric_hash: sheet.rubric_hash, calibration_status: 'CALIBRATED', disagreements_resolved: true, calibration_reviewer_ids: ['reviewer-one', 'reviewer-two'], calibration_evidence: calibration, expert_evidence: [signed({ evidence_type: 'TECHNICAL_REVIEW', dataset_hash: sheet.dataset_hash, rubric_hash: sheet.rubric_hash, decision: 'APPROVE', anchors: anchors.filter(a => a.expert_review_required).map(a => ({ scenario_id: a.scenario_id, scenario_hash: a.scenario_hash })) }, 'expert')], anchors };
  const review = signed(reviewPayload, 'reviewer-one');
  const models = mockModels.map(m => ({ ...m, endpoint: pilotEndpoints[m.provider], no_fallback: true, identity_policy: 'EXACT_SERVED_MODEL' }));
  const owner = { ...authorizationTemplate().payload, ...limits, evidence_type: 'OWNER_AUTHORIZATION', approval_status: 'APPROVED', approved_by: 'owner', approved_at: '2026-11-05T09:00:00Z', expires_at: '2026-11-05T11:00:00Z', code_sha: '0'.repeat(40), code_content_hash: 'a'.repeat(64), provider_account: 'TEST_ONLY_NOT_AN_ACCOUNT', dataset_hash: sheet.dataset_hash, rubric_hash: sheet.rubric_hash, review_bundle_hash: await fingerprint(review), provider_models: models, allowed_endpoints: Object.values(pilotEndpoints), scenario_ids: [anchors[0].scenario_id], seed: 1, attempts: 1, max_model_calls_per_turn: 3, max_tool_calls_per_turn: 4, max_turn_wall_seconds: 15, pricing: models.map(m => ({ ...rates, provider: m.provider, model: m.model, currency: 'USD', cache_policy_verified: true, model_support_verified: true, input_bound_verified: true, source_urls: [m.provider === 'anthropic' ? 'https://platform.claude.com/docs/en/about-claude/pricing' : 'https://api-docs.deepseek.com/quick_start/pricing'], checked_at: '2026-11-05T09:00:00Z' })) };
  const trustHash = await fingerprint(trust);
  const run = async (payload = owner, bundle = review, workingTreeDirty = false) => preflight({ authorization: signed(payload, 'owner'), review: bundle, trust, trustedFingerprint: trustHash, codeSha: owner.code_sha, codeContentHash: owner.code_content_hash, workingTreeDirty, stack: { verified: true, owned: true, id: 'TEST_ONLY', origin: 'http://127.0.0.1:54321' }, now });
  const valid = await run();
  assert.deepEqual(valid.reasons, ['EXECUTE_UNAVAILABLE_PENDING_SEPARATE_AUTHORIZATION_AND_REVIEW']);
  assert.equal(valid.status, 'BLOCKED');
  assert.ok((await run(owner, review, true)).reasons.includes('CLEAN_CODE_IDENTITY_REQUIRED'));
  assert.ok((await run({ ...owner, code_content_hash: 'b'.repeat(64) })).reasons.includes('AUTHORIZATION_SCOPE_MISMATCH'));
  assert.ok((await run({ ...owner, max_total_model_requests: 0 })).reasons.includes('ZERO_OR_INVALID_BUDGET'));
  assert.ok((await run({ ...owner, expires_at: '2026-11-05T09:01:00Z' })).reasons.includes('APPROVAL_EXPIRED_OR_INVALID'));
  assert.ok((await run({ ...owner, code_sha: 'foreign' })).reasons.includes('AUTHORIZATION_SCOPE_MISMATCH'));
  assert.ok((await run({ ...owner, provider_models: [{ ...models[0], no_fallback: false }, models[1]] })).reasons.includes('EXACT_TWO_PROVIDER_MODELS_REQUIRED'));
  assert.ok((await run({ ...owner, pricing: owner.pricing.map(p => ({ ...p, checked_at: '2026-11-01T09:00:00Z' })) })).reasons.includes('FRESH_VERIFIED_RATE_CARD_REQUIRED'));
  assert.ok((await run(owner, signed({ ...reviewPayload, expert_evidence: [] }, 'reviewer-one'))).reasons.includes('EXPERT_REVIEW_REQUIRED'));
  assert.ok((await run(owner, signed({ ...reviewPayload, calibration_evidence: calibration.slice(0, 1) }, 'reviewer-one'))).reasons.includes('CALIBRATION_REVIEWERS_REQUIRED'));
  assert.ok((await run(owner, signed({ ...reviewPayload, anchors: anchors.map((a, i) => i ? a : { ...a, decision: 'LABEL_DISPUTED' }) }, 'reviewer-one'))).reasons.includes('ANCHORS_PENDING_OR_DISPUTED'));
});

test('preflight and execute CLI fail closed even with API keys; existing V1 live mode remains rejected', () => {
  for (const [script, option, reason] of [['kael-live-evaluation.mjs', '--execute', 'EXECUTE_UNAVAILABLE'], ['kael-live-evaluation.mjs', '--preflight', 'OWNER_AUTHORIZATION_REQUIRED'], ['kael-intelligence-evaluation.mjs', '--live', 'live mode is unavailable']]) {
    const child = spawnSync(process.execPath, [path.join(root, 'scripts', script), option], { cwd: root, encoding: 'utf8', env: { ...process.env, ANTHROPIC_API_KEY: 'dummy-present', DEEPSEEK_API_KEY: 'dummy-present' }, timeout: 60000, windowsHide: true });
    assert.equal(child.status, 1);
    assert.match(child.stdout + child.stderr, new RegExp(reason, 'u'));
  }
});

test('existing statement-local and turn-local citations, explicit abstention and no-RAG behavior remain strict', () => {
  const scenario = loadFixture('kael-intelligence-scenarios').find(s => s.id === 'grounded_knowledge.001');
  const base = { before: 'same', after: 'same', answers: ['Thông tin factual chưa có trích dẫn.'], trajectory: [], sources: [], actor_id: users.customer.id, boundary_denials: 0, approvals: 0, terminals: ['run_completed'], leaked_private_data: false };
  assert.equal(gradeScenario(scenario, base, 'knowledge_on').passed, false);
  assert.equal(gradeScenario(scenario, { ...base, answers: ['Chưa có nguồn để xác nhận thông tin này.'] }, 'knowledge_off').passed, true);
});
