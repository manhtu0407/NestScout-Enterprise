# Source evidence: be-schema-migrations

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.0; adoption mode
**ADAPTED**. This records source/static review, not runtime efficacy.

## Decision and file scope

Retain constraint-syntax and FK-index review. Replace universal FK indexing and name-only existence guards with relation/definition and composite-index analysis. Add applied-history, old-client compatibility and recovery using canonical local wrappers. Reject the short-transactions payment-first example as an integrity guarantee.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Immutable upstream evidence

- [supabase/agent-skills: skills/supabase-postgres-best-practices/SKILL.md](https://github.com/supabase/agent-skills/blob/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices/SKILL.md)
  — original name `supabase-postgres-best-practices`; revision `c9be0e931b7930f7d02126d04774d904c381e7d7`;
  Supabase; MIT. Last selected-path update observed: 2026-07-30.

Reviewed scope: SKILL.md and selected rule files references/schema-constraints.md, references/schema-foreign-key-indexes.md, references/lock-short-transactions.md; root LICENSE. The remaining rules/bundle are not adopted or cleared.

Repository identity, immutable file payloads, license notices and path history
were retrieved read-only. Source popularity was not used as quality evidence.
A GitHub commit pin identifies content; no independent signature audit is claimed.
External links/transitive packages are not cleared for installation by this review.

## Technical authority and version boundary

- [migrations](https://supabase.com/docs/guides/deployment/database-migrations) — History, local reset/replay and generated diffs; wrapper/target guards take precedence over example commands.
- [pgconstraints](https://www.postgresql.org/docs/17/ddl-constraints.html) — CHECK, UNIQUE, foreign keys and referencing indexes; no automatic FK-side index.
- [pgalter](https://www.postgresql.org/docs/17/sql-altertable.html) — Constraint syntax and validation/locking depend on operation.
- [pgindex](https://www.postgresql.org/docs/17/sql-createindex.html) — Concurrent index transaction restrictions and failed/invalid index recovery.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named maintainers, immutable paths and inspected MIT notices above; downstream port is not misrepresented as original. |
| Correctness and depth | Pinning a general Postgres skill does not make it a migration framework. No raw remote reset, history repair or SDK upgrade is introduced. |
| Practical validation | Existing same-name wrong-definition constraint and old typed consumer must be detected; a covering composite FK index is a benign control. |
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

## Legal notices

```text
MIT License

Copyright (c) 2026 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
