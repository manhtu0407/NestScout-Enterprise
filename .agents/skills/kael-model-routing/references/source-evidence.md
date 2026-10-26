# Source evidence: kael-model-routing

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.0; adoption mode
**PROJECT_NATIVE**. This records source/static review, not runtime efficacy.

## Decision and file scope

Original contract-driven routing preserves the approved provider direction without adding an SDK, billing integration or runtime. Mutable model IDs/prices are intentionally not embedded.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Primary-only authorship

No installable upstream package or upstream skill name/revision is claimed.
These independently worded instructions reference public technical documentation;
no proprietary text, example implementation, asset or SDK is redistributed.
Documentation access date is not an immutable upstream revision or SDK pin.

## Technical authority and version boundary

- [anthropicerrors](https://platform.claude.com/docs/en/api/errors) — Provider errors and streaming error outcomes; distinguish failure classes using actual endpoint/SDK.
- [deepseek](https://api-docs.deepseek.com/guides/tool_calls/) — Tool-call/result contract is implemented client-side; example SDK compatibility is not a provider choice.
- [deepseekerrors](https://api-docs.deepseek.com/quick_start/error_codes/) — 400/401/402/422 are not blanket transient retry cases; rate and overload have separate causes.
- [perplexity](https://docs.perplexity.ai/docs/router/routing-and-reliability) — Orchestrator deployment failover, deterministic errors and incomplete-stream semantics. Private-preview access is not established.
- [perplexityapi](https://docs.perplexity.ai/docs/agent-api/quickstart) — Gateway can expose multiple underlying providers; constrain actual model provenance.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named official documentation owners above; project-native authorship is explicit. |
| Correctness and depth | Cost-first applies only after capability/data/quality constraints. Aggregator upstream model provenance and private-preview availability require verification; no OpenAI runtime/budget is added. |
| Practical validation | Deterministic 4xx, quota, rate limit, partial stream and concurrent budget reservations cannot silently produce success, unlimited retries or duplicate tools. |
| Security/permissions | No hidden execution, feedback upload, telemetry, credentials, permission grants or implicit external write. Root policy and actual task remain authoritative. |
| Compatibility/maintenance | Portable string metadata and linked Markdown only. Runtime loading and measured task benefit require fresh evidence; static acceptance alone cannot prove them. |

No efficacy score is awarded. The proposed 85/100 source-screening heuristic is
not a standard and does not compensate for a security/license/provenance blocker.
Behavioral verdicts belong to the actual isolated runs, not this source review.

## Update and recovery

Recheck the pinned file diff, notices, declared dependencies/effects, official
versioned semantics and the positive/negative/neighbor cases before updating.
Refresh natural and explicit selection with the full installed library in each
runtime. Restore only the authorized package diff from its previous Git revision
for recovery; preserve unrelated skills and state. A source update never grants
permission to run its commands or install its sibling packages.
