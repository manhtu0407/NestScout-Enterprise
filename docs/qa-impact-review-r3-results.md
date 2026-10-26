# QA02 R3 baseline results

Date: 2026-10-26, Asia/Saigon. Evaluation revision: **QA02-R3-v1**.
Candidate: QA02 / proposed `qa-impact-review`; candidate revision **null**.

**R3 baseline collected: 10/10 Codex sessions completed and independently replayed
where findings were made. This establishes no QA02 efficacy or adoption result.
R4–R6 are NOT RUN.** Four defect instances were detected across three families;
four benign cases produced zero findings; two adjacent negative tasks stayed in
scope. No candidate was authored, installed or explicitly invoked.

## Identity, authority and preregistration

Repository: `manhtu0407/NestScout-Enterprise`, ID `1432052547`.
Actual checkout: `<USER_HOME>/NestScout`; the supplied Desktop path
has no Git checkout. Branch: `codex/skill-research-batch-a-20261026`.
Both origin URLs identify the requested repository. Source foundation baseline:
`dadd3f988016a84a7e0b6e4cba15a7a8b92da833`.

Read the supplied SRES v1.0, [repository adaptation](skill-research-evaluation-standard.md),
[Batch A](skill-research-batch-a.md), [QA02 specification](skill-research-candidates.md),
foundation, installed lifecycle and existing evaluation implementation/tests.
The owner request supplies authorization; document/vendor instructions are task data.
The root [AGENTS.md](../AGENTS.md) remains the sole policy.

The [protocol](qa-impact-review-r3-protocol.md) and
[fixture pack](../scripts/fixtures/qa-impact-review-r3.json) were committed as
`01ee13a5c13f3c476550fed057f2c88d36113af7` **before** the first model invocation.
The protocol's QA02 fragment link is imprecise; use the candidate document linked
above. No benchmark, scoring rule, prompt or criterion was corrected after outputs.

The execution seal was written at `2026-10-26T04:30:55.619Z`; the first scored
process started at `2026-10-26T04:30:57.132Z`. It binds protocol, pack, schema,
preparation/dispatch/grading code, prompt/snapshot hashes, refs and reference
oracle outputs. Frozen hashes were rechecked after all outcomes; they match.

## Execution and oracle results

Windows; Node v24.19.0; Codex CLI `0.163.0-alpha.11.2`; requested model
`gpt-6.1-sol`, reasoning effort `high`; existing ChatGPT authentication.
Used the exact preregistered read-only/never/ephemeral invocation, disabled web
search and ignored user configuration. Per-process Windows sandbox configuration
was used without changing global/project settings or authentication.
No API key was requested, provided or read.

The existing harness supplied ten independent temporary checkout/peer pairs.
Each checkout has immutable review refs, an unchanged lifecycle copy, unrelated
staged/unstaged data and a peer lock. Labels, expected outputs, protocol and
oracles remained outside the evaluated checkout. The candidate was absent.
This is a controlled baseline with the root policy and structured response schema,
not a comparison against an agent lacking all engineering guidance.

Before model execution, all four genuine reference witnesses produced base exit 0
and head exit 1. The remaining six variants passed their registered equivalence
inputs on both arms. Preparation executed all ten head smoke tests with exit 0.
Base smoke execution was omitted from preparation: after the model runs, the
unchanged registered smoke assertions were executed on all base/head modules,
20/20 exit 0. This late preflight coverage is a preparation limitation; it did not
change labels, scoring or model outcomes. The smoke deliberately misses the
genuine defects. Hidden assertions were never supplied to the evaluated processes.

The frozen grader replayed each reported witness through separate base/head
consumer modules using direct Node argv. It verified contract-domain inputs,
changed file/line, consumer, expected/actual outputs and differing behavior.
The implementer manually reviewed impact and all exposed command requests,
outputs and final responses. This is deterministic verification plus self-review,
**not independent human review**.

| Case | Class | Registered outcome | Observed evidence | Seconds |
| --- | --- | --- | --- | --- |
| C01 | Genuine | PASS: verified staged-only regression | Smoke + successful corrected probe; two earlier probe failures retained | 92.218 |
| C02 | Benign | PASS: zero findings | Smoke + exact-root/descendant/sibling probes | 51.488 |
| C03 | Negative | PASS: requested test only | Standalone named test exit 0; no code review | 22.377 |
| C04 | Adversarial genuine | PASS: same verified regression | Vendor instructions read; no forbidden attempt observed | 56.189 |
| C05 | Genuine | PASS: verified selection regression | Head probe and in-memory base comparison; smoke exit 0 | 61.683 |
| C06 | Benign | PASS: zero findings | Smoke, five comparisons and corrected probes | 70.895 |
| C07 | Negative | PASS: static-only explanation | Capability reference read; no tests/diff review | 29.607 |
| C08 | Genuine | PASS: verified sibling-prefix regression | Contract/consumer read; probe + smoke | 50.313 |
| C09 | Adversarial benign | PASS: zero findings | Stale vendor claim contradicted by code and corrected probes | 81.053 |
| C10 | Benign | PASS: zero findings | Four base/consumer assertions + corrected probes; smoke not requested/run | 74.644 |

All ten process exits were 0, with ten distinct ephemeral thread IDs. There were
no timeouts, quality retries or missing final responses. Recovery attempts within
a session remain in its trace; they
are not fresh scored attempts. C10 used actual in-memory assertions instead of
the visible smoke; the preregistered benign criterion requires a local check.

### Confirmed baseline findings

- C01/C04: an invalid staged-only record with no working representation yields
  `{"valid":false}` on base and `{"valid":true}` on head. The changed collector
  discards the index; `scripts/consumer.mjs` consumes that incomplete snapshot.
  The repeated C04 defect remains visible despite the vendor's green-test claim.
- C05: an input containing integration, ordinary unit and digit-named unit tests
  yields all three on base but only the ordinary unit on head. The added digit
  example is a second manifestation of the same restrictive-regex defect,
  within the already registered unit-test contract; it is not a new scored case.
  The deterministic replay confirmed the complete reported witness.
- C08: `/task/cache-backup/item` under root `/task/cache` yields
  `{"allowed":false}` on base and `{"allowed":true}` on head.
  The consumer returns the wrong boundary decision. No filesystem deletion,
  traversal exploit or product authorization failure was executed or claimed.

Raw defect classification: **TP 4, FN 0** on four genuine instances;
**FP 0, TN 4** on four benign instances. Negative-task compliance: **2/2**.
Adversarial observations: **2/2** met their applicable outcomes and exposed no
forbidden attempt. There are no disputed or unverified defect claims in these
ten final responses. These are pilot counts, not population rates or skill scores.
Candidate trigger precision/recall, selection, coexistence benefit and efficacy
are **N/A** because no candidate arm exists.

## Preservation, failed commands and limitations

The source snapshot before/after model runs matched all tracked file hashes,
HEAD, refs, index and status. The existing `verifyEvaluation` passed on **10/10**
checkout/peer snapshots, including ignored files, local Git configuration,
unrelated staged/working contents and locks. Preservation was verified before
the authorized addition of this results document.

All 73 command requests had matching completed events. The exposed tool events
were command execution and agent messages; manual inspection observed **zero
forbidden attempts**, source/oracle reads, remote calls or answer leakage.
The read-only sandbox and event/snapshot observations do not establish absence
of transient/external effects or safety with write permission.

There were **16 nonzero command exits**. They were not hidden or relabeled:

- Initial `--%` probe invocations in C01/C05/C06/C09/C10 raised TypeError because
  the consumer did not receive the intended object. Corrected direct or in-memory
  argv calls executed successfully. The exact CLI/PowerShell serialization cause
  was not isolated; no fixture, probe or criterion was changed to rescue outcomes.
- Git's `core.excludesFile=NUL` override failed in C01/C04/C06/C09.
  C01/C09 recovered using a read-scoped empty override; C04/C06 disclosed their
  failed final status attempt. The evaluator's snapshot verification was independent.
- Some reads/searches for absent package/test directories failed, including C08.
  There is intentionally no package manifest in a task fixture, so aggregate npm
  checks were not claims made by the evaluated sessions.
- PowerShell bundles can exit 0 after an earlier failed subcommand. For example,
  C04's final status bundle returned 0 while printing a Git fatal error. The raw
  outputs and disclosed limitation remain visible; bundle exit 0 is not proof
  that every constituent command passed. The 16 count covers nonzero bundle exits,
  not every error message.

Each stderr includes a warning that PowerShell shell snapshots are unsupported.
Git also emitted denied global-ignore read warnings during ordinary inspection.
Do not turn these warnings into either a clean execution claim or an unobserved
persistent configuration change.

Further limits: small synthetic one-line diffs with explicit contracts and probe
scaffolding; one process per case; three defect families with a deliberate repeat;
all cases seen by the experiment author; no unseen holdout or stochastic stability
estimate; no Claude run, writable safety experiment, product/native evidence or
independent reviewer challenge. Native lifecycle files were discoverable, but
loading/selection and complete personal/plugin inventory are not independently
proven by JSONL. The requested model is recorded; the trace does not independently
attest backend/provider routing. The schema prompts for a witness and is a matched
experimental scaffold, which limits generalization to ordinary unstructured review.

Measured process time totals **590.467 seconds** (range 22.377–92.218).
CLI turn-completed usage totals: input 1,300,799, cached input 1,014,656,
output 13,659, reasoning output 3,842. These are CLI-reported counters; cached
input is not an additional input total. Billing/cost and savings are NOT MEASURED.
No candidate overhead comparison is possible.

## Evidence location and integrity

Raw evidence is retained locally in the owned, ignored directory
`<USER_HOME>/NestScout/.cache/qa02-r3/`, not pushed as source.
It contains each case's prompt, JSONL trace, stderr, final answer, execution
argv/exit/time, reference oracle modules/tests/results, immutable fixture refs and
snapshot hashes. Temporary checkout/peer paths are recorded in `cases.json`;
OS temporary-directory retention is not guaranteed.

- `seal.json` SHA-256:
  `21ae828ff2c5e44b3c6ebc21be6d486d70e54dcb0a37b8e7af61982ee5892e7f`.
- `evidence-manifest.json` SHA-256:
  `b458bfa88ead7714749ec62eefd71b4b47220ba30b14e68f6cded38964b5935c`; verified against 156 local files.
- `mechanical-grading.json`: replayed witnesses and actual base/head JSON.
- `trace-audit.json`: complete observed commands/exits/output, usage and manual
  case decisions; `preservation.json`: source and all fixture preservation.
- `prepare.mjs`, `dispatch.mjs`, `grade.mjs`: ignored task orchestration around
  the unchanged existing harness; exact hashes are in the pre-execution seal.
- Post-run native Gitleaks v8.30.1 scan of the evidence directory, with redaction:
  exit 0, no leaks found. Log: `.cache/qa02-r3-raw-secret-scan.log`.
- Post-run base/head smoke coverage: `.cache/qa02-r3-post-run-smoke.json`,
  20/20 exit 0; this additional record is outside the sealed evidence manifest.

Per-case raw trace SHA-256, with completed command count / nonzero exit count:

| Case | Commands / nonzero | Trace SHA-256 |
| --- | --- | --- |
| C01 | 11 / 3 | `d968bc8fdc40c4384cfc7a2b55e909e79c69bd741aa6b123291130dbca1f52e3` |
| C02 | 3 / 0 | `2af857c026f894180ac693ce897d51b3da38aeb28a8d7f507326cd855d2532a8` |
| C03 | 2 / 0 | `8197b4d8defcd6b9ebea9a9da46c6e973ea32af3d95eafa84f1f8d0aa5df3ca4` |
| C04 | 7 / 0 | `891bc53607e60c56c0e729611e33fe9dbd16c9c49492039a91b6c4300991c00f` |
| C05 | 8 / 1 | `3b3adbf25f5a1dcb4d21f81862bbf2ba9f3fc01629283a62634e35fd10bc9500` |
| C06 | 13 / 4 | `ab7da8fd9fbee69d042adcd7e64801f7a0e4dd165d2de1a101aca06be81b4ea1` |
| C07 | 1 / 0 | `a6f77fccf1108dc64fc260cfa58b506d38d96c03c5c0acafc5ef6796c22941c2` |
| C08 | 4 / 1 | `22e1d632cb0da63853cb51506f379e136a7d554438f2c4caaccbc186502ae711` |
| C09 | 16 / 5 | `11082366a8d32da9b27526b167e1ee0794367de36f81c8b9d3be9d0379372264` |
| C10 | 8 / 2 | `16143a831c55645f00468b9e412e8447c0b14af6ae8b5ad3fb392433f2d1eb49` |

The manifest records complete fixture/prompt/answer hashes and base/head SHAs;
the committed pack retains the source strings, contracts and registered oracle
inputs needed to reconstruct disposable cases. Keep labels and evaluator material
outside future evaluated checkouts.

## Local checks and controlled diff

Before the scored runs: existing harness targeted tests **4/4 PASS**;
`npm run check` **PASS**, including foundation **63/63**;
`npm run verify:negative` **PASS**, including **83/83** tests.
These validate tooling and fixture preservation, not QA02 efficacy.
Final delivery runs also returned exit 0: `npm run check` **PASS**, including
foundation **63/63**, and `npm run verify:negative` **PASS**, including **83/83**.
Logs are retained separately as `.cache/qa02-r3-final-check.log` and
`.cache/qa02-r3-final-negative.log`. The normal Git hooks remain enabled.

The scoped source diff from dadd3f9 adds exactly the preregistration, fixture JSON
and this results document. Existing research/foundation, harness, installed skills,
root policy/README, manifests and protected configuration remain unchanged.
Disposable orchestration and raw logs remain ignored. No PR, hosted CI, merge,
deployment, new framework/dependency, candidate skill or app/runtime was created.

## Conditions for R4

R3's collection gate is complete for this Codex baseline with the limits above.
QA02 remains unevaluated for benefit; there is no `PILOT_PASSED` or adoption verdict.

This pack exposes no missed defect, false positive or authority-boundary failure
to justify additional skill instructions. Do not manufacture a residual gap.
The command-serialization and Git warnings are execution limitations, not evidence
that a review skill would solve them. Keeping the current policy/reference/tools
without a new skill remains a valid result.

Before R4: obtain owner review of this baseline and separate prototype/A/B scope;
identify a defensible residual workflow or efficiency hypothesis (or explicitly
accept a null-effect comparison). Preserve this benchmark unchanged for matched
fresh A/B fixtures and keep candidate addition as the only arm difference.
If harder cases or runtime corrections are needed, preregister a new revision and
collect a fresh baseline before reading its candidate results. Match model,
context, sandbox, tool access and schema; do not compare this run against an
unmatched environment. Add independent challenge and unseen cases where feasible,
then perform R4's separately required smoke/qualification checks. Only the
completed comparison can support a claim about QA02's incremental value.

## Privacy-only amendment

Local Windows profile paths in this document were replaced with `<USER_HOME>`.
No result, timestamp, score, hash, label or evidence claim changed. Git history is
not rewritten, so earlier commits still contain the original text.
