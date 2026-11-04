# Kael Intelligence Foundation

## Intelligence Evaluation V1

The evaluation task starts from PR #94 merge
`4135b97d6e1f3db752ddb8fd7eefe9441d534aa8`. The owner-supplied
`Kael_Intelligence_Evaluation_Input.md` is its dataset, safety and acceptance
contract. It adds evaluation tooling and tests around the existing runtime;
business commands, approval/reconciliation, BPMN, the 180 service cases and the
72 original retrieval probes retain their original ownership and content.

The implementation reuses the previously authored evaluation fixtures without
regenerating their labels. PR #94's mobile integration, local Functions launcher
and real Auth/REST gateway regressions remain unchanged. The shared test harness
also applies the existing mobile sequence validator to every scripted runtime
stream; the report manifest binds that current parser and local integration code.
Corpus validation rejects duplicate normalized full transcripts even if their
canonical intent names differ. Semantic independence still needs human review.

Run these commands from the repository root with the locked Node 24 dependencies:

```sh
npm run kael:intelligence:evaluate
npm run db:start
npm run kael:knowledge:seed
npm run kael:intelligence:evaluate -- --local-sql
```

The first command is deterministic offline replay without provider network calls.
SQL mode uses the existing worktree/branch-owned, loopback-only Supabase stack
and authenticated PostgreSQL knowledge RPC with synthetic identities, rolled
back per query. It runs the same runtime with in-memory task/trace persistence;
it does not claim real REST or persistent-runtime integration. Existing
`db:mcp:test` supplies the separate Auth/REST and transaction regressions; start
`npm run kael:serve` in a separate terminal before running that suite. PR #94's
real Edge test must report `provider_unavailable`, with no provider credentials.
Do not target a hosted database or seed an unrelated stack. `db:stop` stops only
this branch's owned stack when finished.

Reports are generated in `.cache/kael-intelligence-offline.json` and
`.cache/kael-intelligence-local-sql.json`, with corresponding Markdown summaries.
They are disposable evidence outside committed source. Each report binds its
Git SHA and dirty state, canonical dataset/replay hashes, source manifest hashes,
conditions, per-category numerators/denominators, actual runtime tool attempts,
source ID/revision/hash references, response hashes and stable failure IDs.
Hashes use the existing SHA-256 canonical-JSON fingerprint convention; file
hashes fingerprint UTF-8 source strings. Timestamps and observed latency vary;
fixed inputs, source ordering, grades and content hashes are reproducible.
Reports omit full messages, response bodies, tool arguments and credentials.
The runner never asserts external test commands passed: attach their actual
exit evidence separately using the same delivered source manifest.

The versioned `scripts/kael-intelligence-scenarios.json` contains exactly 120
scenarios and 133 conversational turns, with the required ten category counts.
Forty scenarios carry informal/no-accent labels; eighty require no knowledge
tool. These are agent-authored, unreviewed labels, not a Vietnamese population
sample. Twenty stable anchor IDs in `kael-intelligence-registry.json` are proposed
for manual review and remain pending. `kael-intelligence-replays.json` separately
holds scripted responses and tool choices; the grader never uses those choices
as an exact required trajectory. The schema permits empty tools/sources and all
four knowledge-expectation values. It rejects exact copies of source titles or
aliases and original retrieval probes; five-word overlap is reported, while
semantic overlap and intent diversity still require human review. Revision
fingerprints prevent silently changing labels under the same committed registry.

Outcome regex assertions are narrow observable signals. Tool grading checks
allowed/forbidden calls, actual runtime argument validation, required authorized
business reads and required evidence. Optional retrieval can be omitted without
failure. With required knowledge disabled, the grader checks abstention rather
than demanding unavailable facts. Citation membership requires the actual
retrieved ID, revision and hash. Explicit forbidden business/price/provenance,
credential and hazardous-instruction signatures are hard failures, as are
wrong-role/source access and changed protected state. A malformed citation is
rejected even beside a valid reference; ordinary Markdown punctuation is allowed.
Required-evidence factual statements also need a relevant retrieved citation in
the same sentence and answer turn. A standalone source annotation supports only
the immediately preceding sentence in that paragraph. Sources record their first
retrieval turn, so later retrieval cannot justify an earlier claim. Explicit,
bounded Vietnamese abstention forms remain accepted by the grounding check when
evidence is unavailable; source-coverage and intent findings stay separate.
An explicit small set of acknowledgements and follow-up phrases is nonfactual;
those phrases alone cannot replace the required fact or abstention.
General conversation and optional/no-knowledge scenarios gain no citation duty.
These code checks do not
understand every paraphrase: subjective intent coverage, safety comprehension,
grounding and conversational quality remain unreviewed or NOT_RUN.

`KAEL_ENABLED_EFFECTS` is explicitly empty and numeric preview is disabled in
every scoring run. A separate evaluation transport boundary permits only the
existing read endpoints, denying submissions, other mutations and external
provider destinations even if an executor is called directly. Real local SQL
runs compare counts and sorted-row fingerprints for all non-Kael business and
permission tables in `public` and `nestscout_private` before/after the entire
run. The new pgTAP regression also checks actual owner/Worker/internal-source
boundaries and unchanged protected tables after untrusted-document retrieval.
Existing approval, reconciliation, pricing, Auth/REST and retrieval regressions
remain mandatory; the new suite does not replace them.

Matched RAG conditions use identical scenario messages, synthetic actor, fixtures,
scripted provider/model and prompt source. Only knowledge availability and
resulting tool availability differ. Record retrieval coverage, retrieval
decisions and evidence use separately from answer quality; additional RAG calls
never imply better answers. Per-scenario wall time, SQL transport time and
SQL function time are separate. The process is warm; database cache state is
uncontrolled, with no cold-cache or live-model latency claim. Scripted token
counts are labeled SCRIPTED_ONLY and monetary costs are null.

Initial local evidence: all 240 offline condition runs pass their scripted
signals. Real SQL mode passes 237/240, with zero hard violations and unchanged
protected tables. Grounded knowledge RAG-on passes 13/16; other categories pass
their full denominators in both conditions. `grounded_knowledge.006` and `.007`
miss `product.provenance`; `.015` misses `product.general`. The scripted runtime
abstains, failing both the expected-response regex and source-coverage signal.
These six reported signals on three scenarios require retrieval/label review,
not a claim of model failure or permission to change retrieval in this task.
All 144 original SQL retrieval outcomes retain exact source order/status.
Live RAG answer-quality deltas and human/model judging are NOT_RUN.

No live evaluation command is implemented. API keys and chat consent cannot
enable it; `--live` and budget flags fail closed. Future work requires fresh
owner authorization, a provider/model allowlist without implicit fallback,
scenario/request/token/wall-time limits and a monetary ceiling calculated from
an explicit price table and actual usage. Review the anchors and calibrate the
subjective rubric before setting live quality thresholds. Keep isolated
synthetic data, denied effects and disabled numeric preview for those runs too.

Validation commands include `npm run check`, `npm run verify:negative`,
`npm run db:test`, `npm run db:mcp:test`, `npm run db:types:check`,
`npm run db:lint`, `npm run db:drift`, and `npm run kael:knowledge:benchmark`.
The corpus, hard-grader counterexamples, runtime denial controls and replay
determinism tests extend `scripts/kael-evaluation.test.mjs`, already selected by
the Foundation suite. Scoring commands are separate from `check`; no live mode
is reachable through local tests or hosted CI. Pushing this feature branch
without an open PR does not match the inspected `main`-only push trigger.

The supplied research informs the separation of final outcomes from trajectories
([Anthropic](https://www.anthropic.com/research/demystifying-evals-for-ai-agents),
[Google Cloud](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/evaluation-agents)),
task-specific datasets and calibration
([OpenAI evaluation practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)),
workflow trace evidence
([OpenAI agent evaluations](https://developers.openai.com/api/docs/guides/agent-evals)),
and reuse of the existing runtime
([Building effective agents](https://www.anthropic.com/research/building-effective-agents)).
These references establish design rationale, not measured Kael intelligence.

## Foundation implementation history

Implemented on the feature branch based on `main` commit
`45860b2f42e875a114b5e7dc3cebf0816a8bd817` (merged PR #90), on 2026-11-04.
This is a local foundation, not a deployed service or a reviewed commercial policy.
The owner-provided research input in `Kael_Intelligence_Foundation_Codex_Kit.zip`
defines task scope. Current source, schema and business commands resolve its
indicative paths and historical references. Root `AGENTS.md` and root `README.md`
are unchanged; their older architecture descriptions do not establish current
runtime behaviour.

## Architecture and source responsibility

There is one Kael Runtime, in `services/kael-core/src/runtime.ts`, and one existing
NestScout business authority, in the workflow tables and guarded RPCs described in
[the workflow contract](service-workflow.md). Intelligence supplies explanatory
data through two registered `authorized_read` tools. No new service, language,
business state machine, quote table, payment command or product role is introduced.
Neither tool can submit a request or create an approval. Existing submission
confirmation, exact-payload fingerprinting, reconciliation and actor checks remain.

| Source | Responsibility |
| --- | --- |
| `services/kael-core/src/knowledge-contract.ts` | Typed cases/sources, family distribution, normalization and deterministic invalid-data checks |
| `services/kael-core/src/knowledge-cases.ts` | 180 curated problem rows, common family fields, 18 exemplar markers and 18 synthetic labor priors |
| `services/kael-core/src/knowledge-sources.ts` | Repository facts, unpublished policy slots, source snapshot and registry hashes |
| `services/kael-core/src/intelligence.ts` | Caller-JWT retrieval, citation validation, bounded model context, estimate calculation and inactive observation boundary |
| `services/kael-core/src/tools.ts`, `policy.ts`, `executor.ts` | Central tool definitions, access/gate checks and the existing executor dispatch |
| `services/kael-core/src/config.ts`, `context.ts` | Default-off numeric display and explicit source/pricing semantics in the existing prompt |
| `services/kael-core/src/runtime.ts`, `gateway.ts` | Fresh permission checks on repeated knowledge reads and minimal source-reference/latency logs |
| `scripts/kael-knowledge-registry.json` | Versioned manifest of every source revision, publication/provenance and content hash |
| `scripts/kael-retrieval-probes.json` | 72 separately authored Vietnamese held-out queries and expected source labels |
| `scripts/kael-knowledge.mjs` | Local-only corpus validation, trusted ingestion and actual SQL retrieval benchmark |
| `scripts/kael-knowledge.test.mjs` | Schema/negative tests, pricing, learning and scripted-runtime consumer regressions |
| `scripts/supabase-mcp.integration.test.mjs` | Additional real local Auth/REST ownership and concurrent ingestion tests in the existing sequential database suite |
| `supabase/tests/database/kael-knowledge.test.sql` | Transactional pgTAP access, source lifecycle and business-write denial tests |
| `package.json` | Reproducible commands, aggregate discovery and corpus TypeScript coverage |

The existing Kael tests and test backend gain the new registered tools without
removing their permission, confirmation or workflow assertions. The existing
Kael README and workflow capability map link these contracts. Mobile code and UI
are unchanged; new tool activity travels through the existing tool event contract.

## Data and provenance

Corpus version: `kael-vi-2026-11-04-v1`. There are **199 sources**: **180 synthetic
cases**, **10 repository-derived product facts**, and **9 unpublished policy
slots**. Exactly 190 sources are published for permitted signed-in accounts.
There are zero verified jobs, worker histories, customer reviews, public market
price references, verified transactions or human-reviewed technical directions
in this corpus. None are added to existing business seed fixtures.

| Knowledge family | Cases | Numeric synthetic priors |
| --- | ---: | ---: |
| Electrical | 30 | 0 |
| Plumbing | 30 | 0 |
| Air conditioning / ventilation | 35 | 0 |
| Cleaning | 30 | 11 |
| Upholstery / surfaces | 25 | 3 |
| Minor repairs | 30 | 4 |
| Total | 180 | 18 |

Each family has three marked structural exemplars. Every case includes multiple
Vietnamese expressions, accent-free aliases, hypothetical causes, two diagnostic
questions, safe observations, hazards, assumptions, included/excluded scope, cost
drivers and uncertainty. No case is a diagnosis. Hazards receive cautious generic
advice and professional intervention, without repair procedures. Corpus validation
is an agent-authored validation pass, not independent human or specialist review.
Family tags are knowledge tags: `service_taxonomy_ref` remains null because there
is no canonical approved commercial service taxonomy to assert availability from.

Product facts cover identity, capabilities, limits, transparency, lifecycle,
permissions, provenance, safety, general conversation and privacy. `repo:` source
references describe inspectable implementation contracts. `repository_verified`
does not mean owner-approved commercial policy; `reviewed_at` is null. Policies
for warranty, fees, refunds, SLA, commercial intake, live Worker adjustment,
reporting inaccuracies, settlement and service availability remain
`draft_unapproved`. No fictional official warranty or price document is published.

The registry records SHA-256 of canonical source JSON, with deterministic sorting.
Its aggregate hash also includes the derivative search representation. Validation
compares the committed registry against regenerated records; it never updates or
promotes a baseline automatically.

## Schema, authorization and lifecycle

Append-only migration:
`supabase/migrations/20261104123710_create_kael_knowledge.sql`.

- New table: `public.kael_knowledge_sources`. Immutable source revision snapshots,
  current-revision flag, provenance/publication/effective windows, owner/visibility,
  corpus/hash metadata and a derivative generated `simple` tsvector. A partial
  unique index permits one current revision; a GIN index supports lexical search.
- New read RPC: `public.kael_knowledge_search(text, integer, text, text)`, invoker
  security, caller JWT, at most ten rows at the SQL boundary and five in the tool.
  An exact source lookup is used for the local preview. No arbitrary SQL or owner
  argument is accepted.
- New private helper: `nestscout_private.knowledge_actor_valid()`. A tightly scoped
  definer reads only whether the current Auth account exists and is non-anonymous.
  This is necessary because authenticated clients cannot read `auth.users`.
- New private ingestion function:
  `nestscout_private.ingest_kael_knowledge(text, text, text[], text)`. Invoker
  security; executable only by the trusted database owner, not by authenticated,
  anonymous or runtime service roles. It hashes canonical source text in SQL,
  serializes changes by source, rejects revision conflicts/gaps and replaces the
  searchable current revision atomically while retaining history.

Authenticated users have column-scoped SELECT only, constrained by RLS. The raw
`source` column is protected; `public_source` is a generated projection with
`case_data.price_prior` set to null. Direct clients must name permitted columns;
wildcard and whole-row reads are denied. Search uses that same safe projection.
The table and RPC have
no anonymous access or runtime `service_role` bypass. Published/current/effective
sources only are visible; owner sources require the exact account; Worker sources
also require the existing active grant and fixture eligibility at query time.
User metadata and presentation mode do not grant visibility. Internal sources
remain invisible. The DB source row owns its index: a withdrawal or new revision
cannot leave an independently searchable old chunk. Runtime knowledge reads are
not cached, so repeated calls recheck the current source and role.

Publishing or withdrawing requires a new consecutive revision with
`supersedes_revision` naming the current one. Replaying an identical old snapshot
is idempotent and cannot resurrect it after withdrawal. Rollback means publishing
the intended content as another new reviewed revision, never editing old history.
No publication endpoint, automatic learning importer or promotion job is offered
to the model or mobile application.

Only the isolated local migration history was inspected. The checkout is unlinked;
there is no authorized hosted target/history to compare. The CLI-created filename
is later than all 23 existing repository/local migrations. Hosted applied history
must be checked before any separately approved hosted migration.

## Retrieval and boundaries

Vietnamese rendering keeps original diacritics. Search uses Unicode decomposition,
case/space normalization, accent-insensitive fallback, stop terms, original aliases
and PostgreSQL `simple` tokens, without claiming Vietnamese stemming. The exact
baseline matches a whole normalized title/alias. Lexical mode adds OR full-text
candidates, query-term coverage of at least 0.45 for two or more meaningful terms,
alias boost and small full-text rank, ordered deterministically by source ID for
ties. These rules were fixed before the held-out run; labels and cutoff were not
altered to turn misses into passes. There is no vector, fake embedding, semantic
provider or hybrid score. Optional hybrid and reranking remain NOT IMPLEMENTED
pending approved real embeddings and a measured same-query comparison.

Results include source ID, revision, content hash, corpus version, trust/provenance,
effective date, method, citation and a compact excerpt. The model tool strips case
price priors and carries a data-only notice. Citations must match the returned
ID/revision/hash. A denied/unavailable/no-match tool limits that operation only;
general writing, translation, reasoning and advice can proceed without RAG or
booking. Live request/quote/job questions still use the original business tools.

The existing eight-call run budget and sixty-second run deadline apply. Minimal logs include
run ID, tool, validated source citations, method version, duration and outcome.
Raw queries, passages, account identifiers, credentials and private text are not
added to those logs. The existing tool-execution audit still stores operation,
argument fingerprint and status rather than full retrieved content.

## Price preview and learning

Numeric display is **OFF by default**. `KAEL_ESTIMATE_PREVIEW=local_only` enables
the experimental calculation only with a loopback `SUPABASE_URL`; hosted URLs,
misleading loopback hostnames and internal service names cannot enable it.
`KAEL_KNOWLEDGE=disabled` removes both tools and disables preview. There is no
hosted numeric opt-in in this implementation.

The public search RPC always returns redacted cases, including exact-source
lookup. Local preview first performs that same authorized lookup, then loads the
bundled canonical source only after the loopback opt-in gate and an exact source
ID, revision and SHA-256 match. A missing, withdrawn, inaccessible, newer or
hash-mismatched source produces no numeric preview. No privileged pricing RPC,
client-controlled pricing flag or service-role read bypass is introduced.

The 18 priors are agent-generated coarse VND labor-only ranges for one small task
with safe floor access and known material. They have no market/transaction source,
no receipt, and no verified event. The other 162 require inspection or more scope.
Even local preview needs a currently permitted source and structured user-declared
area (rounded up), quantity, material, floor access, clear surface and no visible
damage. Each prior has its own maximum area (1–40 m²), one-unit limit and material
allowlist. Move-in/out priors cover one empty tile area at most 30 m², not an entire
arbitrarily sized apartment. Unknown or excessive scope is never extrapolated.
These declarations grant no rights. Hazards, missing scope, absent sources
and invalid priors return null amounts. Output distinguishes disabled,
insufficient evidence, inspection required and provisional range; every range has
assumptions, scope limits, exclusions, uncertainty, region/date and a Vietnamese non-binding
synthetic disclaimer. Example: `cleaning.desk-surface`, confirmed small empty desk,
returns 50,000–100,000 VND in local preview only. These amounts are speculative,
not a market finding or accepted quote.

Existing `propose_service_scope` applies only to the assigned currently eligible
Worker, a working fixture job, exact job version and idempotency key. Customer
`decide_service_scope` records the decision; the original quote stays unchanged.
`worker_corrections()` projects a work-correction note, not a price-editing API.
`accept_service_quote` is a Customer decision, not settlement. No universal live
Worker price correction, verified settlement or receipt command exists.

Consequently `observeLearning` is intentionally inactive for every input, including
forged receipts, Worker assertions, accepted quotes and local fixture events. It
stores no observation, verifies no amount and promotes no baseline. The candidate
type separates proposed, accepted and final amounts. Future activation needs an
authorized event/receipt reader with ownership, event/scope version, time, region,
privacy minimization, independence/outlier flags, explicit review and rollback.
There is no observation/quote/payment table in this change and no inactive adapter
is presented as a verified live integration.

## Local operations and verification

Use the existing isolated worktree/branch stack; commands refuse hosted targets,
linked checkouts, target overrides and another branch's containers. Do not import
synthetic cases into business tables.

```text
npm run kael:knowledge:validate
npm run db:start
npm run db:reset
npm run db:history
npm run kael:knowledge:seed
npm run kael:knowledge:seed
npm run db:test
npm run db:mcp:test
npm run db:lint
npm run db:drift
npm run db:types
npm run db:types:check
npm run kael:knowledge:benchmark
npm run check
npm run verify:negative
npm run db:stop
```

Seed replay retains the same source/hash/revision. The benchmark refuses a DB that
differs from the validated snapshot, including its search derivatives. It executes
the real read RPC as an authenticated test actor, on identical queries for both
strategies, and rolls back the benchmark actor and temporary results. Each run
prints full per-query source IDs, errors, hashes, counts and environment.

The 72 probes include the suggested first 60 (12 direct, 10 colloquial/accent/typo,
8 ambiguous, 8 safety, 6 policy, 6 general, 6 pricing and 4 access/injection) plus
12 expanded regressions. Labels were authored separately from case phrases and
validated against source IDs, uniqueness, distribution and exact-phrase leakage.
A separate specification-review agent independently inspected all 72 labels and
queries. They are agent-authored/agent-reviewed, not human-reviewed or the unavailable
historical six/eight queries reproduced verbatim.

Recall@k averages the fraction of expected source IDs found per positive query;
MRR@10 uses the first relevant source. Empty-result precision is correct labeled
empty queries divided by all empty results. Duplicate rate counts duplicate source
IDs among returned rows. SQL p50/p95 excludes network transport, provider/model
latency and native rendering; a single ordered local pass is not hosted capacity.

### Measured retrieval, 2026-11-04 at 20:21 Asia/Ho_Chi_Minh

Foundation baseline raw evidence: [3069eab benchmark](https://github.com/manhtu0407/NestScout-Enterprise/blob/3069eab584b67cac80ae8bb078926e6a76f20ca3/scripts/kael-retrieval-benchmark.json).
The run made 144 real SQL retrieval calls: 72 per strategy, with 59 positive and
13 no-match labels. Corpus hash:
`64209006e86dea921c33fa7454f3eab687e177b27246c66f521819debd38cc1a`.
Probe hash:
`956214f78997ae338a050de90d5032e9b9cb352bfcd3b7597961de1747a85a8b`.
The raw artifact also binds the applied migration hash and every returned source.

| Strategy | Recall@3 | Recall@5 | MRR@10 | Empty precision | Duplicate rate | SQL p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Exact / alias | 0.0593 | 0.0593 | 0.0678 | 0.1912 | 0 | 4.551 / 6.388 ms |
| Lexical | 0.9153 | 0.9153 | 0.8955 | 0.9167 | 0 | 4.617 / 7.444 ms |

Environment: Windows 10.0.26200, Node 24.19.0, PostgreSQL 17.11 in the isolated
Docker stack, Intel i7-12700H, 20 logical CPUs and 16 GiB RAM. Local SQL timings
are not network or model-response latency. No paid model calls were made.

Lexical retrieval found all eight expected safety sources within five results;
exact/alias found two of eight. This measures source coverage, not the safety of
live generated responses. Seven positive queries miss one or more expected
sources at five: `intent-04`, `ambiguous-01` through `ambiguous-04`, `pricing-04`
and `pricing-05`. `intent-04` (toilet tank continually refilling) returns no match;
the compressor-cost query retrieves other AC cases; the estimate-versus-accepted
quote query returns the lifecycle fact instead of the labeled provenance fact.
Several ambiguity probes retrieve one relevant issue but miss the other.

Two no-match labels return benign current product facts: `policy-06` returns
`product.transparency`, and `negative-04` returns `product.capabilities`. Neither
returns an unpublished or private document. These false positives are retained;
the cutoff and labels were not changed after measurement. There is no semantic,
hybrid or reranker comparison because none was implemented or called.

### Evidence ledger

| Evidence type | Actual scope and result |
| --- | --- |
| `schema_unit` | 34 new knowledge tests; 96 combined Kael tests PASS; deterministic validation covers all 180 cases and the committed registry |
| `local_postgres_real_sql` | 969 assertions across 29 pgTAP files PASS, including 53 new knowledge assertions; 12 local MCP/Auth/REST/race integration tests PASS; reset/replay, history, lint, drift and generated-type comparison PASS |
| `scripted_model` | Ordinary conversation in both modes, disabled/empty/denied retrieval, injected tool instructions, bounded local preview, disabled effects and original confirmation/reconciliation regressions; these are contract tests, not model-quality scores |
| `live_provider` | NOT RUN; no paid calls, real embeddings, live grounded-answer rate or model comprehension claim |
| `hosted_api` | NOT RUN for Kael/Supabase; no hosted migration, deployment, provider invocation or hosted CI |
| `native_device` | NOT RUN; no native-device, accessibility or screenshot claim |
| `human_review` | NOT RUN; no human or licensed technical review claimed |

Standards review: a separate agent identified nested-response validation and
nullable SQL CHECK gaps; both were fixed and rechecked without further actionable
findings. Specification review: another agent identified insufficient numeric
scope bounds and supplied-source validation gaps; both were fixed and rechecked,
and that agent independently reviewed all held-out labels. These reviews do not
substitute for the executable results or owner review.

`npm run check` PASS: 11 Supabase contract tests, 244 Foundation tests, mobile
typecheck/lint, and all 812 mobile tests in 68 suites, plus the reserved-file,
hygiene, comment, format, language, metadata, Markdown, YAML, workflow, secret,
database-type, Kael-type, test-discovery, capability and skill gates.
`npm run verify:negative` PASS: all 193 tests and its invalid fixtures. The first
aggregate attempts identified stale installed mobile dependencies; locked
`npm ci --ignore-scripts` subsequently succeeded without lockfile changes. It
reported 45 dependency advisories (1 low, 39 moderate, 5 high) in the unchanged
dependency graph; no dependency upgrades or audit suppression are included here.
A cold/concurrent mobile run had five five-second UI test timeouts; the final
aggregate running alone passed all 812 tests with the original test settings
(28.877 seconds for Jest). No assertion, timeout, test filter or coverage gate was
weakened. This is a local result, not proof that resource-sensitive UI tests cannot
flake. The task-owned stack was stopped after the database and benchmark runs;
no unrelated stack was stopped or removed.

## Foundation commit 3069eab file inventory

```text
docs/kael-intelligence.md
docs/service-workflow.md
package.json
scripts/git-environment.test.mjs
scripts/kael-core.test.mjs
scripts/kael-evaluation.test.mjs
scripts/kael-knowledge-registry.json
scripts/kael-knowledge.mjs
scripts/kael-knowledge.test.mjs
scripts/kael-retrieval-benchmark.json
scripts/kael-retrieval-probes.json
scripts/kael-test-harness.mjs
scripts/supabase-mcp.integration.test.mjs
services/kael-core/README.md
services/kael-core/src/config.ts
services/kael-core/src/context.ts
services/kael-core/src/executor.ts
services/kael-core/src/gateway.ts
services/kael-core/src/intelligence.ts
services/kael-core/src/knowledge-cases.ts
services/kael-core/src/knowledge-contract.ts
services/kael-core/src/knowledge-sources.ts
services/kael-core/src/policy.ts
services/kael-core/src/runtime.ts
services/kael-core/src/tools.ts
supabase/database.types.ts
supabase/migrations/20261104123710_create_kael_knowledge.sql
supabase/tests/database/kael-knowledge.test.sql
supabase/tests/database/private-function-security.test.sql
```

## Pricing data-exposure hardening

Pricing exposure hardening against `3069eab` adds
`supabase/migrations/20261104140804_protect_kael_price_priors.sql` without editing
the original migration, corpus, source registry, evaluation probes or business
contracts. The raw source remains owner-only engineering data. The generated
projection uses PostgreSQL's [independent generated-column privileges](https://www.postgresql.org/docs/17/ddl-generated-columns.html)
and an explicit column allowlist. The search RPC stays invoker-security with the
original RLS, ranking, limits and exact-source filter. The runtime accepts only
redacted retrieval results and restores a canonical bundled prior solely for a
permitted local preview with matching source ID/revision/hash.

The hardening changes these files:

```text
docs/kael-intelligence.md
scripts/kael-knowledge.mjs
scripts/kael-knowledge.test.mjs
scripts/kael-retrieval-benchmark.json
scripts/supabase-mcp.integration.test.mjs
services/kael-core/src/executor.ts
services/kael-core/src/intelligence.ts
supabase/database.types.ts
supabase/migrations/20261104140804_protect_kael_price_priors.sql
supabase/tests/database/kael-knowledge.test.sql
```

Standards and specification reviews independently inspected the focused diff and
reported no actionable findings. These are agent reviews, not human approval.
Refreshed evidence: 983 pgTAP assertions across 29 files PASS (67 knowledge
assertions), all 12 real local MCP/Auth/REST/race tests PASS, and 97 combined Kael
tests PASS. Database reset/replay, history, lint, schema drift and generated-type
comparison PASS. The task-owned stack was stopped after verification.
The final `npm run check` PASS includes 11 Supabase contract tests, 245 Foundation
tests, mobile typecheck/lint and all 812 mobile tests across 68 suites. The final
`npm run verify:negative` PASS includes all 193 tests and the invalid fixtures.
The final diff leaves the 180 cases, 72 probes, source registry, original migration,
tool registry, runtime coordinator and all business contracts byte-identical to
`3069eab`; only the documented read/preview boundary and its evidence changed.

One unchanged Worker certificate test failed once because its earlier removal
chooses the first certificate and can remove the later assertion's named target.
The unchanged full-suite rerun passed. No business implementation or test
assertion was altered to hide that ordering-sensitive result.

The refreshed [raw benchmark](../scripts/kael-retrieval-benchmark.json), measured
on 2026-11-04 at 21:23 Asia/Ho_Chi_Minh, has the exact same source order and status
for all 144 SQL calls as `3069eab`. All retrieval quality metrics, miss lists,
false positives and duplicate rates are unchanged. Corpus and probe hashes are
unchanged; the artifact now binds the hardening migration containing the applied
search/projection definition. No embeddings, providers or paid calls were used.

| Strategy | Recall@3 / @5 | MRR@10 | No-result precision | Before SQL p50 / p95 | After SQL p50 / p95 |
| --- | ---: | ---: | ---: | --- | --- |
| Exact / alias | 0.0593 | 0.0678 | 0.1912 | 4.551 / 6.388 ms | 4.922 / 10.471 ms |
| Lexical | 0.9153 | 0.8955 | 0.9167 | 4.617 / 7.444 ms | 5.287 / 9.014 ms |

These are single ordered local SQL passes, not a statistical performance study.
Lexical p95 increased by 1.570 ms in this sample; this is reported rather than
claimed to be an unchanged latency result. Safety-source recall remains 8/8 at
five, and the two original benign false-positive queries remain visible.

The new migration is applied after the original source migration. It protects
both existing source revisions and newly ingested revisions without rewriting
their content hashes or publishing new corpus versions. Column privileges also
deny JSON-path and whole-row serialization of the raw source; RLS still applies
to every permitted column. `SELECT *` is intentionally denied, so direct clients
must request `source_id`, `public_source` and other explicitly permitted metadata.
The search DTO keeps its existing shape, with `case_data.price_prior = null` in
every search mode and exact-source lookup, regardless of runtime flags.

New security evidence includes 14 additional pgTAP assertions, a real Auth/REST
raw-column/wildcard/JSON-path denial and forged RPC-flag test, plus runtime
rejection of old numeric-bearing responses and disabled/stale/hash-mismatched
local evidence. Existing local-only preview positive tests now consume the same
redacted DTO as the real RPC and still produce the original bounded preview.

## Research-to-code traceability

| Decision | Evidence or scoped assumption |
| --- | --- |
| One Runtime and guarded business effects | Current `runtime.ts`, `tools.ts`, `policy.ts`, `store.ts`; existing workflow contracts |
| Source filters before model context | Task R03/R09; [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security); actual RLS/REST tests |
| Simple lexical baseline with source context | Task R01/R07 and no paid-call authorization; [PostgreSQL full-text in Supabase](https://supabase.com/docs/guides/database/full-text-search); actual SQL benchmark |
| Versioned ingestion, withdrawal and new-revision rollback | Task R04/R11; transaction and concurrent replay tests |
| Separate retrieval versus generated-answer quality | Task R05/R10 and the historical offline failure described in the supplied research; benchmark labels its actual evidence type |
| Synthetic priors and default-off preview | Explicit owner research sections 6/8; deterministic provenance and price tests |
| Inactive verified-outcome learning | Inspected fixture scope/quote commands and absent settlement authority, not a speculative business workflow |

The vendor references are design inputs, not promises of accuracy or evidence of
private vendor architecture. Local evidence does not establish live model
groundedness, safety comprehension, human approval or native-device fidelity.
