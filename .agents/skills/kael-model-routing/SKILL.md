---
name: kael-model-routing
description: "Design or review cost-first Kael routing and bounded fallback among Anthropic, DeepSeek and Perplexity only, with capability, budget, latency and incomplete-stream handling. Exclude tool authorization, provider procurement and adding OpenAI to runtime or budget."
metadata:
  library: nestscout-engineering-skills
  domain: kael
  specialty: cost-bounded-provider-routing
  consumer: codex,claude-code
  version: "1.0.0"
---
# Kael model routing

Minimize expected cost subject to measured task quality and approved capability.
Read root `AGENTS.md` and [provider evidence](references/source-evidence.md).
Allowed provider direction is Anthropic, DeepSeek and Perplexity only. OpenAI is
excluded from runtime/provider/budget; public evaluation research is separate.

## Inputs and selection

Locate the approved routing ADR, exact model/endpoint/SDK contracts, data permissions,
quality threshold, latency deadline, price snapshot/currency and budget owner.
The provider direction does not settle specific models, accounts or spending.
If these inputs are absent, return a conditional comparison, not a live router.

- Positive: “Audit this budget-limited fallback after an incomplete model stream.”
- Negative: “Approve a worker's tool” or “Purchase a new provider.”
- Neighbor: `kael-tool-permissions` enforces effects; routing cannot expand authority.
  `kael-agent-evaluation` establishes the task-quality evidence used by routing.

## Procedure

1. Classify the request's actual needs: reasoning, grounded search/citations,
   structured output/tool protocol, context length, modality and sensitivity.
   Filter to approved provider/model/endpoint capabilities and data handling first;
   do not route solely by nominal token price or assume compatible APIs are equal.
2. Verify current official documentation and actual pinned client support for each
   candidate. Record doc date, model ID, endpoint, availability and limitations.
   A Perplexity gateway can expose other upstream model providers; constrain the
   underlying model as well as the gateway. Do not silently route to an excluded
   provider through an aggregator.
3. Estimate total bounded cost from input/output, reasoning/search/tool charges,
   cache rules and possible retries, using approved current rates. Reserve the
   necessary budget before concurrent requests; release/settle reservations on
   actual usage or a conservative unknown-usage policy. Missing usage is not zero.
4. Select the least-cost eligible candidate meeting observed quality and latency.
   Use supplied evals, not brand reputation. Set max output/attempts, total deadline,
   per-request/session budget and escalation ceiling from the approved contract.
   No fixed model IDs, prices or default “best” vendor are supplied by this skill.
5. Classify failures by provider's actual semantics: invalid request/context,
   authentication/permission, quota/balance, rate limit, overload, timeout,
   refusal and invalid/incomplete output. Retry only appropriate transient
   failures within the remaining budget/deadline, honoring Retry-After when
   applicable. Do not spin on deterministic 4xx errors or top up an account.
6. Track streaming completion separately from HTTP connection success. Retain
   partial output as incomplete, not a usable final/tool decision. Bound fallback
   after a partial stream and reconcile any prior tool effects before resubmission.
   An endpoint's internal deployment failover is not Kael cross-provider fallback.
7. Preserve request/effect identity, tool correlation and permissions across every
   attempt. Revalidate schema and authority after fallback. Provider error or
   refusal cannot justify weakening policy or introducing a new provider.
   Expose exhausted budget/unavailable capability honestly to the caller.

## Validation and recovery

Replay synthetic success, malformed/context-too-large, missing credential, quota,
429 with retry hint, 5xx/timeout, malformed structured result, partial stream,
concurrent budget contention and exhausted fallback. Assert selected eligible
provider, bounded attempts/cost, terminal outcome and no duplicated effects.
Use current docs for error mappings; a 429 does not mean the same thing everywhere.

No billed API calls, credentials or sign-up are needed for a trace review.
Without approved rates/contracts, cost and execution remain BLOCKED/NOT MEASURED.
Without actual provider trials, synthetic routing does not prove quality or latency.

## Output and completion

Return eligibility/failure matrix, verified rate sources if used, routing decision,
budget accounting, actual trace/usage evidence and unresolved contract decisions.
Complete when allowed fallback preserves capability, authority and bounds or the
gaps are explicit. Root policy controls spending, keys and live provider changes.
