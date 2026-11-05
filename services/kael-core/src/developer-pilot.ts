import type { KaelConfig } from './config.ts';
import { createDeepSeekProvider, deepseekEndpoint, deepseekRequestBody } from './deepseek.ts';
import { ProviderError } from './model.ts';
import type { Fetcher, ModelProvider } from './model.ts';

export const pilotServedModels = ['deepseek-flash', 'DeepSeek-V4.1-Flash-1017'] as const;

export function pilotRoute(text: string): { thinking: boolean; reason: string } {
  const thinking = /suy nghĩ kỹ|phân tích kỹ|so sánh.*(?:rủi ro|phương án)|think carefully|reason carefully/iu.test(text);
  return { thinking, reason: thinking ? 'explicit_precision_request' : 'default_low_cost_flash' };
}

export function developerPilotProviders(config: KaelConfig, actorId: string, runId: string, text: string, fetcher: Fetcher): ModelProvider[] {
  if (!config.developerPilotId || !config.deepseek) return [];
  const route = pilotRoute(text);
  const providerConfig = { ...config.deepseek, model: 'deepseek-flash', thinking: route.thinking, verifiedModels: pilotServedModels };
  const provider = createDeepSeekProvider(providerConfig, async (url, init) => {
    if (url !== deepseekEndpoint || init.method !== 'POST' || init.redirect !== 'error') {
      throw new ProviderError('deepseek', 'unavailable', 'The pilot transport was denied.');
    }
    return fetcher(url, init);
  });
  const charge = async (callId: string, action: string, model: string, input = 0, cached = 0, output = 0) => {
    try {
      const response = await fetcher(`${config.supabaseUrl}/rest/v1/rpc/kael_pilot_charge`, {
        method: 'POST', redirect: 'error',
        headers: { 'content-type': 'application/json', apikey: config.supabaseServiceKey, authorization: `Bearer ${config.supabaseServiceKey}` },
        body: JSON.stringify({ p_pilot: config.developerPilotId, p_actor: actorId, p_run: runId, p_call: callId, p_action: action,
          p_thinking: route.thinking, p_model: model, p_input: input, p_cached: cached, p_output: output }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ProviderError('deepseek', 'budget', 'The durable budget could not be verified.');
      }
      const result = await response.json() as { ok?: unknown } | null;
      if (result === null || typeof result.ok !== 'boolean') throw new ProviderError('deepseek', 'budget', 'The budget response was invalid.');
      return { ok: result.ok };
    } catch {
      throw new ProviderError('deepseek', 'budget', 'The durable budget could not be verified.');
    }
  };
  return [{
    id: 'deepseek', model: providerConfig.model,
    async complete(request, onText) {
      if (request.signal.aborted) throw new ProviderError('deepseek', 'cancelled', 'The run was cancelled.');
      if (request.maxOutputTokens > 4096 || new TextEncoder().encode(JSON.stringify(deepseekRequestBody(providerConfig, request))).length > 60_000) {
        throw new ProviderError('deepseek', 'budget', 'The pilot request exceeded its input or output limit.');
      }
      const callId = crypto.randomUUID();
      const reserved = await charge(callId, 'reserve', providerConfig.model);
      if (reserved.ok !== true) throw new ProviderError('deepseek', 'budget', 'The pilot budget or authorization did not permit this call.');
      let outputStarted = false;
      try {
        const result = await provider.complete(request, delta => { outputStarted = true; onText(delta); });
        const settled = await charge(callId, 'settle', result.model, result.usage.inputTokens, result.usage.cachedInputTokens, result.usage.outputTokens);
        if (settled.ok !== true) throw new ProviderError('deepseek', 'budget', 'The provider usage could not be reconciled.', outputStarted);
        return result;
      } catch (error) {
        try { await charge(callId, 'uncertain', providerConfig.model); } catch {
          throw new ProviderError('deepseek', 'budget', 'The reservation remains held; further paid calls are blocked.', outputStarted);
        }
        throw error;
      }
    },
  }];
}
