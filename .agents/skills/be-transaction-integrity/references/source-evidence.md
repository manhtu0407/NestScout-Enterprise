# Source evidence: be-transaction-integrity

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.1; adoption mode
**PROJECT_NATIVE**. This records source/static review, not runtime efficacy.

## Decision and file scope

The official Supabase short-transactions example omits external-effect reconciliation. Original invariant/interleaving workflow is necessary; its payment code is rejected, not imported.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Primary-only authorship

No installable upstream package or upstream skill name/revision is claimed.
These independently worded instructions reference public technical documentation;
no proprietary text, example implementation, asset or SDK is redistributed.
Documentation access date is not an immutable upstream revision or SDK pin.

## Technical authority and version boundary

- [pgisolation](https://www.postgresql.org/docs/17/transaction-iso.html) — Read Committed snapshots, serialization retries and non-rollback sequence behavior.
- [pgconstraints](https://www.postgresql.org/docs/17/ddl-constraints.html) — CHECK, UNIQUE, foreign keys and referencing indexes; no automatic FK-side index.

The Unique Constraints section distinguishes whole-table UNIQUE constraints from
conditional uniqueness enforced by a partial unique index. Validation should
reject a proposal for a partial UNIQUE table constraint and inspect the actual
index predicate and null semantics before claiming the invariant is protected.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named official documentation owners above; project-native authorship is explicit. |
| Correctness and depth | An absence check cannot be protected by locking a nonexistent row. Database atomicity and external effect idempotency are separate, with whole-transaction serialization retry. |
| Practical validation | Two synchronized connections compete, then identical replay and changed payload are tested; missing acknowledgment remains an uncertain effect until reconciliation. |
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
