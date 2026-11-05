import { anthropicVerificationModel } from './anthropic.ts';
import { ProviderError, validUsage } from './model.ts';
import type { Fetcher, ModelProvider } from './model.ts';
import { perplexitySearchEndpoint } from './perplexity.ts';
import type { ServerRpc } from './store.ts';

export function hostedVerification(server: ServerRpc, actorId: string, runId: string) {
  async function charge(provider: 'anthropic' | 'perplexity', call: string, actual: number | null): Promise<boolean> {
    const response = await server('kael_verification_charge', {
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
          if (provider.id !== 'anthropic' || provider.model !== anthropicVerificationModel || request.maxOutputTokens > 4096) {
            throw new ProviderError(provider.id, 'budget', 'No approved verification rate bound covers this model request.');
          }
          const call = crypto.randomUUID();
          try {
            if (request.signal.aborted || !await charge('anthropic', call, null) || request.signal.aborted) {
              throw new ProviderError(provider.id, 'budget', 'The verification reservation was denied.');
            }
          } catch {
            throw new ProviderError(provider.id, 'budget', 'The verification reservation could not be confirmed.');
          }
          const turn = await provider.complete(request, onText);
          const { inputTokens, cachedInputTokens, outputTokens } = turn.usage;
          try {
            if (turn.model !== anthropicVerificationModel || !validUsage(inputTokens) || !validUsage(cachedInputTokens)
              || inputTokens + cachedInputTokens > 200_000
              || !validUsage(outputTokens) || outputTokens > request.maxOutputTokens
              || !await charge('anthropic', call, Math.ceil(inputTokens * 1.25 + cachedInputTokens * 0.10 + outputTokens * 5))) {
              throw new ProviderError(provider.id, 'budget', 'The verification charge was not reconciled.');
            }
          } catch {
            throw new ProviderError(provider.id, 'budget', 'The verification reservation remains held.', Boolean(turn.text));
          }
          return turn;
        },
      };
    },
    search(fetcher: Fetcher): Fetcher {
      return async (url, init) => {
        if (url !== perplexitySearchEndpoint || init.method !== 'POST' || init.redirect !== 'error' || init.signal?.aborted) {
          throw new Error('The verification search request was denied.');
        }
        const call = crypto.randomUUID();
        if (!await charge('perplexity', call, null) || init.signal?.aborted) throw new Error('The search reservation was denied.');
        const response = await fetcher(url, init);
        try {
          if (!await charge('perplexity', call, 5000)) throw new Error('The search reservation remains held.');
        } catch (error) {
          await response.body?.cancel();
          throw error;
        }
        return response;
      };
    },
  };
}
