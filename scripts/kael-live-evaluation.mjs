import { randomUUID, createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, fingerprint } from '../services/kael-core/src/policy.ts';
import { knowledgeSnapshot } from '../services/kael-core/src/knowledge-sources.ts';
import { replayScenario, protectedSnapshot } from './kael-intelligence-evaluation.mjs';
import { loadFixture, validateScenarios } from './kael-intelligence-grading.mjs';
import { localKnowledgeDatabase } from './kael-knowledge.mjs';
import { localRuntime, withLocalLock } from './supabase-local.mjs';
import { git } from './repository-files.mjs';
import { root } from './tool-path.mjs';
import { exportAnchorReview, liveRubric } from './kael-live-review.mjs';
import { makePlan, PilotBudget, pilotLimits, preflight, rejectOverrides, requirePilot } from './kael-live-policy.mjs';
import { mockModels, mockPilotProvider } from './kael-live-provider.mjs';

export function privatePath(relative = '') {
  const base = path.join(root, '.cache', 'kael-live-private');
  const selected = path.resolve(base, relative);
  requirePilot(selected === base || selected.startsWith(base + path.sep), 'PRIVATE_PATH_REQUIRED');
  let current = root;
  for (const component of path.relative(root, selected).split(path.sep)) {
    current = path.join(current, component);
    try { requirePilot(!lstatSync(current).isSymbolicLink(), 'PRIVATE_PATH_SYMLINK'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  requirePilot(realpathSync(root) === path.resolve(root) && !git(root, ['ls-files', '--', selected]).trim(), 'PRIVATE_PATH_TRACKED_OR_ALIASED');
  requirePilot(git(root, ['check-ignore', '--', selected]).trim(), 'PRIVATE_PATH_NOT_IGNORED');
  return selected;
}

export function readPrivate(relative) {
  const file = privatePath(relative);
  const stat = lstatSync(file);
  requirePilot(stat.isFile() && stat.size <= 1048576, 'PRIVATE_EVIDENCE_INVALID');
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function sanitizeVisible(text) {
  return String(text).replace(/Bearer\s+[^\s"']+|\b(?:sk-[a-zA-Z0-9_-]+|token-[a-zA-Z0-9_-]+)\b/gu, '[REDACTED]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '').slice(0, 16000);
}

export async function codeIdentity() {
  const scope = ['scripts', 'services/kael-core', 'package.json'];
  const names = new Set([
    ...git(root, ['ls-files', '-z', '--', ...scope]).split('\0'),
    ...git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...scope]).split('\0'),
  ].filter(name => name && existsSync(path.join(root, name))));
  const files = [...names].sort().map(name => ({ name, sha256: createHash('sha256').update(readFileSync(path.join(root, name))).digest('hex') }));
  return { code_sha: git(root, ['rev-parse', 'HEAD']).trim(), working_tree_dirty: Boolean(git(root, ['status', '--porcelain']).trim()), code_content_hash: await fingerprint(files) };
}

export async function dryRun({ database = null, seed = 20261105, transcripts = false, env = process.env, observeTrial = () => {} } = {}) {
  rejectOverrides(env);
  const scenarios = loadFixture('kael-intelligence-scenarios');
  const registry = loadFixture('kael-intelligence-registry');
  const replays = loadFixture('kael-intelligence-replays');
  await validateScenarios(scenarios, registry, replays);
  const anchors = registry.anchors.map(id => scenarios.find(s => s.id === id));
  const plan = makePlan(anchors, mockModels, seed);
  const corpusHash = await fingerprint(await knowledgeSnapshot());
  const code = await codeIdentity();
  const before = database ? protectedSnapshot(database) : null;
  const transcriptRun = transcripts ? randomUUID() : null;
  const budget = new PilotBudget({ max_total_model_requests: 300, max_requests_per_scenario: 24, max_input_tokens_per_call: 65536, max_output_tokens_per_call: pilotLimits.maxOutputTokens, max_total_tokens: 20000000, max_wall_seconds: 3600, max_total_spend_usd: '100' }, { input_usd_per_million: '1', output_usd_per_million: '1', cache_read_usd_per_million: '1', cache_write_usd_per_million: '1' }, { currency: 'MOCK_UNITS' });
  const results = [];
  for (const trial of plan) {
    const scenario = anchors.find(s => s.id === trial.scenario_id);
    const model = mockModels.find(m => m.provider === trial.provider);
    const identities = Object.fromEntries(['customer', 'other', 'worker'].map(role => [role, { id: randomUUID(), token: `token-mock-${randomUUID()}` }]));
    const records = [];
    let observed;
    const result = await replayScenario(scenario, replays[scenario.id], trial.condition, database, {
      identities, limits: pilotLimits, beforeTurn: () => budget.assertTurnCapacity(scenario.id, pilotLimits.maxModelCalls),
      providerFactory: script => mockPilotProvider({ model, script, budget, scenario: scenario.id, records }),
      observe: value => { observed = value; },
    });
    requirePilot(!budget.halted, budget.halted ?? 'ACCOUNTING_HALTED');
    observeTrial(observed);
    requirePilot(result.business_unchanged && result.invariants.observed_business_effects === 0 && result.invariants.observed_approvals === 0 && result.boundary_denials === 0 && result.grade.hard_passed, 'SAFETY_FAIL');
    const manifest = { ...trial, requested_model: model.model, served_model: records.map(r => r.served_model), fixture_hash: await fingerprint({ replay: replays[scenario.id], fixture_set: scenario.fixture_set, identity_policy: 'FRESH_SYNTHETIC_PER_TRIAL' }), system_prompt_hashes: records.map(r => r.system_prompt_hash), ...code, corpus_hash: corpusHash, dataset_hash: registry.dataset_hash, rubric_hash: await fingerprint(liveRubric) };
    const deterministic = { passed: result.grade.passed, hard_passed: result.grade.hard_passed, failures: result.grade.failures, retrieval_alignment: { ...result.grade.signals.retrieval_alignment, status: 'DRY_RUN' }, trajectory: result.trajectory, sources: result.sources, response_hashes: result.response_hashes, business_unchanged: result.business_unchanged };
    const row = { manifest, evidence_type: 'DRY_RUN', category: scenario.category, deterministic, adapter_calls: records, duration_ms: result.duration_ms, sql_function_ms: result.sql_function_ms, human_review: 'PENDING_HUMAN_REVIEW', dimension_scores: null, live_quality: null, live_model: null, live_cost_usd: null };
    row.evidence_hash = await fingerprint({ manifest, deterministic });
    results.push(row);
    if (transcripts) {
      const directory = privatePath(path.join('transcripts', transcriptRun));
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const file = privatePath(path.join('transcripts', transcriptRun, row.evidence_hash + '.json'));
      writeFileSync(file, JSON.stringify({ evidence_type: 'DRY_RUN_SYNTHETIC_ONLY', expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), trial_hash: row.evidence_hash, turns: scenario.turns.map((turn, index) => ({ user: sanitizeVisible(turn.message), assistant: sanitizeVisible(observed.answers[index]) })), tools: result.trajectory.map(t => ({ tool: t.tool, outcome: t.outcome })), review_status: 'PENDING_HUMAN_REVIEW' }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
  }
  const after = database ? protectedSnapshot(database) : null;
  requirePilot(canonicalJson(before) === canonicalJson(after), 'PROTECTED_TABLES_CHANGED');
  const categories = [...new Set(anchors.map(s => s.category))].map(category => {
    const rows = results.filter(r => r.category === category);
    return { category, trials: rows.length, passed: rows.filter(r => r.deterministic.passed).length, failures: rows.flatMap(r => r.deterministic.failures.map(f => ({ ...f, provider: r.manifest.provider, condition: r.manifest.condition }))) };
  });
  const pairs = results.filter(r => r.manifest.paired && r.manifest.condition === 'knowledge_on').map(on => {
    const off = results.find(r => r.manifest.scenario_id === on.manifest.scenario_id && r.manifest.provider === on.manifest.provider && r.manifest.attempt === on.manifest.attempt && r.manifest.condition === 'knowledge_off');
    return { scenario_id: on.manifest.scenario_id, provider: on.manifest.provider, on_hash: on.evidence_hash, off_hash: off.evidence_hash, quality_delta: null, cost_delta: null };
  });
  return { schema_version: 1, status: 'DRY_RUN', live_provider_status: 'LIVE_PROVIDER_NOT_RUN', mode: database ? 'MOCK_ADAPTER_REAL_LOCAL_SQL' : 'MOCK_ADAPTER_SYNTHETIC_RETRIEVAL', ...code, dataset_hash: registry.dataset_hash, replay_hash: registry.replay_hash, corpus_hash: corpusHash, seed, anchors: anchors.length, trials: results.length, passed: results.every(r => r.deterministic.passed), provider_network_requests: 0, application_http_requests: 0, mock_adapter_requests: budget.requests, mock_accounting: budget.summary(), protected_tables: database ? { count: Object.keys(before).length, before_hash: await fingerprint(before), after_hash: await fingerprint(after), unchanged: true } : { status: 'NOT_RUN', in_memory_business_unchanged: true }, categories, comparison: { pairs, rag_off_is_true_no_knowledge: false, caveat: 'Existing Runtime system prompt contains domain facts; RAG-off disables retrieval only. Scripted mock answers do not measure RAG lift.', no_rag_needed_excluded_from_pairs: true, order: 'seeded paired order; sequential warm process, SQL cache uncontrolled' }, quality: null, model_results: null, cost_usd: null, human_review: 'PENDING_HUMAN_REVIEW', model_judge: 'NOT_RUN', results };
}

export async function runPreflight(args = {}) {
  let stack;
  try {
    const runtime = localRuntime();
    const verified = runtime.verify();
    const status = runtime.status();
    stack = { id: verified.id, verified: verified.id === status.identity.id, owned: true, origin: new URL(status.endpoints['rest.http'].url).origin };
  } catch { stack = null; }
  const code = await codeIdentity();
  return preflight({ ...args, codeSha: code.code_sha, codeContentHash: code.code_content_hash, workingTreeDirty: code.working_tree_dirty, stack, env: process.env });
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.shift() ?? '--dry-run';
  requirePilot(['--dry-run', '--review', '--preflight'].includes(mode), 'EXECUTE_UNAVAILABLE');
  let report;
  if (mode === '--review') {
    requirePilot(args.length === 0, 'INVALID_ARGUMENTS');
    report = await exportAnchorReview(privatePath('review'));
  } else if (mode === '--preflight') {
    const supplied = {};
    while (args.length) {
      const name = args.shift();
      requirePilot(['--authorization', '--review-evidence', '--trust', '--trust-hash'].includes(name) && args.length && !Object.hasOwn(supplied, name), 'INVALID_ARGUMENTS');
      supplied[name] = args.shift();
    }
    report = await runPreflight({ authorization: supplied['--authorization'] ? readPrivate(supplied['--authorization']) : undefined, review: supplied['--review-evidence'] ? readPrivate(supplied['--review-evidence']) : undefined, trust: supplied['--trust'] ? readPrivate(supplied['--trust']) : undefined, trustedFingerprint: supplied['--trust-hash'] });
    if (report.status === 'BLOCKED') process.exitCode = 1;
  } else {
    requirePilot(new Set(args).size === args.length && args.every(a => ['--local-sql', '--transcripts'].includes(a)), 'INVALID_ARGUMENTS');
    const options = { transcripts: args.includes('--transcripts') };
    report = args.includes('--local-sql') ? await withLocalLock(() => dryRun({ ...options, database: localKnowledgeDatabase() })) : await dryRun(options);
    if (!report.passed) process.exitCode = 1;
  }
  mkdirSync(path.join(root, '.cache'), { recursive: true });
  const stem = mode === '--dry-run' && args.includes('--local-sql') ? 'dry-run-sql' : mode.slice(2);
  writeFileSync(path.join(root, '.cache', `kael-live-${stem}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, results: report.results ? `${report.results.length} sanitized trial records in ignored report` : undefined }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(JSON.stringify({ status: 'BLOCKED', live_provider_status: 'LIVE_PROVIDER_NOT_RUN', reason: typeof error.code === 'string' ? error.code : 'PILOT_PREPARATION_FAILED', quality: null, model_results: null, cost_usd: null })); process.exitCode = 1; }
}
