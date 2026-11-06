import { anthropicBudgetModel, anthropicMaxRequestBytes } from './anthropic.ts';
import { deepseekMaxRequestBytes } from './deepseek.ts';
import { ProviderError, validUsage } from './model.ts';
import type { Fetcher, ModelProvider } from './model.ts';
import { perplexitySearchEndpoint } from './perplexity.ts';
import type { ServerRpc } from './store.ts';

const deepseekReservationMicroUsd = Math.ceil(deepseekMaxRequestBytes * 0.30 + 4096 * 1.20);
const anthropicReservationMicroUsd = Math.ceil(anthropicMaxRequestBytes * 1.25 + 4096 * 5);

export function hostedBudget(server: ServerRpc, actorId: string, runId: string) {
  async function charge(provider: 'anthropic' | 'deepseek' | 'perplexity', call: string, actual: number | null): Promise<boolean> {
    const response = await server('kael_provider_charge', {
      p_actor: actorId, p_run: runId, p_provider: provider, p_call: call, p_actual: actual,
    }, AbortSignal.timeout(5000));
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    return await response.json() === true;
  }

  return {
    provider(provider: ModelProvider): ModelProvider {
      return {
        id: provider.id,
        model: provider.model,
        async complete(request, onText) {
          if (request.maxOutputTokens > 4096
            || (provider.id === 'anthropic' && provider.model !== anthropicBudgetModel)) {
            throw new ProviderError(provider.id, 'budget', 'The configured model request is outside its approved beta budget.');
          }
          const call = crypto.randomUUID();
          try {
            if (request.signal.aborted || !await charge(provider.id, call, null) || request.signal.aborted) {
              throw new ProviderError(provider.id, 'budget', 'The provider budget reservation was denied.');
            }
          } catch {
            throw new ProviderError(provider.id, 'budget', 'The provider budget reservation could not be confirmed.');
          }
          const turn = await provider.complete(request, onText);
          const { inputTokens, cachedInputTokens, outputTokens } = turn.usage;
          let actual: number;
          if (provider.id === 'deepseek') {
            if (turn.provider !== 'deepseek' || !validUsage(inputTokens) || inputTokens > deepseekMaxRequestBytes
              || !validUsage(cachedInputTokens) || cachedInputTokens > inputTokens
              || !validUsage(outputTokens) || outputTokens > request.maxOutputTokens) {
              throw new ProviderError(provider.id, 'budget', 'DeepSeek usage could not be reconciled within its approved limit.', Boolean(turn.text));
            }
            actual = Math.ceil((inputTokens - cachedInputTokens) * 0.30 + cachedInputTokens * 0.006 + outputTokens * 1.20);
          } else {
            if (turn.model !== anthropicBudgetModel || !validUsage(inputTokens) || !validUsage(cachedInputTokens)
              || cachedInputTokens > inputTokens || inputTokens > anthropicMaxRequestBytes
              || !validUsage(outputTokens) || outputTokens > request.maxOutputTokens) {
              throw new ProviderError(provider.id, 'budget', 'Anthropic usage could not be reconciled within its approved limit.', Boolean(turn.text));
            }
            actual = Math.ceil((inputTokens - cachedInputTokens) * 1.25 + cachedInputTokens * 0.10 + outputTokens * 5);
          }
          try {
            if (!await charge(provider.id, call, actual)) {
              throw new ProviderError(provider.id, 'budget', 'The provider usage was not reconciled.');
            }
          } catch {
            throw new ProviderError(provider.id, 'budget', 'The provider reservation remains held.', Boolean(turn.text));
          }
          return turn;
        },
      };
    },
    search(fetcher: Fetcher): Fetcher {
      return async (url, init) => {
        if (url !== perplexitySearchEndpoint || init.method !== 'POST' || init.redirect !== 'error' || init.signal?.aborted) {
          throw new Error('The provider search request was denied.');
        }
        const call = crypto.randomUUID();
        if (!await charge('perplexity', call, null) || init.signal?.aborted) throw new Error('The provider search reservation was denied.');
        const response = await fetcher(url, init);
        try {
          if (!await charge('perplexity', call, 5000)) throw new Error('The provider search reservation remains held.');
        } catch (error) {
          await response.body?.cancel();
          throw error;
        }
        return response;
      };
    },
  };
}

export { anthropicReservationMicroUsd, deepseekReservationMicroUsd };
