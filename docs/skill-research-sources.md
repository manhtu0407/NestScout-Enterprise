# Batch A source dossiers

Retrieved 2026-10-26 (Asia/Saigon), research revision A1.
This supports the [candidate specifications](skill-research-candidates.md);
it is neither an install manifest nor an assertion that all upstream behavior
is safe. Source instructions were treated as data; no upstream command, script,
feedback submission, SDK or model request was executed.

The public GitHub connector resolved commits, repository trees and files; official
web pages supplied technical/methodology references. GitHub API GETs and document
retrieval are source research, not product API execution. Exact file payloads,
SHA-256 ledger and web retrieval status/redirects were retained in ignored
`.cache/skill-research-batch-a/`. Only citations and analysis are committed.
The local input file hash is recorded in the
[adapted procedure](skill-research-evaluation-standard.md#provenance-and-maintenance).

## Immutable source revisions

| ID | Canonical source and maintainer | Type / pin | License observation and reuse boundary |
| --- | --- | --- | --- |
| E1 | [expo/skills](https://github.com/expo/skills), Expo Team / 650 Industries; motion credits Emil Kowalski | Official reusable skills; `d5caf7fdf8b4854351f05841a7e315ac87ad7d24` | Repository/plugin MIT; animation has its own Emil Kowalski MIT notice. Preserve applicable notices on later copying; linked packages/assets need their own review. |
| Q1 | [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/99b609a72323b70204eab407c622f436e858e112/pstack), Lauren Tan | Individual engineering workflows distributed in vendor plugin repository; `99b609a72323b70204eab407c622f436e858e112` | pstack/LICENSE is MIT, copyright 2026 Lauren Tan. Distribution is not evidence of measured effectiveness or official platform behavior. |
| S1 | [supabase/supabase](https://github.com/supabase/supabase), Supabase | Official documentation source, not a BE skill bundle; `478bd88d35e65c277e86c0f30b9a755851813303` | Root LICENSE is Apache-2.0; not a blanket clearance for every linked page/package. No code/text copied into candidate packages. |
| P1 | [postgres/postgres](https://github.com/postgres/postgres), PostgreSQL Global Development Group | Official docs on REL_17_STABLE resolved to `3e914438a3ac4abfde004b8a850cb198f64613f3` | COPYRIGHT permits software/documentation reuse subject to notices/disclaimer. Major 17 matches inspected config; server patch not probed. |
| RN1 | [react/react-native-website](https://github.com/react/react-native-website), Meta/React Native maintainers | Official version-0.87 accessibility doc; `d037e79188a6ee3caee91949fa9480affc06cf7b` | Root MIT notice observed. Documentation version is not NestScout's actual SDK, which remains unselected. |
| O1 | [openai/openai-agents-python](https://github.com/openai/openai-agents-python), OpenAI | Official SDK docs/code/tests, architectural reference only; `0dc4cf152bff1f50bdc0e41f28808563406545b2` | MIT. Does not authorize Python/OpenAI runtime adoption, tracing export, provider change or billed calls. |

The pins were resolved from read-only API responses, not invented from package
versions or retrieval dates. Expo/cursor commit metadata reported verified
signatures; this is not an independently verified supply-chain signature audit.
The other signature states were not independently assessed.

## E1 — Frontend bundle review

The tree response was not truncated. Retrieved every tracked file in the three
selected skill directories: native-ui 9, design-system 4, animation 4.
Also inspected plugin manifest/MCP configuration and license notices.
Instruction, frontmatter, command, link and dependency review identified:

- All three declare `version`, outside local V1 frontmatter. All carry
  `agents/openai.yaml`, outside local resource categories. Animation links
  root `RECIPES.md`, which V1 does not accept. Renaming a directory alone is
  insufficient; these are source references requiring a scoped adaptation.
- Every main skill suggests `npx --yes @expo/agent-cli@latest feedback`.
  That downloads/runs unpinned code and submits task context externally.
  No feedback was submitted; a later original candidate must omit that effect.
- Native-ui delegates to expo-ui/router/animation/data-fetching and includes
  storage, media permissions/network examples and GPU configuration beyond FE01.
  Its webgpu reference uses dependency installation, legacy peer resolution,
  prebuild and native-run commands. Those topics are outside FE01's narrow audit.
- Design-system prefers the existing styling system but supplies example layout,
  tokens and a drift score. Example architecture and a grep/SLOC score do not
  establish NestScout brand fit or a visual defect.
- Animation includes dependency/native-root configuration and gesture callbacks.
  Its device-verification requirement is useful, but timing tables and universal
  style prescriptions remain opinions until matched to an actual project.

No executable scripts are bundled inside the three reviewed directories, but
Markdown code blocks can still cause filesystem/network/device effects.
External linked docs/sibling packages and every implementation example were not
recursively audited or executed; this is not clearance to install the plugin.
The plugin MCP config points to `https://mcp.expo.dev/mcp`; no connection was made.

[Commit/PR #139](https://github.com/expo/skills/commit/d5caf7fdf8b4854351f05841a7e315ac87ad7d24)
records a plugin-format migration and author-reported cross-client tests.
Those are upstream claims, not observed NestScout Codex/Claude compatibility.
A first-page open issue/PR spot check was performed, not an exhaustive issue audit;
no claim of zero outstanding defects is made.

Result: R1 research evidence supports REVISE of FE01–03's verbatim adoption path.
Neither a well-known maintainer nor MIT licensing resolves package/scope conflicts.

## Q1 — Shared assurance workflow review

Both selected directories contain only their SKILL.md; pstack/LICENSE was read.
The complete two short workflows were reviewed.

`correct` combines recurrence analysis with architecture/type/lint/test changes,
per-class commits, local/CI execution and editing an agent instruction rule table.
The technique resembles root policy already present. Following it literally would
exceed this research task and protected-file/hosted-operation boundaries.

`blast-radius` requires real proof, actual consumers and unproven labels, but also
references how/why/arena/unslop companions and recommends multiple models for wider
changes. These companions were not adopted or invoked. A scoped review can use
existing tools without importing those workflows.

Both declare `disable-model-invocation: true`, rejected by V1 and inconsistent
with an assumption of automatic natural selection. No bundled network script or
credential dependency was present in these two directories; Git/history lookup,
scratch repro and optional companion behavior still require scope review.
A latest-page issue/PR sample is not exhaustive. No controlled performance claim
was verified. Result: REVISE for QA01/02; incremental value remains a hypothesis.

## S1 / P1 — Backend documentation

Read pinned RLS, database testing, migration and functions/auth documents, root
license, and the PostgreSQL 17 transaction-isolation source section.
These are engineering references; there is no inspected official reusable
`be-*` package to approve. RLS policy review must distinguish grants, policies,
views and elevated functions; fixture metadata checks alone cannot prove intended
per-user access. Migration advice needs actual history and consumer compatibility.
Isolation-level documentation does not prove external payment atomicity.

The Edge auth source now describes `@supabase/server`/`withSupabase`. That package
is not a dependency here. A local original review specification must inspect the
actual handler/version before relying on those APIs, not install the latest docs'
example. SQL/CLI examples can mutate schema/reset history; none were executed.

The [Supabase changelog](https://supabase.com/changelog.md) was fetched and scanned.
Followed the [TLS deprecation](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
and [Postgres minor release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
Their applicability to a live server/client is unverified; no project was queried.
This is source freshness evidence, not a dependency-upgrade recommendation.
No database, hosted project, key or credentials file was read or modified.

The docs' example CLI workflow does not supersede `scripts/supabase-local.mjs`.
The current wrapper/lock/test procedures remain canonical. Payment-provider webhook
sources cannot be pinned until an actual provider contract exists (BE04 gap).

## A1 / RN1 / M1 — Native technical references

- A1: [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)
  and [accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).
  Browser extraction returned a JavaScript shell; direct official accessibility
  Markdown retrieval succeeded. Reviewed guidance on adaptable text, assistive
  interaction and inspection. No app audit/certification occurred.
- RN1: [React Native accessibility](https://reactnative.dev/docs/accessibility)
  plus its pinned versioned source and MIT license below. Platform semantics
  and native assistive behavior require actual device testing.
- M1: [Reanimated compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)
  and [Expo integration](https://docs.expo.dev/versions/latest/sdk/reanimated/).
  Reanimated 4 requires New Architecture and version-specific compatibility.
  No NestScout Expo/RN version exists to match; latest-doc examples are not pins.

Apple web content has no immutable upstream Git revision or reusable-skill license
established in this review. Link/paraphrase it; any future verbatim text/asset reuse
needs separate clearance (BLOCKED_SOURCE for that copying claim). This does not
block a new, independently worded audit using technical references.
No official reusable FE04 package was identified; FE04 is an original proposal.

## O1 — Kael architectural reference

Retrieved handoff, HITL, guardrails and tracing docs, MIT license, approval helper,
and the approval-call-ID test file. Reviewed relevant instruction sections and
sampled implementation/tests; the entire SDK and its dependency tree were not
audited, installed or tested.

Important counterexamples to simplistic safety claims: parallel input guardrails
can allow tool activity before cancellation; local shell/file approvals are
opt-in; sticky approvals need identity/scope analysis. The sampled test file
contains changed-argument/replayed-call and nested approval cases, but no tests
were executed here. These are test ideas, not NestScout guarantees.

Tracing is enabled by default in the referenced SDK and can export sensitive
generation/tool data. No exporter/key or SDK was configured. The reference is
neither a provider choice nor permission to add OpenAI to Kael. SDK sessions,
memory or guardrails alone do not establish privacy, durable authorization,
transaction integrity or product quality.

## Mutable Kael documentation

| ID | Canonical source / maintainer | Reviewed scope and limit |
| --- | --- | --- |
| T1 | [Anthropic agent patterns](https://www.anthropic.com/research/building-effective-agents), [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), [memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool), [errors](https://platform.claude.com/docs/en/api/errors) / Anthropic | Workflow/agent distinction, client-side tool/memory execution and failure semantics. Architecture article is dated 2024 and explicitly warns tooling changed. No Kael BPMN/permission/retention decision follows from it. |
| D1 | [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/) / DeepSeek | Schema/tool-call contract; client executes tools. Initial no-trailing-slash requests timed out; alternate function_calling path returned an unrelated quickstart. Correct trailing-slash page was opened and fetched. Never treat the unrelated HTTP 200 as topic verification. |
| X1 | [Perplexity routing/reliability](https://docs.perplexity.ai/docs/router/routing-and-reliability) / Perplexity | Failover, deterministic request errors and partial-stream behavior; not provider quality/cost parity or a ready-made NestScout router. |
| T2 | [Demystifying agent evals](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) / Anthropic | Tasks, trials, traces, graders and end-state testing; methodology rather than measured benefit of any candidate. |

These are official product/engineering references, not licensed reusable Kael
skills. No immutable upstream revision or redistribution clearance was established
for these web pages; the observed content hashes below are retrieval evidence.
K03 still lacks an approved retention/corpus/oracle, BE04 a payment contract, and
K04 approved providers/budgets. No live quality, token, latency or cost comparisons
were performed; marketing/self-reported claims are not accepted as results.

### Web retrieval ledger

Fetched at approximately 2026-10-26 10:36 Asia/Saigon. Hashes identify retrieved
bytes, not stable upstream versions. Full bodies/status/redirects are ignored
scratch. Failed retrievals remain recorded rather than being counted as sources.

| Content | HTTP / SHA-256 |
| --- | --- |
| Apple accessibility Markdown | 200 / `c45284ed017ba5f39301c216f43a04f4fd1b9ee4299f5ce822b42e5d7b48954a` |
| Supabase changelog Markdown | 200 / `45528009025b8ad8487ccb73f7c769b66d4b0e7aa4560157047899dcb5b5a006` |
| Anthropic memory | 200 / `f31ede1f1f69a2eee676bf7cc932c4a93a99f734b58bf4e863fb754055fa539d` |
| Anthropic errors | 200 / `1b740aa1715410d4fc7c53bb637dcbd53602dda7e0d6dde7b55f8984a1ded5f2` |
| DeepSeek correct tool_calls/ | 200 / `75e870459ba551f018193f65dfe769eb95ec1d7b72523b319370fbecd26faf30` |
| Perplexity routing | 200 / `004308b8f06acaf967c658f90424a667ef3d92c01d72d455ba61fbc8f793618b` |
| Reanimated compatibility | 200 / `9c23f9435695aa0a3674d006b6000ef59b7879d2f3131f8af966fa062494894a` |
| Guessed Apple human-interface-guidelines/human-interface-guidelines.md | 404; excluded from substantive evidence |

The Apple root URL remains an official navigation reference; only the successful
accessibility document supports detailed Apple statements in this research.

## Evaluation methodology

O2: [OpenAI skill evals](https://developers.openai.com/blog/eval-skills) and
[skill workflow/tool boundary](https://developers.openai.com/plugins/concepts/skills)
were actually opened, not accepted from search snippets. They support separating
metadata selection, instructions and observable task/tool outcomes.
They do not prove a candidate improves this repository.

[Agent Skills specification](https://agentskills.io/specification),
[Anthropic authoring](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
and [enterprise evaluation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/enterprise)
were opened. Their portable format and evaluation advice are references; local
V1 restrictions and the existing harness remain the implementation contract.
Platform-specific deployment/API recommendations and sample query counts do not
authorize installs or replace the owner's SRES matched-comparison requirements.
These mutable web references have no immutable reusable-package pin established.

## Exact Git file inventory

A retrieved file is not automatically a fully audited dependency. Main skill
instructions, licenses and declared effects were reviewed; large SDK tests/code
and PostgreSQL source were sampled for the stated questions. External links and
transitive dependencies were not recursively cleared. Complete relevant bundle
review remains necessary before any later copying/installation.

| Repository / file inspected or sampled | Immutable Git blob |
| --- | --- |
| [expo/skills: LICENSE](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/LICENSE) | `548fbcb6e0cc27e99b2cd341feb421a67eafdd2f` |
| [expo/skills: plugins/expo/LICENSE](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/LICENSE) | `548fbcb6e0cc27e99b2cd341feb421a67eafdd2f` |
| [expo/skills: plugins/expo/skills/expo-animation/LICENSE](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-animation/LICENSE) | `57b46f1fd11dc62351ea548104a88aa3f659c11b` |
| [expo/skills: plugins/expo/skills/expo-animation/RECIPES.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-animation/RECIPES.md) | `92c64f12cd118df764499466eb0315b233a52c76` |
| [expo/skills: plugins/expo/skills/expo-animation/SKILL.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-animation/SKILL.md) | `c2a7fd0125e8375da1c365d99304f8664082e474` |
| [expo/skills: plugins/expo/skills/expo-animation/agents/openai.yaml](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-animation/agents/openai.yaml) | `312c925934e07a3781d1d0c9e196efe2f96f0603` |
| [expo/skills: plugins/expo/skills/expo-design-system/SKILL.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-design-system/SKILL.md) | `c18031baad61115c627f6c0b71f7ebfe6db25779` |
| [expo/skills: plugins/expo/skills/expo-design-system/agents/openai.yaml](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-design-system/agents/openai.yaml) | `2322f6ef8e7cfe1716bfc0254adb03a2faefe604` |
| [expo/skills: plugins/expo/skills/expo-design-system/references/audit.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-design-system/references/audit.md) | `0a6e276fb410982ca3f5167f69fbe925286e0a14` |
| [expo/skills: plugins/expo/skills/expo-design-system/references/native-slop.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-design-system/references/native-slop.md) | `b313f4c7f1f361b567b051682500a78245946bf6` |
| [expo/skills: plugins/expo/skills/expo-native-ui/SKILL.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/SKILL.md) | `db394506ab9b8086d6a089a5f9c897c4ba301f36` |
| [expo/skills: plugins/expo/skills/expo-native-ui/agents/openai.yaml](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/agents/openai.yaml) | `b41117eac0d64ecd7da917e692d62eb127b18ebc` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/controls.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/controls.md) | `05865bde831d647faae39fb3a8960bdc119f1b4f` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/gradients.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/gradients.md) | `329600dc1d3c683dcc15b29ee7bc61e112acb6a6` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/icons.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/icons.md) | `d23ac8f14586a2539993b645561e37e39393de3e` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/media.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/media.md) | `65813b4e20c6f532cd55c93a411471b887d7be24` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/storage.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/storage.md) | `c084f121367b6e9a6393af7f8c10b9247ccde108` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/visual-effects.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/visual-effects.md) | `fdf312a6c81979df0e9cd14df88c3f22d2e4e3c7` |
| [expo/skills: plugins/expo/skills/expo-native-ui/references/webgpu-three.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-native-ui/references/webgpu-three.md) | `58b5ce8046255f2c729b338da837a7e18804c356` |
| [cursor/plugins: pstack/skills/blast-radius/SKILL.md](https://github.com/cursor/plugins/blob/99b609a72323b70204eab407c622f436e858e112/pstack/skills/blast-radius/SKILL.md) | `b296cce0d746260a53c16e3671cb05bacfe82daf` |
| [cursor/plugins: pstack/skills/correct/SKILL.md](https://github.com/cursor/plugins/blob/99b609a72323b70204eab407c622f436e858e112/pstack/skills/correct/SKILL.md) | `c45e06f48a0982ae19f92c6e83a8cd05988097a3` |
| [expo/skills: plugins/expo/plugin.json](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/plugin.json) | `321e111044566cb574c0d43486dcaee1a1ea9743` |
| [expo/skills: plugins/expo/mcp.json](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/mcp.json) | `43b5f9131e601d150a4edb93e7f486124b9703ff` |
| [cursor/plugins: pstack/LICENSE](https://github.com/cursor/plugins/blob/99b609a72323b70204eab407c622f436e858e112/pstack/LICENSE) | `6b5400237fdf6545be0b8fae370d6f2fcff8fb25` |
| [openai/openai-agents-python: LICENSE](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/LICENSE) | `e5ad2c5aa30343f143a5c418004ca1a8d2cfaff4` |
| [openai/openai-agents-python: docs/guardrails.md](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/docs/guardrails.md) | `d7dfdcbc31a0343c4c29c75e86820ac2256d418e` |
| [openai/openai-agents-python: docs/human_in_the_loop.md](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/docs/human_in_the_loop.md) | `7eaf3518b9f9dfd912ca7ba4c7283b9214c5a8d5` |
| [openai/openai-agents-python: docs/handoffs.md](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/docs/handoffs.md) | `05e1d10ccf53aa4ecedff2ade88371bb14c35e36` |
| [openai/openai-agents-python: docs/tracing.md](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/docs/tracing.md) | `7da50e985a00de8a234402cdd55dfa79885f95fd` |
| [openai/openai-agents-python: src/agents/run_internal/approvals.py](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/src/agents/run_internal/approvals.py) | `4d44d1ec943212ab8d82802dbde3ec25886069bb` |
| [openai/openai-agents-python: tests/test_tool_approval_call_id_reuse.py](https://github.com/openai/openai-agents-python/blob/0dc4cf152bff1f50bdc0e41f28808563406545b2/tests/test_tool_approval_call_id_reuse.py) | `fd70acec4799418e21c2a54ab3c66f94d14d2e37` |
| [supabase/supabase: LICENSE](https://github.com/supabase/supabase/blob/478bd88d35e65c277e86c0f30b9a755851813303/LICENSE) | `49ea124025275674563eeff03af0f653ca49fdc0` |
| [supabase/supabase: apps/docs/content/guides/database/postgres/row-level-security.mdx](https://github.com/supabase/supabase/blob/478bd88d35e65c277e86c0f30b9a755851813303/apps/docs/content/guides/database/postgres/row-level-security.mdx) | `426913fffa0f8cb1c7b79e66d22129646081aa98` |
| [supabase/supabase: apps/docs/content/guides/database/testing.mdx](https://github.com/supabase/supabase/blob/478bd88d35e65c277e86c0f30b9a755851813303/apps/docs/content/guides/database/testing.mdx) | `57c64380a82405b80463205af4a9b643706e8008` |
| [supabase/supabase: apps/docs/content/guides/local-development/database-migrations.mdx](https://github.com/supabase/supabase/blob/478bd88d35e65c277e86c0f30b9a755851813303/apps/docs/content/guides/local-development/database-migrations.mdx) | `140a16ca69525ce9926f8762ef1d0f3c1c6a8d61` |
| [supabase/supabase: apps/docs/content/guides/functions/auth.mdx](https://github.com/supabase/supabase/blob/478bd88d35e65c277e86c0f30b9a755851813303/apps/docs/content/guides/functions/auth.mdx) | `254d3272a79ce2fa0c6f892d54a9d5265f3a5689` |
| [postgres/postgres: COPYRIGHT](https://github.com/postgres/postgres/blob/3e914438a3ac4abfde004b8a850cb198f64613f3/COPYRIGHT) | `0a397648dcd3c2177acc58bd7daecd11ad64be62` |
| [postgres/postgres: doc/src/sgml/mvcc.sgml](https://github.com/postgres/postgres/blob/3e914438a3ac4abfde004b8a850cb198f64613f3/doc/src/sgml/mvcc.sgml) | `380d0c9e8051ed123fd196d464d310dcb72d9c62` |
| [react/react-native-website: website/versioned_docs/version-0.87/accessibility.md](https://github.com/react/react-native-website/blob/d037e79188a6ee3caee91949fa9480affc06cf7b/website/versioned_docs/version-0.87/accessibility.md) | `a3793ad40464a01f2b5463965538b4152f9b441e` |
| [react/react-native-website: LICENSE](https://github.com/react/react-native-website/blob/d037e79188a6ee3caee91949fa9480affc06cf7b/LICENSE) | `b93be90515ccd0b9daedaa589e42bf5929693f1f` |

## Remaining source gates

Refresh pins and inspect deltas before a pilot; no latest-at-adoption claim is
made. Resolve any copied-resource license and retain notices. Do not copy
unsupported metadata/resources or feedback/MCP/installation behavior.
Pin linked implementation libraries only once actual product consumers/versions
are approved. Review issue history beyond spot samples before adoption.
No source completeness, reproducibility hash or official logo can substitute for
executed per-agent loading, negative routing and task-outcome evidence.
