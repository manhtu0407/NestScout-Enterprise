import { createPublicKey, verify } from 'node:crypto';
import { canonicalJson, fingerprint } from '../services/kael-core/src/policy.ts';
import { defaultLimits } from '../services/kael-core/src/config.ts';
import { anthropicEndpoint } from '../services/kael-core/src/anthropic.ts';
import { deepseekEndpoint } from '../services/kael-core/src/deepseek.ts';
import { loadFixture } from './kael-intelligence-grading.mjs';
import { liveRubric } from './kael-live-review.mjs';
import { isEvaluationRead } from './kael-intelligence-evaluation.mjs';

export const pilotEndpoints = Object.freeze({ anthropic: anthropicEndpoint, deepseek: deepseekEndpoint });
export const pilotLimits = Object.freeze({ maxModelCalls: 3, maxToolCalls: 4, maxOutputTokens: 512, runDeadlineMs: 15000 });
export const executeAvailable = false;

export class PilotError extends Error {
  constructor(code) { super(code); this.name = 'PilotError'; this.code = code; }
}

export function requirePilot(condition, code) { if (!condition) throw new PilotError(code); }
const positive = value => Number.isSafeInteger(value) && value > 0;
const tokenCount = value => Number.isSafeInteger(value) && value >= 0;

export function rejectOverrides(env) {
  const forbidden = ['KAEL_MODEL_ROUTE', 'KAEL_ANTHROPIC_MODEL', 'KAEL_DEEPSEEK_MODEL', 'KAEL_ANTHROPIC_EFFORT', 'KAEL_DEEPSEEK_THINKING', 'KAEL_KNOWLEDGE'];
  requirePilot(!forbidden.some(name => env[name]?.trim()), 'AMBIENT_EXPERIMENT_OVERRIDE');
  requirePilot(!env.KAEL_ENABLED_EFFECTS?.trim(), 'BUSINESS_EFFECTS_FORBIDDEN');
  for (const name of ['KAEL_ESTIMATE_PREVIEW', 'KAEL_WEB_SEARCH']) requirePilot(!env[name]?.trim() || env[name] === 'disabled', 'PRICING_OR_WEB_OVERRIDE');
}

export function assertReadTarget(input, init = {}, origin = 'https://project.supabase.test') {
  const url = new URL(String(input));
  requirePilot(isEvaluationRead(url, init, origin), 'READ_ONLY_TRANSPORT_DENIAL');
  return url;
}

export function loopbackOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && Boolean(url.port) && url.origin === value && !url.username && !url.password;
  } catch { return false; }
}

export function makePlan(scenarios, models, seed, attempts = 1) {
  requirePilot(Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff && positive(attempts) && attempts <= 3, 'INVALID_PLAN');
  let state = seed || 1;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
  const plan = [];
  for (const scenario of scenarios) for (const model of models) for (let attempt = 1; attempt <= attempts; attempt++) {
    const paired = ['required', 'optional'].includes(scenario.ground_truth.knowledge_expected);
    const conditions = paired ? (random() < 0.5 ? ['knowledge_on', 'knowledge_off'] : ['knowledge_off', 'knowledge_on']) : ['knowledge_off'];
    for (const condition of conditions) plan.push({ scenario_id: scenario.id, revision: scenario.version, provider: model.provider, model: model.model, condition, attempt, paired, rag_off_is_true_no_knowledge: false });
  }
  return plan;
}

export function verifyEnvelope(envelope, trusted, role) {
  requirePilot(envelope?.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload) && typeof envelope.signature === 'string', 'SIGNED_EVIDENCE_REQUIRED');
  const key = Array.isArray(trusted) && trusted.find(key => key?.id === envelope.signer_id && key.role === role);
  requirePilot(key && /^-----BEGIN PUBLIC KEY-----\n/.test(key.public_key), 'UNTRUSTED_SIGNER');
  try {
    const publicKey = createPublicKey(key.public_key);
    requirePilot(publicKey.asymmetricKeyType === 'ed25519', 'UNSUPPORTED_SIGNATURE');
    const signature = Buffer.from(envelope.signature, 'base64');
    requirePilot(signature.length === 64 && signature.toString('base64') === envelope.signature && verify(null, Buffer.from(canonicalJson(envelope.payload)), publicKey, signature), 'EVIDENCE_SIGNATURE_INVALID');
  } catch (error) { throw error instanceof PilotError ? error : new PilotError('EVIDENCE_SIGNATURE_INVALID'); }
  return envelope.payload;
}

export function moneyUnits(value) {
  const text = String(value);
  requirePilot(/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,6})?$/u.test(text), 'INVALID_PRICE_PRECISION');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

const ceiling = value => (value + 999999n) / 1000000n;

export class PilotBudget {
  constructor(limits, rates, { currency = 'USD', clock = () => performance.now() } = {}) {
    for (const name of ['max_total_model_requests', 'max_requests_per_scenario', 'max_input_tokens_per_call', 'max_output_tokens_per_call', 'max_total_tokens', 'max_wall_seconds']) requirePilot(positive(limits[name]), 'ZERO_OR_INVALID_BUDGET');
    this.cap = moneyUnits(limits.max_total_spend_usd);
    requirePilot(this.cap > 0n && ['USD', 'MOCK_UNITS'].includes(currency), 'ZERO_OR_INVALID_BUDGET');
    this.rates = Object.fromEntries(['input', 'output', 'cache_read', 'cache_write'].map(name => [name, moneyUnits(rates[`${name}_usd_per_million`])]));
    requirePilot(this.rates.input > 0n && this.rates.output > 0n, 'PRICE_UNKNOWN');
    this.limits = structuredClone(limits); this.currency = currency; this.clock = clock; this.started = clock();
    this.requests = 0; this.tokens = 0; this.spent = 0n; this.reservation = null; this.byScenario = new Map(); this.halted = null;
  }
  halt(code) { this.halted = code; throw new PilotError(code); }
  reservationCost() {
    const rate = [this.rates.input, this.rates.cache_read, this.rates.cache_write].reduce((a, b) => a > b ? a : b);
    return ceiling(BigInt(this.limits.max_input_tokens_per_call) * rate) + 2n + ceiling(BigInt(this.limits.max_output_tokens_per_call) * this.rates.output);
  }
  assertTurnCapacity(scenario, calls) {
    requirePilot(positive(calls) && !this.halted && this.reservation === null, 'TURN_RESERVATION_INVALID');
    const tokens = (this.limits.max_input_tokens_per_call + this.limits.max_output_tokens_per_call) * calls;
    if (!Number.isSafeInteger(tokens) || this.requests + calls > this.limits.max_total_model_requests || (this.byScenario.get(scenario) ?? 0) + calls > this.limits.max_requests_per_scenario || this.tokens + tokens > this.limits.max_total_tokens || this.spent + this.reservationCost() * BigInt(calls) > this.cap) return this.halt('TURN_BUDGET_RESERVATION_DENIED');
  }
  reserve(scenario) {
    requirePilot(!this.halted, this.halted ?? 'BUDGET_HALTED');
    requirePilot(this.reservation === null, 'CONCURRENT_REQUEST_FORBIDDEN');
    if (this.clock() - this.started >= this.limits.max_wall_seconds * 1000) return this.halt('WALL_BUDGET_EXHAUSTED');
    const tokens = this.limits.max_input_tokens_per_call + this.limits.max_output_tokens_per_call;
    requirePilot(Number.isSafeInteger(tokens), 'INVALID_TOKEN_BOUND');
    const cost = this.reservationCost();
    if (this.requests >= this.limits.max_total_model_requests || (this.byScenario.get(scenario) ?? 0) >= this.limits.max_requests_per_scenario || this.tokens + tokens > this.limits.max_total_tokens || this.spent + cost > this.cap) return this.halt('BUDGET_RESERVATION_DENIED');
    this.requests++; this.byScenario.set(scenario, (this.byScenario.get(scenario) ?? 0) + 1);
    this.reservation = { scenario, tokens, cost };
    return { reserved_micro_units: cost.toString(), currency: this.currency };
  }
  reconcile(usage) {
    requirePilot(this.reservation !== null && !this.halted, 'NO_ACTIVE_RESERVATION');
    if (!usage || !['input', 'output', 'cache_read', 'cache_write', 'reasoning'].every(name => tokenCount(usage[name]))) return this.halt('USAGE_UNKNOWN');
    const input = usage.input + usage.cache_read + usage.cache_write;
    if (!Number.isSafeInteger(input) || input > this.limits.max_input_tokens_per_call || usage.output > this.limits.max_output_tokens_per_call || usage.reasoning > usage.output) return this.halt('USAGE_EXCEEDS_RESERVATION');
    const cost = ['input', 'output', 'cache_read', 'cache_write'].reduce((sum, name) => sum + ceiling(BigInt(usage[name]) * this.rates[name]), 0n);
    if (cost > this.reservation.cost || this.spent + cost > this.cap) return this.halt('BUDGET_ACCOUNTING_MISMATCH');
    this.tokens += input + usage.output; this.spent += cost; this.reservation = null;
    if (this.clock() - this.started >= this.limits.max_wall_seconds * 1000) return this.halt('WALL_BUDGET_EXHAUSTED');
    return { estimated_micro_units: cost.toString(), currency: this.currency, billing_verified: false };
  }
  summary() { return { currency: this.currency, requests: this.requests, tokens: this.tokens, estimated_micro_units: this.halted ? null : this.spent.toString(), reserved_micro_units: this.reservation?.cost.toString() ?? null, status: this.halted ?? 'ACCOUNTED', billing_verified: false }; }
}

export async function preflight({ authorization, review, trust, trustedFingerprint, codeSha, codeContentHash, workingTreeDirty, stack, env = {}, now = new Date() } = {}) {
  const reasons = new Set();
  const check = (condition, code) => { if (!condition) reasons.add(code); };
  try { rejectOverrides(env); } catch (error) { reasons.add(error.code); }
  const registry = loadFixture('kael-intelligence-registry');
  const rubricHash = await fingerprint(liveRubric);
  check(/^[a-f0-9]{40}$/u.test(codeSha ?? '') && /^[a-f0-9]{64}$/u.test(codeContentHash ?? '') && workingTreeDirty === false, 'CLEAN_CODE_IDENTITY_REQUIRED');
  let owner = null;
  let reviewed = null;
  check(Boolean(trust && trustedFingerprint && await fingerprint(trust) === trustedFingerprint), 'OWNER_TRUST_NOT_VERIFIED');
  if (!reasons.has('OWNER_TRUST_NOT_VERIFIED')) {
    try { owner = verifyEnvelope(authorization, trust.keys, 'owner'); } catch (error) { reasons.add(error.code); }
    try { reviewed = verifyEnvelope(review, trust.keys, 'human_reviewer'); } catch (error) { reasons.add(error.code); }
  }
  check(Boolean(owner), 'OWNER_AUTHORIZATION_REQUIRED');
  check(Boolean(reviewed), 'HUMAN_ANCHOR_REVIEW_REQUIRED');
  if (reviewed) {
    check(reviewed.evidence_type === 'HUMAN_REVIEW' && reviewed.dataset_hash === registry.dataset_hash && reviewed.rubric_hash === rubricHash && reviewed.calibration_status === 'CALIBRATED' && reviewed.disagreements_resolved === true, 'REVIEW_CALIBRATION_NOT_VERIFIED');
    const entries = Array.isArray(reviewed.anchors) ? reviewed.anchors.filter(a => a && typeof a === 'object') : [];
    check(entries.length === 20 && new Set(entries.map(a => a.scenario_id)).size === 20 && registry.anchors.every(id => entries.some(a => a.scenario_id === id && a.scenario_hash === registry.scenario_hashes[id] && a.decision === 'APPROVE' && a.human_reviewed === true && a.reviewer_id === review.signer_id && Number.isFinite(Date.parse(a.reviewed_at)) && Date.parse(a.reviewed_at) <= now.getTime() && liveRubric.dimensions.every(d => Number.isInteger(a.dimensions?.[d.id]) && a.dimensions[d.id] >= 0 && a.dimensions[d.id] <= 2) && Array.isArray(a.hard_gate_findings) && a.hard_gate_findings.length === 0 && typeof a.expert_review_required === 'boolean')), 'ANCHORS_PENDING_OR_DISPUTED');
    const calibrated = new Set();
    for (const envelope of Array.isArray(reviewed.calibration_evidence) ? reviewed.calibration_evidence : []) {
      try {
        const rating = verifyEnvelope(envelope, trust.keys, 'human_reviewer');
        requirePilot(rating.evidence_type === 'CALIBRATION_RATING' && rating.dataset_hash === registry.dataset_hash && rating.rubric_hash === rubricHash && Array.isArray(rating.ratings) && rating.ratings.length === 20 && new Set(rating.ratings.map(r => r?.scenario_id)).size === 20 && registry.anchors.every(id => rating.ratings.some(r => r?.scenario_id === id && r.scenario_hash === registry.scenario_hashes[id] && liveRubric.dimensions.every(d => Number.isInteger(r.dimensions?.[d.id]) && r.dimensions[d.id] >= 0 && r.dimensions[d.id] <= 2))), 'CALIBRATION_RATINGS_INVALID');
        calibrated.add(envelope.signer_id);
      } catch (error) { reasons.add(error.code ?? 'CALIBRATION_RATINGS_INVALID'); }
    }
    check(Array.isArray(reviewed.calibration_reviewer_ids) && new Set(reviewed.calibration_reviewer_ids).size >= 2 && reviewed.calibration_reviewer_ids.every(id => calibrated.has(id)), 'CALIBRATION_REVIEWERS_REQUIRED');
    const expertAnchors = new Set();
    for (const envelope of Array.isArray(reviewed.expert_evidence) ? reviewed.expert_evidence : []) {
      try {
        const expert = verifyEnvelope(envelope, trust.keys, 'technical_expert');
        requirePilot(expert.evidence_type === 'TECHNICAL_REVIEW' && expert.dataset_hash === registry.dataset_hash && expert.rubric_hash === rubricHash && expert.decision === 'APPROVE' && Array.isArray(expert.anchors) && expert.anchors.every(a => a?.scenario_hash === registry.scenario_hashes[a.scenario_id]), 'EXPERT_REVIEW_INVALID');
        expert.anchors.forEach(a => expertAnchors.add(a.scenario_id));
      } catch (error) { reasons.add(error.code ?? 'EXPERT_REVIEW_INVALID'); }
    }
    check(entries.every(a => !a.expert_review_required || expertAnchors.has(a.scenario_id)), 'EXPERT_REVIEW_REQUIRED');
  }
  if (owner) {
    check(owner.evidence_type === 'OWNER_AUTHORIZATION' && owner.approval_status === 'APPROVED' && owner.approved_by === authorization.signer_id && owner.provider_account, 'OWNER_APPROVAL_REQUIRED');
    check(Number.isFinite(Date.parse(owner.approved_at)) && Date.parse(owner.approved_at) <= now.getTime() && Date.parse(owner.expires_at) > now.getTime(), 'APPROVAL_EXPIRED_OR_INVALID');
    check(owner.code_sha === codeSha && owner.code_content_hash === codeContentHash && owner.dataset_hash === registry.dataset_hash && owner.rubric_hash === rubricHash && owner.review_bundle_hash === await fingerprint(review), 'AUTHORIZATION_SCOPE_MISMATCH');
    const models = Array.isArray(owner.provider_models) ? owner.provider_models.filter(m => m && typeof m === 'object') : [];
    check(models.length === 2 && new Set(models.map(m => m.provider)).size === 2 && models.every(m => pilotEndpoints[m.provider] === m.endpoint && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,79}$/u.test(m.model) && m.no_fallback === true && m.identity_policy === 'EXACT_SERVED_MODEL' && typeof m.thinking === 'boolean' && ['low', 'medium', 'high'].includes(m.effort)), 'EXACT_TWO_PROVIDER_MODELS_REQUIRED');
    check(Array.isArray(owner.allowed_endpoints) && owner.allowed_endpoints.length === 2 && models.every(m => owner.allowed_endpoints.includes(m.endpoint)), 'ENDPOINT_ALLOWLIST_REQUIRED');
    check(Array.isArray(owner.scenario_ids) && owner.scenario_ids.length > 0 && new Set(owner.scenario_ids).size === owner.scenario_ids.length && owner.scenario_ids.every(id => registry.anchors.includes(id)), 'ANCHOR_SELECTION_REQUIRED');
    check(positive(owner.max_model_calls_per_turn) && owner.max_model_calls_per_turn <= defaultLimits.maxModelCalls && positive(owner.max_tool_calls_per_turn) && owner.max_tool_calls_per_turn <= defaultLimits.maxToolCalls && positive(owner.max_output_tokens_per_call) && owner.max_output_tokens_per_call <= defaultLimits.maxOutputTokens && positive(owner.max_turn_wall_seconds) && owner.max_turn_wall_seconds <= defaultLimits.runDeadlineMs / 1000, 'RUNTIME_LIMITS_INVALID');
    check(Number.isSafeInteger(owner.seed) && owner.seed >= 0 && owner.seed <= 0xffffffff && positive(owner.attempts) && owner.attempts <= 3, 'PAIRED_PLAN_SEED_REQUIRED');
    for (const model of models) {
      const price = Array.isArray(owner.pricing) && owner.pricing.find(p => p?.provider === model.provider && p.model === model.model);
      check(Boolean(price && price.currency === 'USD' && price.cache_policy_verified === true && price.model_support_verified === true && price.input_bound_verified === true && Array.isArray(price.source_urls) && price.source_urls.length > 0 && price.source_urls.every(value => { try { const url = new URL(value); return url.protocol === 'https:' && (model.provider === 'anthropic' ? ['platform.claude.com', 'docs.anthropic.com', 'www.anthropic.com'] : ['api-docs.deepseek.com']).includes(url.hostname); } catch { return false; } }) && now.getTime() - Date.parse(price.checked_at) >= 0 && now.getTime() - Date.parse(price.checked_at) <= 86400000), 'FRESH_VERIFIED_RATE_CARD_REQUIRED');
      try { new PilotBudget(owner, price ?? {}); } catch (error) { reasons.add(error.code ?? 'BUDGET_OR_PRICE_UNKNOWN'); }
    }
  }
  check(Boolean(stack?.verified === true && stack.id && stack.owned === true && loopbackOrigin(stack.origin)), 'OWNED_LOCAL_STACK_UNVERIFIED');
  check(executeAvailable, 'EXECUTE_UNAVAILABLE_PENDING_SEPARATE_AUTHORIZATION_AND_REVIEW');
  return { schema_version: 1, status: reasons.size ? 'BLOCKED' : 'PILOT_READY_BUT_NOT_AUTHORIZED', live_provider_status: 'LIVE_PROVIDER_NOT_RUN', execute_available: executeAvailable, network_requests: 0, reasons: [...reasons].sort(), required_owner_decisions: ['20 signed human anchor reviews, two signed calibration ratings, resolve disputes and expert reviews where required', 'two exact officially verified Anthropic/DeepSeek models, endpoints, thinking and effort controls; no fallback', 'approved account, expiry, exact code/dataset/rubric/review hashes and anchor selection', 'positive global and per-scenario request, token, wall-time and money limits; fresh official input/output/cache rates', 'verified owned local stack and input-token bound; separately reviewed execute implementation and account spending safeguards'], dataset_hash: registry.dataset_hash, rubric_hash: rubricHash, human_review: reviewed ? 'SIGNED_EXTERNAL_EVIDENCE_ONLY' : 'PENDING_HUMAN_REVIEW', quality: null, model_results: null, cost_usd: null };
}
