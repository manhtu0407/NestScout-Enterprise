---
name: qa-impact-review
description: "Review a specified code diff for downstream contract breakage, affected consumers, specification compliance and regression risk. Use for blast-radius or independent change review; exclude automatic bug fixing, arbitrary architecture audits and Kael outcome grading."
license: MIT
metadata:
  library: nestscout-engineering-skills
  domain: shared-qa
  specialty: diff-consumer-blast-radius
  consumer: codex,claude-code
  version: "1.0.0"
---
# Impact and contract review

Challenge the facts that make a change safe, including consumers outside the diff.
Read root `AGENTS.md` and [source/adaptation evidence](references/source-evidence.md).
A review remains read-only unless the user already authorized scoped changes.

## Inputs and selection

Locate exact base/head plus working/index diff, applicable specification,
authoritative root policy, actual consumers, test commands and allowed repro scope.
Resolve refs before reviewing. Distinguish branch merge-base comparison from a
two-commit tree comparison and uncommitted changes; do not silently choose a
different target or use another chat's unpublished branch.

- Positive: “Review this parser change's blast radius, including staged-only input.”
- Negative: “Implement a feature” or “Grade the agent's customer task trace.”
- Neighbor: `qa-error-prevention` investigates a demonstrated defect/recurrence;
  this skill reviews the supplied change. `kael-agent-evaluation` judges
  task/trace/end-state outcomes rather than code conformance.

## Procedure

1. Freeze the comparison: Git root/worktree, base/head SHAs, merge base when used,
   index and working state. Read the complete relevant diff and changed symbol
   definitions. If the spec is unavailable, continue technical impact review and
   mark spec compliance NOT RUN; do not invent requirements or open an Issue.
2. Trace direct and indirect consumers: imports/callers, serialized bytes, SQL,
   generated types, configuration, tests, native/platform paths and staged blobs.
   Search beyond renamed symbols to unchanged contract readers and cross-language
   paths. Record inspected absence separately from inaccessible scope.
3. Identify the few safety assumptions that matter, e.g. “every rejected file is
   excluded in both index and working snapshots” or “old clients tolerate this
   nullable field.” Read the exact pinned dependency behavior and local patches
   when the assumption depends on a library; naming is not proof.
4. Review two distinct dimensions: compliance with the actual task/specification,
   and preservation of code/contracts/root standards. Keep a stylistic heuristic
   separate from a concrete violation. Existing tooling can verify syntax; focus
   judgment on behavior and untested consumers without inventing abstractions.
5. Challenge important assumptions using the cheapest meaningful approved local
   test or isolated reproduction. Include a valid neighbor/decoy as well as a bad
   case. A search hit is not a defect; a zero-result search in the wrong directory
   is not safety evidence. If execution is unavailable, mark the assumption unproven.
6. Check data/privacy/authority, lifecycle, concurrency, cleanup and recovery where
   the change actually touches them. Inspect test assertions and runner selection;
   removed tests, swallowed errors or fake-success fallbacks cannot establish a
   safe result. Do not demand unrelated database/native tests for a tooling edit.
7. Prioritize only actionable defects with trigger, causal path, affected consumer,
   impact and exact changed file/line. Distinguish confirmed findings, cleared
   risks and unresolved assumptions. No findings is a valid review outcome;
   do not satisfy a finding-count target or convert preferences into defects.

## Validation and failure handling

For each key assumption, label source inspection, executed code and real runtime
reproduction separately. Run current focused tests within permitted scope and
retain actual exit codes. Inspect the combined state after any separately
authorized correction; previous results may no longer cover it.

An empty diff or unresolved ref needs clarification of the review target. Missing
spec blocks only spec compliance. A failing environment is BLOCKED, not a clean
review. Do not fix code, stage files, post comments, create PRs or invoke hosted
checks solely because an upstream review procedure recommends it.

## Output and completion

Return target identities, concise change behavior, separate spec/contract findings,
affected consumers, proof for safety assumptions, cleared cases, actual tests/exits
and remaining risks. Complete when each important assumption has evidence or an
explicit gap; stop at the approved review boundary. Root policy controls later
Git, CI, merge, external communication and deployment. Source skill companion
names and multi-model recommendations are not mandatory dependencies.
