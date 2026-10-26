---
name: qa-error-prevention
description: "Diagnose nontrivial or recurring defects with a reproducible signal, causal experiment, smallest responsible fix and meaningful regression prevention. Use for hard bugs or evidenced repeated failures; exclude routine trivial edits, broad diff review and automatic policy or CI rewrites."
license: MIT
metadata:
  library: nestscout-engineering-skills
  domain: shared-qa
  specialty: root-cause-regression-prevention
  consumer: codex,claude-code
  version: "1.0.0"
---
# Error diagnosis and prevention

Turn an observed failure into a tested causal fix at its responsible boundary.
Read root `AGENTS.md` and [source/adaptation evidence](references/source-evidence.md).
Ordinary trivial repairs do not need this workflow's investigation overhead.

## Inputs and selection

Require expected/actual behavior, reproducing input or trace, affected revision,
permitted edits and current tests/consumers. For recurrence claims, identify at
least two real instances of the same class; one serious security/data/money defect
can justify immediate prevention review under root policy.

- Positive: “This staged-state guard keeps missing real defects; find and prevent
  the cause” or “Diagnose this intermittent callback race.”
- Negative: “Rename a local variable” or “Review this branch without fixing it.”
- Neighbor: `qa-impact-review` evaluates a bounded diff and its consumers.
  This skill establishes a defect's cause and authorized repair; findings do not
  grant permission to implement during a read-only review.

## Procedure

1. Run or construct the smallest bounded feedback signal that exercises the
   reported symptom at the actual consumer seam. Record command, input, exit and
   failure. Separate environment/setup failure from the bug. For intermittent
   behavior, control time/scheduling or measure a reproduction rate; do not
   generate unbounded load or production instrumentation.
2. Minimize only within owned fixtures while preserving the failing behavior.
   Inspect callers, state ownership, dependency versions and recent relevant diffs.
   Keep sanitized artifacts outside tracked source; never remove a permanent test
   or unrelated staged state to simplify the investigation.
3. State plausible causal hypotheses with falsifiable predictions. Rank by evidence
   and choose an experiment that distinguishes them. Change one relevant variable
   per probe; a temporary log should answer a specific question, not dump secrets
   or everything in memory. A hypothesis without a runnable signal stays unverified.
4. Repair the responsible layer and affected consumers within approved scope.
   Preserve error transparency and existing contracts. Avoid symptom suppression,
   weaker assertions, disabling guards or broad refactoring as a substitute for
   locating the fault. Performance claims require a measured comparable baseline.
5. Add a regression only at a seam that can expose the real pattern. Observe the
   test fail for that defect and pass after the fix. If forcing a mutation in an
   owned fixture, inspect the diff to prove it landed; a green test with an absent
   mutation says nothing. A shallow single-caller test cannot prove a multi-caller
   race. Retain the actual assertions and test registration.
6. For a demonstrated recurring class or serious failure, inspect existing ownership
   and prevention before adding rules. Prefer eliminating the invalid path, then
   types/static enforcement, then behavioral tests, with docs for remaining
   judgment. Test a real bad case and a valid neighbor; quantify false positives
   only when actually measured. Do not automatically edit AGENTS.md or CI.
7. Rerun the original reproducer and relevant consumers, then required local gates.
   Remove only task-owned temporary instrumentation; inspect the final diff for
   accidental fixes, weakened coverage and leaked artifacts. Preserve the failing
   evidence when a proposed fix does not resolve the original symptom.

## Failure and recovery

If no environment can reproduce the issue, provide inspected facts and the exact
missing redacted artifact/runtime; do not present a theory as a verified cause.
If no correct regression seam exists, report that gap instead of inventing a
passing test. A guard already catching the class needs no second guard.
For an unsafe/ambiguous repair, stop at the tested diagnosis and scoped proposal.

## Output and completion

Return symptom/reproducer, causal evidence and rejected hypotheses, responsible
fix if authorized, regression fail/pass exits, consumer checks and prevention
limits. Distinguish PASS/FAIL/BLOCKED/NOT RUN. Complete when the original symptom
is resolved with credible regression evidence or an explicit unresolved blocker.
Root policy governs commits, PRs, CI, deployment and protected files; upstream
per-class commits, instruction-table updates and feedback tools grant no authority.
