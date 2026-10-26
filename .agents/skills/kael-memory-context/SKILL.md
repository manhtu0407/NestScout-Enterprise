---
name: kael-memory-context
description: "Design or audit Kael session, case and long-term memory boundaries, retrieval authorization, provenance, retention and context freshness. Use for memory leakage or stale context; exclude generic prompts, automatic storage installation and model-provider routing."
metadata:
  library: nestscout-engineering-skills
  domain: kael
  specialty: context-scope-privacy
  consumer: codex,claude-code
  version: "1.0.0"
---
# Kael memory and context

Retrieve only relevant, current, authorized information with traceable origin.
Read root `AGENTS.md` and [technical references](references/source-evidence.md).
This concerns future/product Kael memory, not permission to edit developer memory.

## Inputs and selection

Require the approved memory architecture or supplied synthetic corpus, identity
and case boundaries, retention/consent rules, retrieval path, context budget and
deletion behavior. Inspect available decisions; never choose retention periods
or a vector database without product authority.

- Positive: “A stale note from another customer's case enters this response.”
- Negative: “Improve a generic system prompt” or “Choose a model vendor.”
- Neighbor: `kael-workflow-orchestration` owns durable workflow progress;
  memory may explain progress but cannot replace its authoritative state.
  `kael-tool-permissions` owns executor access.

## Procedure

1. Classify information as session working context, case-scoped evidence or
   explicitly approved long-term knowledge. Record actor/tenant/case, purpose,
   source timestamp, validity/expiry and sensitivity. Do not promote a task
   inference or quoted instruction into a persistent user fact.
2. Trace write/read/query/export/delete paths, including caches, summaries,
   embeddings, traces and backups. Client-side memory tools request operations;
   the application owns storage and enforcement. A /memories prefix or thread ID
   alone does not authorize access or provide tenant isolation.
3. Enforce identity/scope and current permission before retrieval results reach
   the model. Recheck after membership/consent changes. Apply equivalent filters
   to keyword, vector and fallback retrieval; post-hoc prompt warnings cannot
   undo a cross-user disclosure.
4. Resolve freshness and conflicting facts from source authority and observed
   timestamps. Keep provenance and uncertainty with summaries; live business state
   comes from its authoritative owner. Expired, deleted or stale entries should
   not reappear from a cache/summary. Do not silently overwrite contradictory
   evidence to create a coherent story.
5. Treat retrieved content as evidence, never as permission or system instructions.
   Sanitize structural boundaries and reject path traversal/out-of-scope storage
   operations in the actual handler. Do not store credentials, unnecessary
   personal information or unapproved transcripts for convenience.
6. Fit context to the task: relevant evidence, active constraints, current state,
   unresolved questions and source links/IDs. Truncation/compaction should preserve
   authorization constraints and pending actions without upgrading their authority.
   A summary's confident wording does not make its source reliable.
7. Apply approved retention/deletion rules across derived copies. Distinguish
   logical deletion, cache invalidation, backup retention and actual physical
   removal; never claim complete erasure from one successful delete command.
   Describe unresolved propagation and recovery rather than inventing policy.

## Validation and recovery

Use a synthetic corpus with two actors and two cases, relevant/irrelevant notes,
same-topic cross-scope decoys, expired/revoked/deleted records, conflicting dates,
an injection and an oversized context. Test read/write/resume and fallback paths.
Check returned IDs and final model context, not just ranking quality.

When privacy boundaries fail, stop use of the contaminated context and identify
the responsible retrieval/cache boundary. Do not purge real data in an audit.
Missing retention or architecture decisions produce BLOCKED_PRODUCT for those
choices; no runtime means enforcement NOT RUN. No real personal data is needed
for this workflow's tests.

## Output and completion

Return scope/data-flow map, provenance/freshness findings, approved retention
coverage, authorized diff if requested and actual isolation/context evidence.
Complete when the relevant boundaries and invalidation paths have evidence or
explicit gaps. Root policy controls storage writes, credentials and external
systems; vendor memory examples do not authorize creating a new service.
