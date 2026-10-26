---
name: be-schema-migrations
description: "Plan, implement or review Supabase/PostgreSQL schema migrations, applied history, indexes, compatibility and roll-forward recovery. Use for actual schema evolution; exclude authorization policy design, transaction algorithms and hosted database execution without approval."
license: MIT
metadata:
  library: nestscout-engineering-skills
  domain: backend
  specialty: postgres-migration-safety
  consumer: codex,claude-code
  version: "1.0.0"
---
# Schema and migration safety

Preserve applied history and old/new consumer compatibility.
Read root `AGENTS.md` and [source/adaptation evidence](references/source-evidence.md).
Use existing local database wrappers; documentation examples do not select a target.

## Inputs and selection

Locate migrations, database major/version, actual history, generated types,
schema consumers, intended invariant, data size assumptions and permitted target.
Inspect `package.json`, `scripts/supabase-local.mjs`, `supabase/config.toml`
and the existing local database guide before selecting commands.
If there is no product schema, do not invent tables to exercise this skill.

- Positive: “Review this column rename while old mobile clients remain active.”
- Negative: “Choose which worker can see a row” or “Design model failover.”
- Neighbor: `be-auth-rls` owns policy semantics; this skill owns the migration's
  application/history/compatibility even when the same file also contains policies.

## Procedure

1. Establish exact revision, local ownership/lock and source/target identity.
   Inspect migration order and applied history using the current guarded commands.
   Treat inaccessible history as a gap. Do not link, reset, repair history or
   switch to a hosted target because a local check fails.
2. Classify additive, backfill, constraint/index and destructive operations.
   Trace SQL, views/functions, generated types, APIs and deployed-client contracts.
   Prefer expand/backfill/validate/contract where live consumers require overlap;
   a TypeScript compile alone does not prove old clients still function.
3. Inspect existing values before proposing NOT NULL/UNIQUE/FK/type changes.
   Define null/duplicate/invalid-row handling and batching. Avoid blanket
   IF NOT EXISTS checks that conceal an incompatible pre-existing definition.
   PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS syntax; an existence check
   must bind the relation and expected definition, not just a constraint name.
4. Review locks, timeouts and transaction boundaries against the actual major.
   CREATE INDEX CONCURRENTLY cannot run inside a transaction block; failure can
   leave an invalid index requiring explicit recovery. NOT VALID/VALIDATE is
   available for particular constraint types, not an interchangeable universal
   technique. Inspect supported syntax and executor behavior.
5. Evaluate indexes by actual predicate/order/join and existing index prefixes.
   PostgreSQL does not create a referencing-side FK index automatically; a useful
   composite index may already cover the need. Do not add redundant indexes from
   a simplistic per-column check or promise unmeasured speedups.
6. For authorized implementation, generate migration files using supported tooling
   and existing naming. Keep applied files immutable; use a subsequent correction.
   Reuse the repository's ownership-aware local lifecycle for replay, tests, types,
   drift and history. Do not bypass its guards with raw remote CLI commands.
7. Define failure recovery before execution: old/new reader behavior, partial
   backfill restart, invalid indexes, validation failure and irreversible data
   loss. A backup's existence does not prove restore. Prefer a safe correction
   migration when rolling back would destroy newly written data.

## Validation and recovery

Choose current manifest commands such as `db:history`, `db:drift`,
`db:types:check` and `db:test` only after their local prerequisites are met.
Reset/replay only an explicitly owned disposable stack within approved scope.
Test pristine replay and upgrade from the prior schema with representative
bad/valid data; verify constraints, consumer compatibility and generated types.
Separate deterministic wrapper tests from actual SQL replay.

If Docker/ownership/history is unavailable, leave execution BLOCKED and provide
the exact dependency; do not silently substitute an unrelated database. Keep a
failed command's exit visible. No remote schema change is authorized by this skill.

## Output and completion

Return the migration/history identity, changed contracts, lock/data/recovery
analysis, scoped diff when authorized, actual commands/exits and per-gate verdicts.
Complete when replay/upgrade/consumer checks pass or their gaps are explicit.
Stop before any separately gated hosted write, deployment, PR, CI or merge.
