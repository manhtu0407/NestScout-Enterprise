# Batch A candidate specifications

Research revision A1, 2026-10-26, against
`1b7414f3b743d116b470edbceef65e56150ce819`.
These 15 specifications implement R0–R2 of the
[procedure](skill-research-evaluation-standard.md), before any SKILL.md is written.
They propose developer-agent responsibilities, not application architecture.
[Sources](skill-research-sources.md) define source IDs, immutable revisions,
maintainers, file scope, licenses and observed risks.
[Conflicts](skill-research-conflicts.md) define primary ownership.

All tools below are prospective evaluation needs, not commands executed for a
candidate during Batch A. No candidate package or candidate revision exists.
For all 15 × both agents: discovery, explicit activation, implicit selection,
negative control, task outcome, coexistence, efficiency and A/B are NOT RUN.
Claude model gates are additionally BLOCKED_RUNTIME (observed logged-out CLI);
Codex CLI exists but no candidate runtime session was launched.
Product gates are BLOCKED_PRODUCT for absent app/schema/Kael consumers.
Descriptions/specifications here are hypotheses, not compatibility or efficacy PASS.

A1 source conclusions distinguish licensed reusable upstream skills (E1/Q1)
from official technical documentation (other sources). No third-party text/code
is vendored; source licenses are observations about identified files, not a
license decision for all linked resources. Missing future copying clearance stops
that adoption path without invalidating reference-only research.

## FE01 — fe-ios-hig-audit

R0: Tools can search or display screens, but do not establish contextual platform usability. A narrow audit may add value; ordinary UI work must not activate it.

R1 / disposition: REVISE. High scope/dependency drift; use only a future narrow original audit specification. Apple redistribution permission and product compatibility remain unverified.

| R2 field | Proposed specification |
| --- | --- |
| name | `fe-ios-hig-audit` |
| domain | frontend |
| responsibility | Audit iOS navigation, hierarchy, safe areas and adaptive platform conventions against the supplied design; return findings, not a redesign. |
| positive_triggers | Explicit iOS HIG/navigation audit; implicit request to inspect clipped native controls/back navigation on an existing iOS screen. |
| negative_triggers | Brand/token consolidation → FE02; gesture timing → FE03; screen-reader acceptance → FE04; backend or a new app scaffold. |
| inputs | Actual Expo/RN/Router versions, native screen/build, approved design and navigation task. |
| outputs | File/screen-linked platform findings, native reproduction steps, severity rationale and unresolved design decisions. |
| tools_needed | Existing source search, actual native runtime/Accessibility Inspector when available; no dependency installer. |
| permissions_boundary | Read-only audit by default; no new screens, packages, brand rules, builds or feedback submission without task scope. |
| dependencies | Real iOS app/SDK and design reference absent. Expo source points to expo-ui/router/data-fetching siblings; these are research dependencies, not installation requests. |
| verification | Reach back/dismiss/primary action with long labels, keyboard and large text; distinguish code suspicion from observed device defect. |
| failure_and_recovery | Missing native runtime/design → BLOCKED_PRODUCT; SDK-dependent advice → unresolved compatibility, no substitute browser certification. |
| stop_condition | Deliver bounded platform findings and handoffs; stop before implementing a redesign. |
| source_revision | E1 + A1; Expo official reusable skill plus Apple official guidance. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Proposed V1 name fits; upstream version field, agents/openai.yaml, broad media/storage/GPU scope and feedback command cannot be copied as-is. expo-native-ui explicitly delegates navigation to expo-router. |
| owner_decisions | Select actual SDK, supplied design and iOS minimum; authorize any future native audit environment. |

Unverified: No actual platform audit, native capture, approved design, package or trigger experiment.

## FE02 — fe-design-system

R0: Deterministic checks can enforce known tokens, but cannot alone judge a valid exception or reusable component API. Prove this residual gap first.

R1 / disposition: REVISE. High overlap with FE01/03 and over-extraction risk; upstream sample structure is not NestScout architecture.

| R2 field | Proposed specification |
| --- | --- |
| name | `fe-design-system` |
| domain | frontend |
| responsibility | Audit reuse of the app's existing theme tokens and component variants/states; identify drift against that declared system. |
| positive_triggers | Explicit theme/component drift audit; repeated visual values disagree with an already approved token system. |
| negative_triggers | Choose iOS navigation conventions → FE01; animate a sheet → FE03; authorize a brand replacement or create app layout. |
| inputs | Real token entry point/styling library, component consumers, approved visual values and repeated drift examples. |
| outputs | Token/consumer map, verified drift versus valid one-offs, smallest component-contract proposal and local checks. |
| tools_needed | rg, existing compiler/tests and native rendering only when present. |
| permissions_boundary | No new theme, styling library, shared folder or bulk rewrite inferred from a research/audit request. |
| dependencies | FE01 only for a platform-value question; FE03 owns motion behavior. Existing design system/app is absent. |
| verification | Compare real component variants/loading/disabled states and rendered consumers; grep hits are candidates, not automatic violations. |
| failure_and_recovery | No system/approved values → record pending product input; do not bootstrap the upstream example folder layout. |
| stop_condition | Return bounded drift findings; propose shared extraction only with real consumers. |
| source_revision | E1 + RN1; Expo reusable skill with official React Native guidance. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Upstream version field and agents/openai.yaml are outside V1. FE02 may store approved motion values, while FE03 chooses/validates behavior. Keep the actual styling library's idiom. |
| owner_decisions | Approve theme/brand and extraction consumers before any later implementation. |

Unverified: No token consumers, native comparison, false-positive measurement or efficacy comparison.

## FE03 — fe-native-motion

R0: A profiler reports frames; it does not resolve interruptibility or animation purpose. Candidate usefulness requires native baseline failures.

R1 / disposition: REVISE. High native dependency and recipe side-effect risk. Preserve Emil Kowalski MIT notice if later copying covered material.

| R2 field | Proposed specification |
| --- | --- |
| name | `fe-native-motion` |
| domain | frontend |
| responsibility | Audit or implement explicitly scoped gestures, animation/haptics and interruption behavior in an existing native interaction. |
| positive_triggers | A drag stutters or loses velocity on interruption; explicit native motion/haptic review. |
| negative_triggers | Static colors/component variants → FE02; workflow agent routing → K01; server retries → BE04. |
| inputs | Interaction contract, SDK/architecture and animation dependency versions, device/build and reduced-motion expectations. |
| outputs | Animate-or-not rationale, thread/gesture ownership, scoped motion change proposal and device acceptance steps. |
| tools_needed | Existing native profiler/runtime and project tests; no npx install, prebuild or EAS invocation during research. |
| permissions_boundary | No animation packages, native config changes, builds, data deletion or media/network effects inferred from recipe examples. |
| dependencies | Upstream assumes Reanimated 4/worklets/New Architecture, gesture-handler and optional keyboard/haptic packages. None selected for this repository. |
| verification | Interrupt/reverse/flick interaction; reduced motion, keyboard and frame behavior on supported release device; static checks only support code-level claims. |
| failure_and_recovery | Missing supported SDK/device → BLOCKED_PRODUCT; refuse benchmark/FPS claims from code or Expo Go alone. |
| stop_condition | Stop at the approved motion unit and measured limitations; no architecture migration. |
| source_revision | E1 + M1; Expo reusable motion skill and Software Mansion/Expo compatibility references. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Upstream RECIPES.md and agents/openai.yaml violate current resource layout; version is unsupported frontmatter. Source's fixed timing rules are opinions, not universal measured platform facts. |
| owner_decisions | Choose app SDK/architecture, device performance budget and approved interaction behavior. |

Unverified: No native frame measurement, gesture/haptic observation, dependency resolution or model evaluation.

## FE04 — fe-accessibility-qa

R0: Static lint/prop checks cannot establish spoken order or keyboard/task completion. There is a plausible distinct QA gap once a UI exists.

R1 / disposition: RESEARCH_ONLY. High evidence risk; copying Apple text/assets requires separate licensing review; current research paraphrases and links.

| R2 field | Proposed specification |
| --- | --- |
| name | `fe-accessibility-qa` |
| domain | frontend |
| responsibility | Evaluate native screen-reader traversal, labels/state, large text, focus, keyboard and reachable targets. |
| positive_triggers | Explicit VoiceOver/large-text acceptance check; a loading button loses its accessible name. |
| negative_triggers | Approve brand appearance → FE02; backend role denials → BE02; motion implementation → FE03. |
| inputs | Real native screen/build, task path, accessibility settings and supplied acceptance requirements. |
| outputs | Reproduction per assistive setting, failed control/state, evidence and native retest needs. |
| tools_needed | Actual VoiceOver/Accessibility Inspector/hardware keyboard and existing tests when available. |
| permissions_boundary | No compliance certification, app scaffolding, global settings changes or device/build setup inferred. |
| dependencies | Native app/device and expected semantics absent; FE03 secondary only for a reduced-motion defect. |
| verification | Traverse and activate primary task without sight, reflow large text, retain focus after state/error changes; source props alone are insufficient. |
| failure_and_recovery | Missing device/app → BLOCKED_PRODUCT; uncertain semantic behavior stays unverified. |
| stop_condition | Deliver accessibility defects and retest scope; hand off implementation to the owning component/motion layer. |
| source_revision | A1 + RN1; official documentation, no official reusable candidate package identified. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Original text-only specification can fit V1; React Native 0.87 documentation is a source revision, not the unselected NestScout SDK. |
| owner_decisions | Select supported OS/devices, accessibility acceptance and actual interface. |

Unverified: No native audit, expert certification, actual component tests or trigger observation.

## BE01 — be-schema-migrations

R0: db:* already executes/checks history and types. Only cross-consumer compatibility reasoning could justify a skill; test whether runbook/policy baseline already suffices.

R1 / disposition: RESEARCH_ONLY. High data risk, low need for new tooling; shortlist conditional on a measurable residual gap.

| R2 field | Proposed specification |
| --- | --- |
| name | `be-schema-migrations` |
| domain | backend |
| responsibility | Review schema change ordering, constraints, migration history and compatibility with actual consumers using canonical local DB tooling. |
| positive_triggers | Explicit migration compatibility review; column change affects an older typed consumer. |
| negative_triggers | Choose product entities/BPMN; RLS policy design → BE02; money/concurrent transitions → BE04; run a migration command already fully specified. |
| inputs | Authorized migration diff, applied local history, existing consumers/types, target identity and recovery expectations. |
| outputs | Compatibility/constraint findings, ordered expand/contract proposal, canonical local verification and recovery limits. |
| tools_needed | Existing db:history/db:drift/db:types:check/db:test paths and source search; commands only for an owned disposable target in a later authorized pilot. |
| permissions_boundary | No hosted writes, reset of shared DB, business schema import or independent migration runner. |
| dependencies | Existing Supabase wrapper, PostgreSQL 17 target, Docker/local fixture for execution; BE02 secondary only for changed grants/policies. |
| verification | Disposable replay/history/drift/type checks, constraint rejection and old/new consumer compatibility; Git revert alone does not undo data. |
| failure_and_recovery | No business consumer → BLOCKED_PRODUCT; no owned stack → execution BLOCKED_RUNTIME; preserve history and propose roll-forward. |
| stop_condition | Return migration evidence and compatibility decision; no promotion/deploy. |
| source_revision | S1 + P1; pinned official documentation, independently authored candidate. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Fits text/reference-only V1 conceptually. Docs are newer than a chosen server patch; inspect actual container version before SQL claims. |
| owner_decisions | Authorize local schema fixture and any wrapper-approved reset/replay; approve actual domain schema separately. |

Unverified: No migration/consumer pilot or live DB commands executed in Batch A; no product schema exists.

## BE02 — be-auth-rls

R0: Catalog guards catch classes of exposure, not intended per-row access across actors. Conditional hypothesis: structured deny-case review adds coverage over existing runbooks.

R1 / disposition: RESEARCH_ONLY. Critical authorization risk; strongest backend pilot opportunity because existing local test path is available.

| R2 field | Proposed specification |
| --- | --- |
| name | `be-auth-rls` |
| domain | backend |
| responsibility | Review authorization at the database trust boundary: claims, grants, row policies, views and RPC exposure. |
| positive_triggers | Explicit cross-user/role deny audit; a changed view/RPC may bypass row ownership. |
| negative_triggers | Login screen styling; Kael tool approval policy → K02; a routine catalog-check command with no authorization judgment. |
| inputs | Actual role/ownership matrix or clearly synthetic fixture matrix, schema/policy diff and test identities. |
| outputs | Allow/deny table, bypass path findings, pgTAP assertions and unverified application-role requirements. |
| tools_needed | Existing pgTAP/db:test, generated types and guarded local SQL workflow when separately authorized; no hosted project access needed. |
| permissions_boundary | No service-role secret in client, credentials inspection, hosted execute_sql, blanket permissive policy or silent role invention. |
| dependencies | Existing local SQL security test covers metadata invariants; business-role tests and product auth are absent. |
| verification | Owner/other-user/anonymous/denied-role reads and writes; claims change freshness, view security and RPC privilege paths; require actual assertions. |
| failure_and_recovery | No role contract → BLOCKED_PRODUCT; no owned database → runtime blocked. Missing deny evidence cannot be reported as authorization PASS. |
| stop_condition | Return database-boundary findings; hand off tool-use approvals to K02, migration ordering to BE01. |
| source_revision | S1 + P1; pinned official RLS/testing documentation. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | V1 text specification possible; current security.test.sql is catalog hygiene, not Customer/Worker allow-deny proof. |
| owner_decisions | Approve synthetic role fixture for pilot; supply real product role matrix before product claims. |

Unverified: No business-role SQL evaluation, actual auth session behavior or matched model runs.

## BE03 — be-edge-api

R0: A schema validator can enforce a known contract; cross-consumer failure semantics may need workflow guidance. No current repeated consumer establishes need.

R1 / disposition: RESEARCH_ONLY. High API/security/dependency drift; defer pilot behind real handler contract.

| R2 field | Proposed specification |
| --- | --- |
| name | `be-edge-api` |
| domain | backend |
| responsibility | Review an existing Edge/API boundary's input/output contract, authentication handling, timeout and failure responses. |
| positive_triggers | Explicit Edge request contract review; malformed/unauthorized request is accepted or error details expose internals. |
| negative_triggers | Kael tool permission grant → K02; transaction atomicity → BE04; adding an API framework because no API exists. |
| inputs | Real handler/schema and callers, expected status/errors, auth boundary and runtime/dependency versions. |
| outputs | Contract/failure matrix, consumer-linked findings and existing-runner test proposal. |
| tools_needed | Current API tests/runtime if present; static search now. No new Deno/runtime/dependency/harness. |
| permissions_boundary | No function deployment, live request, new server package, secrets or provider calls during Batch A. |
| dependencies | No Edge handlers/runtime consumers in repository. Current upstream auth docs introduce @supabase/server; this is not an installed dependency. |
| verification | Malformed body, auth denial, method/status/error schema, timeout and retry behavior using isolated real handler calls when approved. |
| failure_and_recovery | Missing handler/runtime → BLOCKED_PRODUCT; source API advice must be matched to exact installed version before implementation. |
| stop_condition | Return boundary review; do not create a function or invent endpoint architecture. |
| source_revision | S1 functions/auth.mdx and official Supabase API guidance. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Text-only V1 draft possible; upstream package/withSupabase example is not compatible evidence for this tooling-only repository. |
| owner_decisions | Approve endpoint and actual auth contract/runtime before any implementation/pilot. |

Unverified: No API execution, Deno compatibility, package import verification or client/server contract tests.

## BE04 — be-transaction-integrity

R0: Unique constraints/idempotent code enforce known invariants; a review workflow may reveal missing cross-effect races. Need is not yet observed.

R1 / disposition: RESEARCH_ONLY. Critical money/data risk and missing payment source/consumer; no current pilot priority.

| R2 field | Proposed specification |
| --- | --- |
| name | `be-transaction-integrity` |
| domain | backend |
| responsibility | Review atomic state transitions, idempotency, concurrency, event ordering and reconciliation at a database/effect boundary. |
| positive_triggers | Duplicate/reordered payment event or two concurrent reservations can produce inconsistent state. |
| negative_triggers | Decide which tools Kael may invoke → K02; route a timeout/handoff → K01; choose a payment provider. |
| inputs | Approved invariant/state transition and effect contract, isolation/constraint choices, retry semantics and synthetic event history. |
| outputs | Race/duplicate timelines, invariant checks, transaction/reconciliation proposal and unresolved external-effect assumptions. |
| tools_needed | Existing PostgreSQL/Supabase fixture path and test runner; concurrent sessions only in a later approved local fixture. |
| permissions_boundary | No live booking/payment/refund, provider registration, webhook delivery or fabricated financial correctness. |
| dependencies | P1 matches PostgreSQL major 17; no booking/payment schema/provider contract exists; BE01/02 secondary for schema/authorization. |
| verification | Two-session conflicts, same-key duplicates, reordered events, crash/retry and reconciliation; assert final state/effect count rather than response text. |
| failure_and_recovery | Missing invariant/provider contract → BLOCKED_PRODUCT; do not assume an external effect shares a DB transaction. |
| stop_condition | Return invariant evidence and safe recovery proposal; no real financial effect. |
| source_revision | P1 + S1; official transaction and local testing references. Payment-provider/webhook source not selected. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Original text specification fits V1 conceptually; no payment library/database or effect runner is added. |
| owner_decisions | Approve BPMN, money/state invariants and payment contract before relevant fixture or product tests. |

Unverified: No concurrency execution, provider-specific retry contract or financial product verification.

## K01 — kael-workflow-orchestration

R0: A deterministic state machine should enforce transitions. A developer review skill may help find omissions but cannot substitute for that implementation.

R1 / disposition: RESEARCH_ONLY. High speculative architecture risk; defer product pilot.

| R2 field | Proposed specification |
| --- | --- |
| name | `kael-workflow-orchestration` |
| domain | kael |
| responsibility | Review developer-specified workflow states, routing/handoffs, timeout, terminal conditions and recovery. |
| positive_triggers | Explicit workflow state/recovery audit; an approved handoff loops after a tool timeout. |
| negative_triggers | Grant tool authority → K02; enforce booking atomicity → BE04; create multi-agent architecture from the Kael name. |
| inputs | Owner-approved BPMN/state machine, tool contracts, terminal outcomes, timeout/retry budget and trace. |
| outputs | State/transition map, missing termination/recovery cases and scenario assertions. |
| tools_needed | Existing harness/synthetic traces for review; no SDK installation/model requests. |
| permissions_boundary | No runtime agent/provider selection, tool grant, autonomous messages or new framework. |
| dependencies | Kael runtime/BPMN absent; K02 defines effect permission, BE04 defines atomic backend transition. |
| verification | Ambiguity/timeout/handoff denial and repeated-event traces reach allowed terminal state with bounded work; check end state. |
| failure_and_recovery | No BPMN/runtime → BLOCKED_PRODUCT; decline to fill product policy with upstream examples. |
| stop_condition | Deliver orchestration findings and dependencies; no runtime build. |
| source_revision | O1 handoffs/HITL + T1; SDK reference and Anthropic architecture article, not reusable Kael skill. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Python SDK architecture is reference-only for the Node tooling repository. Current article warns its 2024 tooling has changed. |
| owner_decisions | Supply BPMN, handoff responsibilities and timeout/stop expectations. |

Unverified: No workflow execution, framework choice, natural selection or Kael outcome evidence.

## K02 — kael-tool-permissions

R0: Permissions belong in deterministic enforcement. Only an evidence-led audit of cross-tool/approval gaps might warrant a skill beyond existing root guidance.

R1 / disposition: RESEARCH_ONLY. Critical authority risk. Promising safety research, but no approved product contracts for a pilot now.

| R2 field | Proposed specification |
| --- | --- |
| name | `kael-tool-permissions` |
| domain | kael |
| responsibility | Review per-role tool capability, sensitive-effect approvals, least privilege and approval audit/replay boundaries. |
| positive_triggers | Explicit tool permission audit; a changed argument or role reuses an old approval. |
| negative_triggers | Database row policy implementation → BE02; API body validation → BE03; infer rights from developer MCP availability. |
| inputs | Approved actor/tool/effect matrix, sensitive-action list, executor identity and redacted approval/tool trace. |
| outputs | Allow/deny/approval matrix, executor enforcement findings, replay/cross-role tests and unresolved owner decisions. |
| tools_needed | Offline source/trace review and existing fixture snapshots; no real sensitive tools. |
| permissions_boundary | A skill advises developers; backend executor checks enforce product permissions. No approval is granted by a model explanation or successful guardrail. |
| dependencies | K01 supplies workflow location, BE02 persistent access, BE04 effect idempotency; no Kael executor exists. |
| verification | Denied-role execution count stays zero; changed arguments/target/identity invalidate approval; nested/handoff calls retain boundaries. |
| failure_and_recovery | No matrix/executor → BLOCKED_PRODUCT; fail closed on missing approval, without claiming a synthetic denial proves live enforcement. |
| stop_condition | Return permission design gaps and executor tests; no credential/tool configuration writes. |
| source_revision | O1 HITL, guardrails, approval helper and sampled replay tests + T1 tool-use docs. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | V1 cannot encode real runtime permissions via frontmatter. Parallel guardrails and optional approvals need explicit executor analysis; SDK is not adopted. |
| owner_decisions | Define roles, sensitive effects, approval validity and audit retention. |

Unverified: No actual authorization enforcement, approval UI, live tool denial or cross-runtime model comparison.

## K03 — kael-memory-context

R0: Storage and access controls enforce boundaries; a review workflow might expose stale/untrusted context issues. It cannot replace database access enforcement.

R1 / disposition: RESEARCH_ONLY. Critical privacy/retention risk; immutable licensed reusable memory skill and product contract not established.

| R2 field | Proposed specification |
| --- | --- |
| name | `kael-memory-context` |
| domain | kael |
| responsibility | Review context/session/case memory boundaries, retrieval provenance, stale information, isolation and retention decisions. |
| positive_triggers | Explicit memory isolation review; another user's case enters retrieved context or expired memory is reused. |
| negative_triggers | Schema migration implementation → BE01; provider routing → K04; build a vector database/memory framework without a consumer. |
| inputs | Approved memory scopes/retention, data classification, retrieval contract and synthetic case/session histories. |
| outputs | Context lineage/isolation map, stale/injection/leak cases, minimization and deletion test requirements. |
| tools_needed | Offline fixtures and existing source search; no real customer data, embeddings or external retrieval service. |
| permissions_boundary | No persistent user memory update, PII import, index creation or privacy compliance claim. |
| dependencies | Identity/case model, retention owner, storage/retrieval contract absent; session storage alone does not establish long-term retrieval quality. |
| verification | Cross-user/case deny, stale/deleted data exclusion, retrieval-source injection and bounded context; actual retrieval ranking requires a later corpus/oracle. |
| failure_and_recovery | No scope/retention decision → BLOCKED_PRODUCT; no evidence of retrieval quality → NOT RUN, not a memory-success claim. |
| stop_condition | Deliver isolation/retrieval findings; no persistence layer. |
| source_revision | T1 memory-tool documentation + O1 context/approval references; official docs, no reusable candidate package. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Application must implement memory file operations securely; documentation does not provide NestScout retention enforcement. No novel V1 hooks. |
| owner_decisions | Approve data scopes, retention/deletion, retrieval corpus and privacy review requirements. |

Unverified: No memory corpus, retrieval metrics, deletion/isolation execution or legal determination.

## K04 — kael-model-routing

Provider direction is already chosen: Anthropic, DeepSeek and Perplexity.
The owner's bounded-hardening clarification corrects A1's "not selected" wording;
it does not approve concrete model/SDK bindings, routing/fallback implementation,
API/tool/stream contracts, data handling, budgets or runtime implementation.

R0: Routing belongs in code once criteria exist. A skill has no demonstrated recurring consumer now; a technical comparison document may suffice.

R1 / disposition: BLOCKED_PRODUCT. High cost/privacy/quality uncertainty; mutable docs do not provide a redistributable routing skill.

| R2 field | Proposed specification |
| --- | --- |
| name | `kael-model-routing` |
| domain | kael |
| responsibility | Review routing/fallback policy against task quality, allowed provider capabilities and bounded latency/budget/failure behavior. |
| positive_triggers | Explicit offline provider fallback review; a stream fails after emitting partial output and a retry could repeat an effect. |
| negative_triggers | Procure providers/change billing; add OpenAI as Kael runtime provider; workflow state routing → K01. |
| inputs | Chosen provider direction, plus separately approved task/output and runtime/API contracts, privacy/cost/timeout budget and recorded synthetic failure traces. |
| outputs | Capability comparison with source dates, fallback stop criteria, cost/latency fields only when measured and unsafe retry cases. |
| tools_needed | Official docs and offline fixtures; no keys, paid inference, benchmark requests or new routing framework. |
| permissions_boundary | API-format similarity is not capability/quality parity or authorization to transmit data. Replayed calls must retain K02/BE04 boundaries. |
| dependencies | Anthropic, DeepSeek and Perplexity are the chosen provider direction; concrete model/SDK bindings, runtime/API contracts and budgets remain unapproved. No runtime exists. |
| verification | Offline timeout/rate-limit/invalid-request/partial-stream cases; later matched live quality and budget measurement requires explicit separate access. |
| failure_and_recovery | Absent approved runtime/API contracts or budgets → BLOCKED_PRODUCT; chosen direction alone does not establish implementation readiness; live performance/fallback claims → NOT RUN. |
| stop_condition | Deliver comparison and unverified items, without recommending a default provider from unmeasured claims. |
| source_revision | T1 errors + D1 + X1, official mutable provider docs; retrieved content hashes in source dossier, no immutable upstream skill revision. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | No runtime/model configuration is proposed. Docs version and observed source URL are not NestScout SDK compatibility. |
| owner_decisions | Within the chosen provider direction, approve concrete models, runtime/API contracts, data handling, budgets and quality thresholds before implementation or billed testing; provider reselection is not implied. |

Unverified: No measured quality, prices/latency benchmark, provider parity, active-account capability or failover execution.

## K05 — kael-agent-evaluation

R0: Snapshot verification detects mutations, not task success or unexecuted claims. A bounded trace-grading workflow has a distinct gap to test without adding infrastructure.

R1 / disposition: RESEARCH_ONLY. High grading/attribution risk; shortlist only for an offline trace-review pilot after QA/local gates.

| R2 field | Proposed specification |
| --- | --- |
| name | `kael-agent-evaluation` |
| domain | kael |
| responsibility | Review scenario coverage, tool-call trace and end-state grading for an approved Kael workflow under test. |
| positive_triggers | Explicit agent-eval design/trace review; an agent claims completion despite denied or missing tool execution. |
| negative_triggers | Generic changed-code review → QA02; evaluate developer skill discovery/lifecycle → skill-lifecycle; create hosted eval service. |
| inputs | Workflow/synthetic scenario contract, immutable trace and expected end state, hard-fail rules and withheld cases. |
| outputs | Preregistered case/rubric proposals, trace-to-assertion map, false-success/violation findings and measurement gaps. |
| tools_needed | Existing agent-evaluation fixture/snapshot helpers and existing tests; offline supplied traces only in a later pilot. |
| permissions_boundary | No new evaluator engine, hosted/API eval job, self-awarded PASS or conflation of coding-agent safety with Kael product quality. |
| dependencies | Current harness can preserve coding-agent fixtures; product tool-state adapters/oracles are absent. QA02 secondary only for grading-code review. |
| verification | Known false-success/unauthorized/timeout traces fail; benign trace passes objective oracle; final-state and tool-event disagreement stays visible. |
| failure_and_recovery | No authentic Kael runtime → BLOCKED_PRODUCT; offline rubric pilot must remain synthetic, not a live-agent effectiveness claim. |
| stop_condition | Deliver scenario/oracle review; leave real runtime quality and adoption pending. |
| source_revision | T2 + O2 evaluation methodology; O1 trace/approval tests as reference-only source. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | An original text-only V1 specification is plausible. Reuse harness preservation; arbitrary product trace grading is not already implemented there. |
| owner_decisions | Approve synthetic trace cases and independent evaluator; later supply actual Kael workflow/oracle. |

Unverified: No Kael runtime evaluation, automated product oracle, independent challenge, A/B or provider inference.

## QA01 — qa-error-prevention

R0: Strong duplication risk: root policy already mandates prevention. Justification is a falsifiable hypothesis about missed recurring classes, not a missing policy.

R1 / disposition: REVISE. High authority/duplication risk; shortlist as a candidate to disprove, not an approval to add a second policy.

| R2 field | Proposed specification |
| --- | --- |
| name | `qa-error-prevention` |
| domain | shared-qa |
| responsibility | Classify demonstrated repeated engineering failures and propose the smallest enforceable prevention at the responsible existing layer. |
| positive_triggers | Explicit recurring-error prevention request with two occurrences, or one serious security/data/money failure under root policy. |
| negative_triggers | Routine one-off bug repair; review one diff's consumers → QA02; manage the skill library → skill-lifecycle. |
| inputs | Actual defect/revert/review evidence, recurrence class, current guards/owners and scope. |
| outputs | Evidence-to-class map, existing-enforcement gap, valid/bad case proposal, false-positive/recovery limits and no-skill alternative. |
| tools_needed | Existing rg/Git, check/verify:negative/verify:foundation and current test runner only. |
| permissions_boundary | Research/review does not authorize architecture, root policy, test deletion, CI or per-class commits demanded by upstream /correct. |
| dependencies | Root policy already specifies recurrence and prevention order; check-test-selection and existing guard suites own enforcement. |
| verification | Known bad case rejected, valid neighbor accepted, guard mutation observed by existing runner; baseline must establish a missed recurrent class. |
| failure_and_recovery | No distinct gap or baseline already succeeds → REJECT new skill, retain canonical docs/guard; do not manufacture extra rules. |
| stop_condition | Return prevention proposal/evidence; implementation only under separately scoped authorization. |
| source_revision | Q1 correct/SKILL.md; Lauren Tan MIT experiment/workflow, not platform-official performance evidence. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Upstream disable-model-invocation is unsupported V1 metadata and explicitly avoids natural selection upstream. A narrow original workflow must be separately tested. |
| owner_decisions | Decide whether existing policy/runbook already suffices; approve any later guard change independently. |

Unverified: No incremental improvement, trigger specificity, guard implementation or independent reviewer result. Baseline test failure is not evidence this skill fixes it.

## QA02 — qa-impact-review

R0: Tools find symbols, but cross-language/schema/snapshot consumers can require judgment. Test whether existing policy+tools already covers that task equally well.

R1 / disposition: REVISE. Moderate local experiment risk, high duplication/false-positive risk; first shortlist candidate with real tooling consumers.

| R2 field | Proposed specification |
| --- | --- |
| name | `qa-impact-review` |
| domain | shared-qa |
| responsibility | Review a specified immutable code diff's downstream consumers/contracts and experimentally challenge its key safety assumptions. |
| positive_triggers | Explicit blast-radius or independent diff review; a small shared parser change may break index-only consumers. |
| negative_triggers | Implement a feature; trace repeated-error prevention classes → QA01; grade Kael task traces → K05; automatically review every coding task. |
| inputs | Exact base/head/diff plus working state, actual callers/contracts, existing relevant tests and scoped review request. |
| outputs | Actionable file/line findings, traced consumers, executed or unproven safety assumptions, decoy/false-positive accounting and limitations. |
| tools_needed | rg/Git and existing targeted local test runners; scratch repro only if explicitly in scope. |
| permissions_boundary | No automatic fix, PR comment, multi-model arena, hosted CI, commit/merge or private-data publication from source skill instructions. |
| dependencies | Root implementation contract already asks consumer review; existing checks test known guards but do not independently challenge every diff assumption. |
| verification | Known genuine and benign decoy diffs; actual caller path/contract and focused repro, no invented consumers; no finding-count scoring. |
| failure_and_recovery | Unproven assumption stays unproven; baseline equivalent → reject installation; missing independent reviewer remains NOT RUN. |
| stop_condition | Return bounded review findings and evidence; stop before implementing or publishing them. |
| source_revision | Q1 blast-radius/SKILL.md + O2/T2 methodology, without transferring vendor performance claims. Exact pins/file scope are in the source dossier; proposed local skill revision is null. |
| compatibility | Remove need for upstream companion how/why/arena/unslop workflows in any later original proposal; unsupported disable-model-invocation prevents verbatim port. |
| owner_decisions | Approve diff cases, permitted repro scope and independent reviewer access for future pilot. |

Unverified: No independent reviewer, candidate activation, A/B benefit, live application review or automatic-selection evidence.
