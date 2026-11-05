import type { AnthropicConfig } from './anthropic.ts';
import type { DeepSeekConfig } from './deepseek.ts';
import type { ProviderId } from './model.ts';
import type { PerplexityConfig } from './perplexity.ts';

export type Environment = Record<string, string | undefined>;

export const deepseekFlashModel = 'deepseek-flash';

export const consequentialEffects = ['service_request_submit'] as const;

export type ConsequentialEffect = typeof consequentialEffects[number];

export type KaelLimits = {
  maxModelCalls: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  runDeadlineMs: number;
  historyMessages: number;
  historyChars: number;
  approvalTtlSeconds: number;
  maxInputChars: number;
};

export type KaelConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  anthropic: AnthropicConfig | null;
  deepseek: DeepSeekConfig | null;
  route: ProviderId[];
  perplexity: PerplexityConfig | null;
  enabledEffects: ReadonlySet<ConsequentialEffect>;
  knowledgeEnabled: boolean;
  localEstimatePreview: boolean;
  limits: KaelLimits;
  developerPilotId?: string;
};

export const defaultLimits: KaelLimits = {
  maxModelCalls: 6,
  maxToolCalls: 8,
  maxOutputTokens: 4096,
  runDeadlineMs: 60_000,
  historyMessages: 16,
  historyChars: 24_000,
  approvalTtlSeconds: 900,
  maxInputChars: 4000,
};

const providerIds: readonly ProviderId[] = ['anthropic', 'deepseek'];
const modelTimeoutMs = 45_000;
const localApi = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]|host\.docker\.internal|host\.supabase\.internal)(?::\d+)?\/?$/;

function validSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash && parsed.pathname === '/'
      && (parsed.protocol === 'https:' || localApi.test(url));
  } catch { return false; }
}

const edgeRuntimeSettings = [
  'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'KAEL_KNOWLEDGE', 'KAEL_ESTIMATE_PREVIEW',
  'KAEL_DEVELOPER_PILOT', 'KAEL_DEVELOPER_PILOT_ID', 'KAEL_PILOT_GENERATION', 'KAEL_PILOT_WORKER_ID',
] as const;
const hostedProviderSettings = [
  'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'PERPLEXITY_API_KEY', 'KAEL_MODEL_ROUTE',
  'KAEL_DEEPSEEK_MODEL', 'KAEL_DEEPSEEK_THINKING', 'KAEL_ANTHROPIC_MODEL', 'KAEL_ANTHROPIC_EFFORT',
  'KAEL_ANTHROPIC_SERVER_FALLBACK', 'KAEL_WEB_SEARCH', 'KAEL_ENABLED_EFFECTS',
] as const;

export function readKaelEdgeEnvironment(read: (name: string) => string | undefined): Environment {
  const url = read('SUPABASE_URL')?.trim();
  const environment: Environment = { SUPABASE_URL: url };
  const hosted = url !== undefined && validSupabaseUrl(url) && new URL(url).protocol === 'https:'
    && Boolean(read('DENO_DEPLOYMENT_ID')?.trim());
  const settings = hosted ? [...edgeRuntimeSettings, ...hostedProviderSettings] : edgeRuntimeSettings;
  for (const name of settings) {
    const value = read(name);
    if (value !== `env(NESTSCOUT_LOCAL_${name})`) environment[name] = value;
  }
  return environment;
}

function legacyServiceJwt(raw: string): boolean {
  const parts = raw.split('.');
  if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const claims = JSON.parse(atob((parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown; exp?: unknown };
    return claims.role === 'service_role' && (claims.exp === undefined || (typeof claims.exp === 'number' && claims.exp > Date.now() / 1000));
  } catch { return false; }
}

function providerStatus(key: string | undefined, model: string | undefined, pattern: RegExp): string {
  if (!key) return 'credential_missing';
  if (!/^[\x21-\x7e]+$/.test(key)) return 'credential_invalid';
  if (!model) return 'model_missing';
  return pattern.test(model) ? 'configured' : 'model_invalid';
}

const anthropicModelId = /^claude-[a-zA-Z0-9._-]{1,72}$/;
const deepseekModelId = /^deepseek-[a-zA-Z0-9._-]{1,70}$/;

function routeOf(env: Environment): ProviderId[] | null {
  const raw = env.KAEL_MODEL_ROUTE;
  const requested = raw === undefined ? ['deepseek'] : raw.split(',').map(item => item.trim());
  return requested.every((id): id is ProviderId => providerIds.includes(id as ProviderId))
    && new Set(requested).size === requested.length ? requested : null;
}

function value(env: Environment, name: string): string | undefined {
  const raw = env[name]?.trim();
  return raw ? raw : undefined;
}

function list(env: Environment, name: string): string[] {
  return (value(env, name) ?? '').split(',').map(item => item.trim()).filter(Boolean);
}

export function readKaelConfig(env: Environment): KaelConfig | null {
  const supabaseUrl = value(env, 'SUPABASE_URL');
  const supabaseAnonKey = value(env, 'SUPABASE_ANON_KEY');
  const supabaseServiceKey = value(env, 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !validSupabaseUrl(supabaseUrl) || !supabaseAnonKey || !supabaseServiceKey || !legacyServiceJwt(supabaseServiceKey)) return null;

  const anthropicKey = value(env, 'ANTHROPIC_API_KEY');
  const anthropicModel = value(env, 'KAEL_ANTHROPIC_MODEL');
  const effort = value(env, 'KAEL_ANTHROPIC_EFFORT');
  const anthropic: AnthropicConfig | null = anthropicKey && anthropicModel && providerStatus(anthropicKey, anthropicModel, anthropicModelId) === 'configured' ? {
    apiKey: anthropicKey,
    model: anthropicModel,
    effort: effort === 'low' || effort === 'high' ? effort : 'medium',
    timeoutMs: modelTimeoutMs,
    serverFallback: value(env, 'KAEL_ANTHROPIC_SERVER_FALLBACK') === 'enabled',
  } : null;

  const deepseekKey = value(env, 'DEEPSEEK_API_KEY');
  const pilotFlag = value(env, 'KAEL_DEVELOPER_PILOT');
  const pilotId = value(env, 'KAEL_DEVELOPER_PILOT_ID');
  const deepseekModel = value(env, 'KAEL_DEEPSEEK_MODEL') ?? deepseekFlashModel;
  if (pilotFlag && (pilotFlag !== 'local_8085' || !pilotId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(pilotId)
    || deepseekModel !== deepseekFlashModel
    || !/^http:\/\/(?:127\.0\.0\.1|localhost|host\.docker\.internal|host\.supabase\.internal)(?::\d+)?\/?$/.test(supabaseUrl))) return null;
  const deepseek = deepseekKey && providerStatus(deepseekKey, deepseekModel, deepseekModelId) === 'configured' ? {
    apiKey: deepseekKey, model: deepseekModel, thinking: value(env, 'KAEL_DEEPSEEK_THINKING') === 'enabled', timeoutMs: modelTimeoutMs,
  } : null;

  const order = routeOf(env);
  const route = order?.every(id => (id === 'anthropic' ? anthropic : deepseek) !== null) ? order : [];

  const perplexityKey = value(env, 'PERPLEXITY_API_KEY');
  const perplexity = perplexityKey && value(env, 'KAEL_WEB_SEARCH') === 'enabled'
    ? { apiKey: perplexityKey, maxResults: 5, timeoutMs: 15_000 }
    : null;

  const enabledEffects = new Set(list(env, 'KAEL_ENABLED_EFFECTS')
    .filter((id): id is ConsequentialEffect => (consequentialEffects as readonly string[]).includes(id)));

  const loopback = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/?$/.test(supabaseUrl);
  const knowledgeEnabled = value(env, 'KAEL_KNOWLEDGE') !== 'disabled';
  const localEstimatePreview = knowledgeEnabled && loopback && value(env, 'KAEL_ESTIMATE_PREVIEW') === 'local_only';
  return {
    supabaseUrl: supabaseUrl.replace(/\/+$/, ''), supabaseAnonKey, supabaseServiceKey,
    anthropic: pilotFlag ? null : anthropic, deepseek, route: pilotFlag ? deepseek ? ['deepseek'] : [] : route,
    perplexity: pilotFlag ? null : perplexity, enabledEffects: pilotFlag ? new Set() : enabledEffects,
    knowledgeEnabled, localEstimatePreview: pilotFlag ? false : localEstimatePreview,
    limits: pilotFlag ? { ...defaultLimits, maxModelCalls: 3 } : defaultLimits,
    ...(pilotFlag ? { developerPilotId: pilotId } : {}),
  };
}

export function configurationReport(env: Environment): Record<string, string> {
  const config = readKaelConfig(env);
  return {
    gateway: config ? 'configured' : 'requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY holding the legacy service-role JWT; sb_secret_ keys are not supported yet',
    anthropic: providerStatus(value(env, 'ANTHROPIC_API_KEY'), value(env, 'KAEL_ANTHROPIC_MODEL'), anthropicModelId),
    deepseek: providerStatus(value(env, 'DEEPSEEK_API_KEY'), value(env, 'KAEL_DEEPSEEK_MODEL') ?? deepseekFlashModel, deepseekModelId),
    route: config?.route.length ? config.route.join(',') : routeOf(env) === null ? 'invalid_route' : 'route_unavailable',
    web_search: config?.perplexity ? 'configured' : 'requires PERPLEXITY_API_KEY and KAEL_WEB_SEARCH=enabled',
    effects: config && config.enabledEffects.size > 0 ? [...config.enabledEffects].join(',') : 'none',
    knowledge: config?.knowledgeEnabled ? 'lexical' : 'disabled',
    estimate_preview: config?.localEstimatePreview ? 'local_synthetic_preview' : 'disabled',
  };
}
