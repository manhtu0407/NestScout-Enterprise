# Skill research and evaluation standard

SRES v1.0, repository adaptation; research procedure under the sole root
[engineering policy](../AGENTS.md). This extends the existing
[skills foundation](skills-foundation.md) and
[agent evaluation procedure](agent-evaluation.md). It supplies no permissions,
second policy, runtime configuration, skill registry or evaluation engine.

The owner requested Batch A on 2026-10-26. Its
[dated research](skill-research-batch-a.md),
[source dossiers](skill-research-sources.md),
[candidate specifications](skill-research-candidates.md) and
[conflict analysis](skill-research-conflicts.md) are research records, not installed
packages. Developer skills for building Kael are distinct from Kael product tools.

## Use and decision

Apply this procedure to an explicitly scoped candidate investigation through
`skill-lifecycle`. First ask whether an existing command, deterministic guard,
technical reference or root policy already solves the repeated task. A skill
needs a demonstrated residual judgment/workflow gap and an actual consumer.
Do not equate a useful engineering technique with a necessary skill.

The foundation owns package layout, validation, installation/update/retirement,
runtime loading and rollback. The existing evaluation procedure owns temporary
fixtures, preservation snapshots and raw trace handling. Reference those owners;
do not duplicate them or infer authority from an upstream example.

## Gates and artifacts

| Gate | Investigation and evidence | Exit condition |
| --- | --- | --- |
| R0 intake | Current root/worktree/branch/HEAD/index/status/origins, intended consumer, installed skills/tools, repeated gap, positive task and adjacent non-trigger | Distinct value hypothesis, or REVISE/REJECT; no package required |
| R1 source | Canonical URL/maintainer/type; immutable commit or immutable release; retrieval date; exact files/resources; license/notices; code, commands, network, credentials, telemetry, dependencies, permissions and known limitations | Traceable research dossier; unresolved copying license/unsafe behavior is BLOCKED_SOURCE |
| R2 specification | Fields below, same/adjacent-domain conflict pairs, primary owner and explicit secondary reason per scenario | Bounded draft specification; runtime compatibility remains unobserved |
| R3 baseline | Preregister prompts, objective assertions/rubric, allowed paths and forbidden actions before results; separate untouched fixtures per agent and arm | Actual no-candidate traces and outcomes; no benefit assumed |
| R4 prototype and A/B | Only instructions justified by baseline failures; three independent smoke scenarios, then 10–20 qualification prompts where practical | Matched within-agent comparison; actual outcome, regression and overhead evidence |
| R5 integration/challenge | Existing local checks, all installed skills discoverable, negative routing, trace/patch review independent of implementer | Per-runtime discovery/activation/selection/outcome/coexistence evidence; unresolved failures stay visible |
| R6 product/adoption | Actual consumer/product evidence, source/license, minimal authorized diff and scoped rollback | Separate owner adoption decision; fixture success is not product verification |

A dossier can be complete as a research record while its source, runtime or
product gate is blocked. Record that distinction explicitly. A dated web page or
its content hash is a retrieval observation, not an immutable upstream revision.
If a source offers no reusable skill, record an independently authored
specification; do not present product documentation as an installable package.

For R2 record each of: `name`, `domain`, `responsibility`,
`positive_triggers`, `negative_triggers`, `inputs`, `outputs`,
`tools_needed`, `permissions_boundary`, `dependencies`, `verification`,
`failure_and_recovery`, `stop_condition`, `source_revision`,
`compatibility`, `owner_decisions`. Include R0's alternative to a skill,
source risks and unverified claims. These are dossier fields, not new frontmatter
or runtime permission fields.

Prospective packages remain flat siblings using the foundation's existing
name/description/line/resource limits. Domain prefixes distinguish responsibility;
they are not nested loaders. No package is written during Batch A.

## Controlled evaluation

Reuse `scripts/agent-evaluation.mjs` and its snapshot/verify lifecycle.
Its existing modes provide policy/tooling fixtures and one unrelated disposable
dependency-triage experiment; they do not parameterize arbitrary candidates.
A later approved pilot may adapt task-owned fixture contents/prompts, freezing a
new baseline before execution. Do not run `prepare-skill` and call its unrelated
candidate an evaluation of these 15. Extend the existing runner only if a concrete
missing capability is established in separately authorized implementation work.

For every candidate and runtime:

1. Freeze task prompts, assertions, prohibited actions, file allow-list, fixture
   state/hashes, model/runtime/tool access and grading before reading results.
   Keep some final-check cases unseen where feasible; otherwise record NOT RUN.
2. Run A without the candidate and B in a separate clean fixture with only the
   candidate added. Preserve the same runtime/model/policy/tool environment within
   that comparison. Neither agent may mutate the other's fixture or evidence.
3. Separate exact-path inventory, explicit invocation, implicit selection,
   adjacent negative selection, process compliance and task correctness.
   Explicit invocation does not establish automatic selection.
4. Inspect redacted tool events, real exits, final files/diff, refs/index/peer
   state and deterministic assertions. Verify preservation independently.
   Snapshot equality cannot establish absence of transient/external effects.
5. Include failure, adversarial, ambiguous and cross-skill cases. An attempted
   unauthorized action fails the scope gate even when a sandbox rejects it.
   Do not use a refusal alone as proof of writable-session safety.
6. Report raw success x/n, failures, unknowns, TP/FN/FP/TN when observable,
   regressions, reviewer disagreement and flaky cases. Precision/recall require
   nonzero denominators. Record commands, retries, duration and tokens only when
   measured; small samples support directional pilot findings.
7. Compare coexistence with `skill-lifecycle` and visible personal/plugin skills.
   Do not change global settings, authentication or permissions to improve scores.

No paid model request, hosted CI, production target, new framework or dependency
is needed to plan these evaluations. An authenticated subscription session is
still a prerequisite to actual model behavior evidence.

## Domain oracles

| Domain | Evidence needed beyond prose/static validity |
| --- | --- |
| Frontend | Approved interface reference and actual SDK; loading/error/empty/content, navigation and interactions; native accessibility and device performance; brand and expert review where claimed |
| Backend | Disposable database replay, history and types; role allow and deny tests; request/error contracts; concurrent changes, duplicate events, retries and reconciliation |
| Kael engineering | Isolated task/tool trace and end state, ambiguity, denied tools/required approvals, timeout/recovery, memory isolation and provider failure; unauthorized execution is a hard failure |
| Shared QA | Real defect and decoy cases, root-cause/consumer evidence, enforceable prevention and false-positive review; issue count and prose style are not outcome measures |

No app/business schema/Kael runtime means BLOCKED_PRODUCT for the corresponding
end-to-end claim. Browser/static output does not establish native behavior.
Missing CLI/auth/observable inventory means BLOCKED_RUNTIME for that runtime gate.

## Decisions and evidence record

Use candidate verdicts `RESEARCH_ONLY`, `RESEARCH_APPROVED`, `PILOT_READY`,
`PILOT_PASSED`, `REVISE`, `REJECT`, `BLOCKED_RUNTIME`, `BLOCKED_PRODUCT`,
`BLOCKED_SOURCE`, `ADOPTION_PROPOSED`, `ADOPTED_VERIFIED`.
Track gate dispositions separately from the overall verdict.
RESEARCH_APPROVED is not installation authority. PILOT_PASSED is not adoption.
Neither file presence nor `check:skills` establishes ADOPTED_VERIFIED.

Scope/authority, provenance/license, secrets/external effects, preservation,
truthful verification and critical role/data/privacy/money/approval boundaries
are non-compensatory gates. An observed violation needs REVISE/REJECT; missing
evidence needs an explicit blocked/not-run dimension. Scores cannot offset it.

The optional diagnostic rubric is source/correctness 15, distinct responsibility
15, trigger precision 20, outcome 30, coexistence 10, efficiency 10. Mark unobserved
categories N/A and never rescale them to 100. Batch A awards no efficacy score.

Use one evidence record per candidate × agent × evaluation revision. Keep:
candidate ID/name/domain; source URL/revision/license and reviewed files;
repo HEAD plus changed-file hashes; skill revision or null; runtime/model/auth
and permission mode; fixture SHA; preregistration revision; baseline/candidate
run IDs; positive/negative/task counts or null; critical violations or
NOT EVALUATED; redacted trace path; commands and actual exits; duration/tokens or
NOT MEASURED; preservation/coexistence/product results; verdict, unresolved gates
and reviewer/owner decision. Do not fill a real record with illustrative zeros.

The implementer cannot silently alter scoring after seeing results. The evaluator
checks independent assertions and traces; the reviewer challenges source, tests,
negative cases and omissions. A different model is not proof of independent data
or grading. The owner decides installation and separately gated operations.
Raw task traces stay in owned ignored/external scratch under the existing
evaluation procedure; durable research conclusions and source citations live here.

A later adoption proposal needs observed benefit against baseline on every runtime
claimed, no material regression, reviewed license/source and a scoped Git rollback.
If existing tools/policy perform equally well, retain the reference or guard and
decline a new skill.

## Provenance and maintenance

Adapted from the owner-supplied
`NestScout_Skill_Research_Evaluation_Standard_v1.md` (SRES v1.0, 2026-10-26),
SHA-256 `c2a4454518d81085b3a00570caaa66bc7f7997cced026d2f66f70238b00efc7a`.
The supplied document is research input; the owner's actual request defines scope.
See the [source dossier](skill-research-sources.md#evaluation-methodology) for
checked official methodology and the dated Batch A record for current facts.
Reinspect facts and source revisions before each later pilot or adoption.
