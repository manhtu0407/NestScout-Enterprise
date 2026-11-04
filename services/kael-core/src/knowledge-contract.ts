export const familyCounts = { electrical: 30, plumbing: 30, air_conditioning: 35, cleaning: 30, upholstery: 25, minor_repairs: 30 } as const;
export type ServiceFamily = keyof typeof familyCounts;
export const scopeMaterials = ['tile', 'laminate', 'glass', 'fabric', 'coated_wood', 'metal'] as const;
export type ScopeMaterial = typeof scopeMaterials[number];
export type EstimateScope = { area_m2: number; units: number; material: ScopeMaterial | 'unknown'; floor_access: boolean; clear_surface: boolean; no_visible_damage: boolean };
export type PricePrior = {
  evidence_class: 'synthetic_prior';
  region: 'Ho Chi Minh City';
  currency: 'VND';
  min_vnd: number;
  max_vnd: number;
  basis: 'labor_only';
  unit: 'one_bounded_task';
  valid_as_of: '2026-11-04';
  review_state: 'provisional';
  display_policy: 'disabled_by_default';
  evidence_uri: null;
  verified_business_event_id: null;
  scope: { max_area_m2: number; max_units: number; materials: ScopeMaterial[]; floor_access: true; clear_surface: true; no_visible_damage: true };
};
export type ServiceCase = {
  case_id: string;
  revision: number;
  locale: 'vi-VN';
  family: ServiceFamily;
  canonical_problem: string;
  user_phrases: string[];
  aliases: string[];
  hypotheses: string[];
  questions: string[];
  signals: string[];
  safety_tags: string[];
  safe_response: string;
  assumptions: string[];
  scope_inclusions: string[];
  scope_exclusions: string[];
  cost_drivers: string[];
  uncertainty: string;
  service_taxonomy_ref: null;
  provenance_type: 'synthetic_seed';
  review_state: 'agent_validated_provisional';
  exemplar: boolean;
  price_prior: PricePrior | null;
  updated_at: '2026-11-04';
};

export type KnowledgeSource = {
  source_id: string;
  revision: number;
  source_kind: 'synthetic_case' | 'product_fact' | 'policy_placeholder';
  title: string;
  content: string;
  aliases: string[];
  locale: 'vi-VN';
  region: 'Ho Chi Minh City';
  visibility: 'public' | 'customer' | 'worker' | 'owner' | 'internal';
  owner_id: string | null;
  publication: 'published' | 'draft_unapproved' | 'withdrawn';
  provenance: 'synthetic_seed' | 'repository_contract' | 'agent_draft';
  source_uri: string | null;
  source_owner: 'NestScout';
  review_state: 'repository_verified' | 'agent_validated_provisional' | 'unapproved';
  effective_at: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  supersedes_revision: number | null;
  case_data: ServiceCase | null;
};

const ignored = new Set('toi minh ban nha bi la va cua cho co khong mot cac can giup voi nay thi khi nhu da dang hay ve o muon xin lam sao the nao duoc bao nhieu gia tien'.split(' '));

export function normalizeKnowledge(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function knowledgeTerms(text: string): string[] {
  return [...new Set(normalizeKnowledge(text).split(' ').filter(word => word.length > 1 && !ignored.has(word)))];
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function validateCase(value: unknown): asserts value is ServiceCase {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'case object required');
  const item = value as ServiceCase;
  requireValue(typeof item.case_id === 'string' && item.case_id.length <= 120 && /^[a-z_]+\.[a-z0-9-]+$/.test(item.case_id), 'invalid case id');
  requireValue(typeof item.canonical_problem === 'string' && item.canonical_problem.length > 3 && item.canonical_problem.length <= 200, 'invalid canonical problem');
  requireValue(typeof item.family === 'string' && Object.hasOwn(familyCounts, item.family) && item.case_id.startsWith(`${item.family}.`), 'invalid family');
  requireValue(Number.isSafeInteger(item.revision) && item.revision > 0 && item.locale === 'vi-VN' && item.updated_at === '2026-11-04' && typeof item.exemplar === 'boolean', 'invalid case version');
  requireValue(item.provenance_type === 'synthetic_seed' && item.review_state === 'agent_validated_provisional' && item.service_taxonomy_ref === null, 'synthetic provenance required');
  for (const key of ['user_phrases', 'aliases', 'hypotheses', 'questions', 'signals', 'safety_tags', 'assumptions', 'scope_inclusions', 'scope_exclusions', 'cost_drivers'] as const) {
    requireValue(Array.isArray(item[key]) && item[key].length > 0 && item[key].length <= 12 && item[key].every(value => typeof value === 'string' && value.trim().length > 2 && value.length <= 500), `missing or unbounded ${key}`);
    requireValue(new Set(item[key]).size === item[key].length, `duplicate ${key}`);
  }
  requireValue(item.user_phrases.length >= 2 && item.questions.length >= 2 && item.hypotheses.every(value => value.startsWith('Có thể')), 'case needs phrases, questions and hypothetical causes');
  requireValue(typeof item.safe_response === 'string' && item.safe_response.length > 30 && item.safe_response.length <= 600 && typeof item.uncertainty === 'string' && item.uncertainty.length > 20 && item.uncertainty.length <= 500, 'missing safety or uncertainty');
  requireValue(!item.scope_inclusions.some(value => item.scope_exclusions.includes(value)), 'conflicting scope');
  requireValue(!/\b0(?:\d[ .-]?){8,10}\d\b|@[\w.-]+|https?:\/\//.test(JSON.stringify(item)), 'unexpected contact or external provenance');
  const prior = item.price_prior;
  requireValue(prior === null || (typeof prior === 'object' && !Array.isArray(prior)), 'invalid prior');
  if (prior !== null) {
    requireValue(item.safety_tags.length === 1 && item.safety_tags[0] === 'routine_caution', 'unsafe numeric prior');
    requireValue(prior.evidence_class === 'synthetic_prior' && prior.review_state === 'provisional' && prior.display_policy === 'disabled_by_default'
      && prior.evidence_uri === null && prior.verified_business_event_id === null && prior.currency === 'VND'
      && prior.region === 'Ho Chi Minh City' && prior.valid_as_of === item.updated_at && prior.basis === 'labor_only' && prior.unit === 'one_bounded_task', 'invalid price provenance');
    requireValue(Number.isSafeInteger(prior.min_vnd) && Number.isSafeInteger(prior.max_vnd) && prior.min_vnd >= 0 && prior.min_vnd <= prior.max_vnd
      && prior.min_vnd % 50000 === 0 && prior.max_vnd % 50000 === 0, 'invalid coarse price band');
    requireValue(prior.scope && Number.isSafeInteger(prior.scope.max_area_m2) && prior.scope.max_area_m2 > 0 && prior.scope.max_area_m2 <= 40
      && Number.isSafeInteger(prior.scope.max_units) && prior.scope.max_units === 1 && Array.isArray(prior.scope.materials)
      && prior.scope.materials.length > 0 && prior.scope.materials.length <= scopeMaterials.length && prior.scope.materials.every(material => scopeMaterials.includes(material))
      && prior.scope.floor_access === true && prior.scope.clear_surface === true && prior.scope.no_visible_damage === true, 'unbounded prior scope');
  }
}

export function validateCases(cases: readonly ServiceCase[]): void {
  requireValue(cases.length === 180, 'expected exactly 180 service cases');
  const ids = new Set<string>();
  const problems = new Set<string>();
  for (const item of cases) {
    validateCase(item);
    requireValue(item.revision === 1 && !ids.has(item.case_id), 'duplicate or invalid case id');
    ids.add(item.case_id);
    const problem = normalizeKnowledge(item.canonical_problem);
    requireValue(!problems.has(problem), 'duplicate canonical problem');
    problems.add(problem);
  }
  for (const [family, count] of Object.entries(familyCounts)) {
    requireValue(cases.filter(item => item.family === family).length === count, `invalid ${family} count`);
    requireValue(cases.filter(item => item.family === family && item.exemplar).length >= 3, `missing ${family} exemplars`);
  }
}

export function validateSources(sources: readonly KnowledgeSource[]): void {
  const ids = new Set<string>();
  for (const source of sources) {
    requireValue(!ids.has(source.source_id) && /^[a-z_]+\.[a-z0-9.-]+$/.test(source.source_id), 'duplicate or invalid source');
    ids.add(source.source_id);
    requireValue(typeof source.title === 'string' && source.title.trim().length > 0 && source.title.length <= 200 && typeof source.content === 'string' && source.content.trim().length > 0 && source.content.length <= 8000 && Number.isSafeInteger(source.revision) && source.revision > 0 && source.locale === 'vi-VN', 'empty or unbounded source');
    requireValue(['synthetic_case', 'product_fact', 'policy_placeholder'].includes(source.source_kind) && ['public', 'customer', 'worker', 'owner', 'internal'].includes(source.visibility) && ['published', 'draft_unapproved', 'withdrawn'].includes(source.publication), 'invalid source classification');
    requireValue(Array.isArray(source.aliases) && source.aliases.length <= 20 && source.aliases.every(alias => typeof alias === 'string' && alias.length > 0 && alias.length <= 300), 'invalid aliases');
    requireValue(source.region === 'Ho Chi Minh City' && source.source_owner === 'NestScout' && ['repository_verified', 'agent_validated_provisional', 'unapproved'].includes(source.review_state), 'invalid source metadata');
    requireValue(source.effective_at === null || Number.isFinite(Date.parse(source.effective_at)), 'invalid effective date');
    requireValue(source.reviewed_at === null || Number.isFinite(Date.parse(source.reviewed_at)), 'invalid review date');
    requireValue(source.supersedes_revision === (source.revision === 1 ? null : source.revision - 1), 'invalid predecessor revision');
    requireValue(source.owner_id === null || /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(source.owner_id), 'invalid owner id');
    requireValue((source.visibility === 'owner') === (source.owner_id !== null), 'ambiguous owner scope');
    requireValue(source.publication !== 'published' || (source.effective_at !== null && source.review_state !== 'unapproved'), 'unreviewed publication');
    requireValue(source.expires_at === null || (source.effective_at !== null && Date.parse(source.expires_at) > Date.parse(source.effective_at)), 'invalid effective window');
    if (source.source_kind === 'synthetic_case') {
      requireValue(source.provenance === 'synthetic_seed' && source.review_state === 'agent_validated_provisional' && source.source_uri === null, 'synthetic misclassification');
      validateCase(source.case_data);
      requireValue(source.case_data.case_id === source.source_id && source.case_data.revision === source.revision, 'case/source identity mismatch');
    } else requireValue(source.case_data === null, 'non-case source contains case data');
    if (source.source_kind === 'product_fact') requireValue(source.provenance === 'repository_contract' && source.review_state === 'repository_verified' && source.source_uri?.startsWith('repo:'), 'product fact requires repository evidence');
    if (source.source_kind === 'policy_placeholder') requireValue(source.publication !== 'published' && source.provenance === 'agent_draft', 'unapproved policy publication');
  }
}
