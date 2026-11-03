import type { AnthropicConfig } from './anthropic.ts';
import type { DeepSeekConfig } from './deepseek.ts';
import type { ProviderId } from './model.ts';
import type { PerplexityConfig } from './perplexity.ts';

export type Environment = Record<string, string | undefined>;

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
  limits: KaelLimits;
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
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) return null;

  const anthropicKey = value(env, 'ANTHROPIC_API_KEY');
  const anthropicModel = value(env, 'KAEL_ANTHROPIC_MODEL');
  const effort = value(env, 'KAEL_ANTHROPIC_EFFORT');
  const anthropic: AnthropicConfig | null = anthropicKey && anthropicModel ? {
    apiKey: anthropicKey,
    model: anthropicModel,
    effort: effort === 'low' || effort === 'high' ? effort : 'medium',
    timeoutMs: modelTimeoutMs,
  } : null;

  const deepseekKey = value(env, 'DEEPSEEK_API_KEY');
  const deepseekModel = value(env, 'KAEL_DEEPSEEK_MODEL');
  const deepseek = deepseekKey && deepseekModel ? {
    apiKey: deepseekKey, model: deepseekModel, thinking: value(env, 'KAEL_DEEPSEEK_THINKING') === 'enabled', timeoutMs: modelTimeoutMs,
  } : null;

  const requested = list(env, 'KAEL_MODEL_ROUTE');
  const order = (requested.length > 0 ? requested : providerIds).filter((id): id is ProviderId => providerIds.includes(id as ProviderId));
  const route = [...new Set(order)].filter(id => (id === 'anthropic' ? anthropic : deepseek) !== null);

  const perplexityKey = value(env, 'PERPLEXITY_API_KEY');
  const perplexity = perplexityKey && value(env, 'KAEL_WEB_SEARCH') === 'enabled'
    ? { apiKey: perplexityKey, maxResults: 5, timeoutMs: 15_000 }
    : null;

  const enabledEffects = new Set(list(env, 'KAEL_ENABLED_EFFECTS')
    .filter((id): id is ConsequentialEffect => (consequentialEffects as readonly string[]).includes(id)));

  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ''), supabaseAnonKey, supabaseServiceKey, anthropic, deepseek, route, perplexity, enabledEffects, limits: defaultLimits };
}

export function configurationReport(env: Environment): Record<string, string> {
  const config = readKaelConfig(env);
  return {
    gateway: config ? 'configured' : 'requires SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY',
    anthropic: config?.anthropic ? 'configured' : 'requires ANTHROPIC_API_KEY and KAEL_ANTHROPIC_MODEL',
    deepseek: config?.deepseek ? 'configured' : 'requires DEEPSEEK_API_KEY and KAEL_DEEPSEEK_MODEL',
    web_search: config?.perplexity ? 'configured' : 'requires PERPLEXITY_API_KEY and KAEL_WEB_SEARCH=enabled',
    effects: config && config.enabledEffects.size > 0 ? [...config.enabledEffects].join(',') : 'none',
  };
}
