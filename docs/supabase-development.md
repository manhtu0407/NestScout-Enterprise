# Supabase development

Technical setup under the root [engineering policy](../AGENTS.md).
This repository currently has tooling only: no Expo application, Supabase client,
bookings, payments, product roles, or Kael runtime. Do not import another project's
schema or credentials to fill those gaps.

## Targets and installation

Production metadata verified on 2026-10-24: project `axpdymbusiwxfzurfclg`,
region `ap-northeast-2`, Free, Postgres 17.11, Nano, healthy. Dashboard integration
names `manhtu0407/NestScout-Enterprise`. No hosted writes are part of this setup.

```sh
npm ci --ignore-scripts
npm run tools:install
npm run verify:supabase
npm run db:start
npm run db:status
```

Supabase CLI `2.122.0`, TOML parser `1.9.1`, and TypeScript `7.0.2` are pinned in
the npm manifest/lockfile. CLI optional native packages install without lifecycle
scripts. No application dependencies or production environment were introduced.

`supabase/config.toml` owns the local project ID and ports (`59320` shadow,
`59321` API, `59322` DB, `59323` Studio). The wrapper creates a dedicated Docker
network with the documented loopback binding option. An inert, non-listening
container probes the actual binding before start, reset, or shadow diff. Public
binding causes a nonzero exit before starting a credentialed service. It does not
alter Docker daemon settings or another stack.

**Current Windows runtime: BLOCKED.** Docker 29.9.2 ignored
`com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, publishing on `0.0.0.0`
and `::`. Both Supabase and an inert Docker probe reproduced this. Task-created
full-stack containers were stopped. Do not bypass the probe. Use a Docker runtime
that honors the option and rerun these checks; changing shared daemon/network
settings needs separate review. Experimental Supabase stack isolation is disabled.

During setup, the task's already-initialized DB volume was mounted in a temporary
DB-only container with explicit `127.0.0.1:59322:5432` and network alias `db` for
type generation and SQL tests. This is not a repeatable full-stack startup claim.
Its ownership marker is ignored under `.cache/`; it grants no hosted access.

## Schema, types, and tests

`supabase/migrations/` is the sole application schema source. It intentionally has
no SQL migrations: hosted migration history and public relations are empty.
Metadata also found the hosted `public.rls_auto_enable()` event-trigger function
and `ensure_rls` trigger; these are absent locally. Their source/ownership has not
been reconciled into migrations. No empty baseline timestamp, remote migration
repair, schema export containing data, or claim of complete hosted parity was made.

`supabase/seed.sql` is deliberately empty of data. Add synthetic fixtures only
alongside their actual application migrations. No customer snapshots are allowed.
Create future migration files with the pinned CLI's `migration new` command.

On a verified, isolated full stack, run sequentially:

```sh
npm run db:reset
npm run db:test
npm run db:lint
npm run db:drift
npm run db:types
npm run db:types:check
npm run typecheck:db
npm run check
npm run verify:negative
```

These commands reject extra flags and linked checkouts, verify DB identity,
ownership and loopback binding, remove ambient Supabase/Postgres target overrides,
and use explicit local targets. A checkout lock prevents overlapping operations.
After an interrupted command, investigate its process before removing a stale
`.cache/supabase-local.lock`. Do not run raw target-changing commands through this
workflow. Root environment files can override CLI configuration; review them before
use and do not place target overrides or hosted credentials in the local setup.

`supabase/database.types.ts` is the single generated type artifact, from local
`public` schema, with LF/trailing-space normalization. No application client exists
to consume it yet. `typecheck:db` checks this artifact only, not an application.
SQL tests inspect actual public table RLS, view security, privileged RPC access,
and function search paths. Empty-schema passes do not prove Customer A/B, Worker,
Admin, payment, or Kael isolation; those cases are NOT IMPLEMENTED.

## Agent connections

`.codex/config.toml` and `.mcp.json` configure the same hosted project-scoped,
read-only endpoint with `database,debugging,docs`. Codex also allowlists six
diagnostic tools and requests interactive approval. Neither config contains tokens,
privileged headers, deployment tools, account/branching groups, or skipped
elicitations. Read-only SELECT still needs metadata-only discipline.

The active Codex session's Supabase app connector was independently exercised:
project/org metadata, migration/table lists, SQL catalogs and advisors worked.
It exposes write tools and multiple projects, so it is **not** the dedicated
read-only MCP. Its authentication does not transfer to either CLI client.

The standalone Codex CLI did not load this untrusted project's config:
`codex mcp get supabase_enterprise_readonly --json` returned no such server.
The owner must review/trust this checkout in Codex, restart, inspect tool discovery,
then use `codex mcp login supabase_enterprise_readonly` and complete OAuth privately.
Confirm metadata-only `list_tables`/`list_migrations` in that new client session.
No global configuration or credentials were changed by this task.

Claude Code executable was not available on PATH or inspected installation paths.
`.mcp.json` is prepared; live loading, approval behavior, OAuth and queries remain
NOT AVAILABLE/NOT RUN. Once installed, use `/mcp` to authenticate the named server,
keep interactive tool approvals, and repeat the harmless metadata checks.

Local MCP is unavailable with the DB-only runtime. Its Codex entry is disabled;
Claude has no active local entry. Enable only after successful full-stack status
reports the actual local API/MCP URL and a tools-list/catalog query succeeds.

Official Supabase plugin `1.0.0` already supplied `supabase` skill `0.1.2` and
`supabase-postgres-best-practices` `1.1.1` to this Codex session. Both entrypoints
were read. Official docs reference `supabase/agent-skills`; inspected upstream
HEAD was `c9be0e931b7930f7d02126d04774d904c381e7d7`. No redundant copy, third-party
installer, competing instruction file, or unverified Claude skill-loading claim
was added. Skills are technical references, not policy or authority.

## Isolation and delivery

One task/agent owns one feature branch/worktree and one local DB. Additional
worktrees need distinct `nestscout-enterprise-*` IDs and nonoverlapping ports;
review their local MCP endpoints too. Ownership is checked against the checkout
path and container ID. Do not share/reset another agent's DB or reuse an ownership
marker after a container was recreated elsewhere.

Sequence: discover → feature branch → local changes → replay → SQL/types/checks →
commit → inspect all push/integration triggers → gated feature push → explicitly
approved hosted CI/PR → human review/merge approval → separate release approval.
Run `npm run db:stop` when done; it targets this project and retains local volumes.

The dated [setup evidence](setup-evidence.md#supabase-agent-setup-2026-10-24)
records actual verification and push blockers. The [operations guide](operations.md#supabase-pro-readiness)
covers paid-plan/recovery preparation. No hosted automation was changed.

## Official references checked

- [MCP scope, read-only mode and OAuth](https://supabase.com/docs/guides/ai-tools/mcp)
- [Official agent skills](https://supabase.com/docs/guides/ai-tools/ai-skills)
- [Local workflows](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Local networking](https://supabase.com/docs/guides/local-development)
- [GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Changelog](https://supabase.com/changelog.md)
