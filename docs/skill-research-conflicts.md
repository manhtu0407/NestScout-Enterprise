# Batch A conflict analysis

Design analysis for the [15 draft specifications](skill-research-candidates.md),
revision A1. This is a responsibility map, not an observed routing benchmark.
No coexistence, automatic-selection or cross-runtime behavior was executed.

## Pairwise matrix

All 105 unordered pairs are represented once in the upper triangle.
`D` = material collision requiring the ownership rule below;
`H` = specific adjacent-layer handoff;
`R` = QA01 only after evidence of recurrence/serious failure;
`J` = QA02 only when an explicit immutable diff review is requested;
`0` = no direct responsibility overlap identified in this specification.
`0` does not mean tested absence of trigger collisions. Lower triangle repeats
are omitted. Shared use of rg/Git/tests alone does not justify co-activation.

| Candidate | FE01 | FE02 | FE03 | FE04 | BE01 | BE02 | BE03 | BE04 | K01 | K02 | K03 | K04 | K05 | QA01 | QA02 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FE01 | — | D | H | H | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | R | J |
| FE02 | · | — | D | H | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | R | J |
| FE03 | · | · | — | H | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | R | J |
| FE04 | · | · | · | — | 0 | 0 | 0 | 0 | 0 | H | 0 | 0 | 0 | R | J |
| BE01 | · | · | · | · | — | H | H | H | 0 | 0 | H | 0 | 0 | R | J |
| BE02 | · | · | · | · | · | — | H | H | 0 | D | H | 0 | 0 | R | J |
| BE03 | · | · | · | · | · | · | — | H | H | H | H | H | H | R | J |
| BE04 | · | · | · | · | · | · | · | — | D | H | 0 | H | H | R | J |
| K01 | · | · | · | · | · | · | · | · | — | H | H | H | H | R | J |
| K02 | · | · | · | · | · | · | · | · | · | — | H | H | H | R | J |
| K03 | · | · | · | · | · | · | · | · | · | · | — | H | H | R | J |
| K04 | · | · | · | · | · | · | · | · | · | · | · | — | H | R | J |
| K05 | · | · | · | · | · | · | · | · | · | · | · | · | — | R | H |
| QA01 | · | · | · | · | · | · | · | · | · | · | · | · | · | — | D |
| QA02 | · | · | · | · | · | · | · | · | · | · | · | · | · | · | — |

## High-risk ownership decisions

| Pair | Collision | Primary owner and secondary boundary |
| --- | --- | --- |
| FE01 ↔ FE02 | Both upstream sources discuss semantic colors, visual hierarchy and reuse | FE01 determines platform convention for a specific task; FE02 checks reuse against already approved tokens. Neither replaces brand identity. Split platform issue from token escape. |
| FE01 ↔ FE03 | Native navigation also has transitions/gestures | FE01 owns route/back/dismiss semantics; FE03 owns a scoped transition/gesture defect. Neither installs expo-router or a motion library from upstream cross-references. |
| FE02 ↔ FE03 | FE02 source defines motion tokens and default timings | FE02 stores approved values; FE03 selects/validates actual behavior, interruptibility and device performance. Conflicting example timings are not both adopted. |
| FE01/02/03 ↔ FE04 | Accessible controls and reduced motion cross UI layers | FE04 owns assistive-task acceptance; FE03 fixes motion if requested; FE02 fixes shared component semantics if requested. Static HIG/token review cannot certify accessibility. |
| BE02 ↔ K02 | Both say roles/authorization/least privilege | BE02 owns persistent grants/RLS; K02 owns per-tool executor authorization and human approval. Passing one never authorizes bypassing the other. |
| BE04 ↔ K01 | Retry, duplicate events and state transitions appear in both | BE04 owns atomic backend invariants/effect reconciliation; K01 owns routing/timeout/terminal workflow state. A workflow retry cannot establish effect idempotency. |
| BE03 ↔ K02/K04 | Endpoint auth/errors versus agent permission/provider failure | BE03 owns HTTP/input/output contracts; K02 controls whether an effect may execute; K04 controls allowed fallback under a budget. Retrying a partial effect requires BE04 evidence. |
| BE01 ↔ K03 | Memory storage needs schema changes | K03 specifies isolation/retention/retrieval need; BE01 reviews an authorized migration and consumers. No memory store is created merely to satisfy a spec. |
| QA01 ↔ QA02 | Both investigate causes and run verification | QA02 reviews one specified diff; QA01 classifies demonstrated recurrence and proposes prevention in the existing owner. A finding is not automatic scope to implement a guard. |
| K05 ↔ QA02 | Trace correctness versus implementation correctness | K05 checks scenario/trace/end-state oracle; QA02 reviews a changed evaluator/handler diff. A code review is not an agent outcome measurement. |

BE01 ↔ BE02/03/04 and BE02 ↔ BE03/04 are migration, authorization,
API and transaction handoffs respectively. One shared SQL file may contain all
four concerns: choose the primary by the question, then add only a necessary
secondary lens. Do not activate all backend candidates by filename.

For Kael pairs, K01 owns workflow state, K02 authority, K03 stored/retrieved context,
K04 allowed model fallback and K05 evaluation evidence. A tool timeout starts
with K01; K04 is secondary only if provider fallback is actually implicated.
A memory leak starts with K03; K02 is secondary for unauthorized executor access.
K05 judges the supplied contract rather than inventing these missing contracts.

## Task routing examples to preregister later

These are expected owners for future positive/negative controls, not results.
Every example inherits the current task's allowed operations.

| Example task | Primary | Secondary only when necessary | Expected non-trigger |
| --- | --- | --- | --- |
| Audit iOS back/dismiss and safe areas in an existing screen | FE01 | FE04 if focus is lost on dismiss | FE02 does not restyle branding |
| Consolidate repeated colors against an existing approved theme | FE02 | FE01 only if a platform semantic value is disputed | No FE03 without motion question |
| Drag animation jumps after reversal | FE03 | FE04 for reduced-motion acceptance | No K01 workflow routing |
| VoiceOver loses a loading button's label | FE04 | FE02 for shared primitive implementation | No BE02 login authorization audit |
| Review rename migration against old typed consumer | BE01 | BE02 only if access policies change | No schema invention |
| Other user reads a private row through a view | BE02 | BE01 for required schema migration | K02 cannot fix it by hiding a tool |
| Malformed JSON yields leaked Edge stack trace | BE03 | QA02 if reviewing the handler diff | No new API framework |
| Two simultaneous reservations violate one-slot invariant | BE04 | BE01 for a required constraint | K01 retries do not solve atomicity |
| Approved workflow loops after timeout/handoff | K01 | K04 only if model fallback participates | No BE04 without backend state invariant |
| Reused approval authorizes changed tool arguments | K02 | BE04 if an effect already executed | No blanket RLS rewrite |
| Another case's stale memory enters context | K03 | K02 if executor identity is wrong | No vector-store installation |
| Mid-stream provider failure triggers duplicate tool action | K04 | K02/BE04 for approval/effect replay | No provider procurement |
| A trace says completed although all tools were denied | K05 | QA02 if grader implementation is also reviewed | Generic PR review is not Kael eval |
| Repeated staged-state bug needs prevention proposal | QA01 | QA02 to review proposed guard diff later | No automatic policy/CI edits |
| One-line parser diff may omit an index-only consumer | QA02 | Domain owner only for its actual contract | QA01 needs recurrence evidence |
| Run the fully specified existing skill-format check | Existing tool | None | None of the 15 needed |
| Audit/install/update the skill library | skill-lifecycle | Candidate is task data under review | QA01/02 do not take over lifecycle |
| Fix an ordinary arithmetic bug without review/recurrence scope | Existing coding workflow | None | QA01/02 and skill-lifecycle stay inactive |
| Research a hypothetical module with no approved app | Existing docs/research workflow | None | Product skill must not scaffold it |

## Existing and visible capability collisions

Project inventory at the baseline contains only `skill-lifecycle`, with its
adoption review reference. No duplicate project candidate names were observed.
No `.claude/skills` packages exist. The tool library remains the canonical
capability catalog; this research list is not a new installed-skill registry.

The session-supplied catalog also exposes personal/plugin skills whose topics
overlap: pstack blast-radius/principle prevention workflows and code review,
React best practices, iOS UI/performance skills, and Supabase guidance.
Research used the repository lifecycle and official-source guidance; those
visible entries do not establish how a fresh CLI resolves same-topic candidates.
Managed/organization inventory and full default-session precedence were not
observed. Do not uninstall, rename or change global settings to improve a test.

Future coexistence runs need a recorded native inventory and exact loaded path,
positive/negative tasks with `skill-lifecycle` visible, then the same tasks with
the proposed candidate. A metadata-only menu and a self-reported skill name are
insufficient loading evidence. Shared format does not prove shared discovery.

## Dependency implications

The graph denotes knowledge/contract dependencies, not package installation.
No candidate depends on another candidate being installed. Tools stay under their
existing canonical owner; skills may hand off a question without adding packages.
Product inputs (BPMN, roles, design and runtime/API contracts) stay pending owner
decisions. K04 retains the chosen Anthropic/DeepSeek/Perplexity provider direction;
concrete model/SDK bindings, runtime/API contracts and budgets are not yet approved.
Upstream sibling names, `arena`, feedback CLI and plugin MCP configuration are
not transitive installation permission. All runtime routing metrics remain null.
