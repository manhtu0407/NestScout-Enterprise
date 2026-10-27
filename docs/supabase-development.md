# Supabase development

Technical setup under the root [engineering policy](../AGENTS.md).
The owner selected native App development, without Vercel hosting. This repository
contains tooling and the minimal Application Foundation V2 mobile app, whose only
database object is the technical `worker_access_grants` table. There are no
bookings, payments, worker onboarding or Kael runtime. Do not import another
project's schema.

Engineering Foundation V1 uses **Supabase Local for development/testing**, with no
Staging Project, additional remote environment or Production write/deploy step.
The existing hosted read-only MCP connection below remains diagnostic access.
It is never a local-test fallback or an App configuration source. See the
[environment and security contracts](foundation-contracts.md).

The local `[auth]` service supports platform tooling; `enable_signup = false`,
`enable_anonymous_sign_ins = false`, no extra redirects and the loopback `site_url`
are retained. This is not an implemented App login flow. Guest discovery means
unauthenticated access to an approved public projection later, not enabling
anonymous Auth accounts. The phone/OTP direction does not authorize enabling an
SMS provider, OAuth, signup or a deep link before Application Foundation.

## Installation and local runtime

Use Node 24 and an installed, running local Docker engine:

On Windows, stop an existing task stack with `npm run db:stop` before reinstalling
dependencies. Its owner process holds the pinned CLI executable open; `npm ci`
cannot replace that file while the stack runs. Do not elevate npm or kill unrelated
processes to bypass the lock. A new checkout without a running stack can install directly.

```sh
npm ci --ignore-scripts
npm run tools:install
npm run db:start
npm run db:status
```

CLI `2.122.0`, MCP SDK `1.32.2`, TOML parser `1.9.1`, and TypeScript `7.0.2` are
pinned in npm. `supabase/supabase.lock` pins official service images by digest;
startup uses `--frozen`. Application Foundation V2 added the Expo workspace
dependencies in `apps/mobile`; no hosted deployment dependency exists.

`supabase/config.toml` enables the **experimental managed stack** using Docker.
This choice followed a disposable Windows proof: the legacy runtime published
all interfaces because Docker ignored its network binding default, while managed
stacks explicitly publish `127.0.0.1` and passed inspection. Experimental features
are outside the CLI compatibility guarantee. Review CLI/image updates together,
repeat the local gates, and retain the pins until that verification is complete.

The managed runtime derives identity from the absolute checkout path and Git
branch, isolates local data, and allocates dynamic loopback endpoints. Each agent
or task needs its own worktree/branch. The wrapper verifies current root, branch,
stack ID, local Docker socket, running DB, and every published Docker binding.
It never selects a hosted project, changes Docker settings, or stops another stack.
Unused Storage, Realtime, Functions, mail, Analytics and pooler are excluded.
Enabled HTTP services wake on demand.

```sh
npm run db:reset
npm run db:history
npm run db:test
npm run db:mcp:test
npm run db:lint
npm run db:drift
npm run db:types
npm run db:types:check
npm run typecheck:db
npm run check
npm run verify:negative
npm run db:stop
```

Run these sequentially. Reset, history, SQL tests, lint, diff and type generation
use explicit `--local`. Drift uses the managed stack's pg-delta engine with strict
coverage. Additional flags, linked checkouts, remote Docker endpoints and local
dotenv target overrides are rejected; ambient Postgres/Supabase overrides are
removed. A checkout lock rejects overlapping CLI commands and asynchronous MCP requests.
After interruption, verify the owning process has exited before removing a stale
`.cache/supabase-local.lock`. Its PID/start time identify the operation; stale
leases are never automatically reaped, and release preserves a replaced lease.
Stop checks both the owner state and running task containers and retains data.
On a pristine checkout, the pinned CLI reports a specific missing-stack error.
Only that exact response permits first startup or a stop with no resources
targeted; other status failures remain errors. Startup still verifies the resulting
worktree/branch identity and Docker loopback bindings before reporting success.
Never log raw CLI
status/start JSON: its `env` field contains local passwords and API keys. The
wrapper outputs only selected identity and endpoint fields.
Environment filtering is case-insensitive on Windows; both CLI link formats and
dotenv variants in the root/Supabase folder are rejected before every CLI call.
Unknown error messages/stdout/stderr are withheld, retaining stable error/exit
codes. MCP errors use the same boundary; synthetic error regression checks do not
print their payloads. HTTP errors and SQL errors must remain failures.

## Schema and verification limits

`supabase/migrations/` is the sole application schema source; no SQL migrations
were invented. Hosted history and public relations are empty. Hosted metadata
also contains `public.rls_auto_enable()` and `ensure_rls`, absent locally. Their
definitions match Studio's optional Auto enable RLS template, are owned by
`postgres`, and are not extension members. The installing actor/mechanism is still
unverified; do not label them automatically maintained platform objects. Empty
drift establishes only local application migration consistency, **not** complete
hosted catalog parity. PostgreSQL major versions agree (17); local image release
17.11.0.006 and hosted 17.11.0.003 differ. No remote repair, DDL or data
export was performed. Generate future migration names with the pinned CLI.

`supabase/seed.sql` contains no data. Add synthetic fixtures alongside real product
migrations. `supabase/database.types.ts` is the single generated artifact, from
local `public`, normalized to LF without trailing whitespace. The mobile app does not
import it yet. It has not been regenerated for `worker_access_grants` because the
pinned images could not be pulled in the authoring environment: run `npm run db:types`
where the stack starts and commit the result before relying on `db:types:check`. The
app reads that one table through an untyped boundary with runtime validation until
then. `typecheck:db` checks that artifact only.

pgTAP inspects actual public RLS, table/column view grants, readable snapshots,
SECURITY DEFINER EXECUTE (ordinary RPC and hooks separately), and reviewed function
search paths. Transactional fixtures prove rejection and acceptance after local
repairs and then roll back. Hook ACL hygiene is not a claim that event-trigger
functions can execute through RPC. These checks do not replace SQL/source review
of definer functions. Exposing additional application schemas requires updating
the configuration guard and corresponding database checks; `graphql_public` is
the existing platform GraphQL schema, outside the application type artifact.
Wrapper tests cover target/environment isolation, locks, diagnostic disclosure,
image pinning and both client configurations. `worker_access_grants` has real
allowed/denied tests in `supabase/tests/database/worker-access-grants.test.sql`
(anonymous, other-user, self-grant and revocation denials). Customer A/B, Admin,
payment and Kael isolation are NOT IMPLEMENTED.
Future application migrations must enable RLS explicitly and supply the feature's
actual role/grant/policy tests; do not rely on the optional hosted event trigger.
Do not reuse its names, drop it, or baseline its ownership implicitly. Any decision
to manage that hook through migrations needs owner-approved reconciliation first.
Future role tests should authenticate synthetic users under the real API/SQL roles,
exercise allowed and denied row/state transitions, then roll back their fixtures.

## Codex and Claude Code

Hosted diagnostics use the same project-scoped, read-only endpoint in
`.codex/config.toml` and `.mcp.json`: project `axpdymbusiwxfzurfclg`, features
`database,debugging,docs`, without tokens, headers or skipped elicitations.
Codex allowlists six tools and requests approval. Claude's `.claude/settings.json`
requests MCP tool approval and denies log scanning, migration application,
deployment and key retrieval. Read-only SELECT still requires metadata discipline.
Developer MCP access is separate from runtime Kael permissions.

For Codex, review/trust the exact checkout, then authenticate with narrow scopes:

```sh
codex mcp get supabase_enterprise_readonly --json
codex mcp login supabase_enterprise_readonly --scopes database:read,analytics:read
```

The task added trust only for this checkout to the local Codex configuration.
OAuth is stored by the client outside Git. Actual Codex app-server discovery and
`list_migrations` succeeded for both hosted and local connections without a model
run. The active desktop connector was separately tested; its broader account
permissions do not transfer to these dedicated endpoints.
The subsequent fresh interactive Codex session also read the existing Supabase
plugin skill, preserved root policy boundaries, and returned hosted migrations
and local public tables after two separate one-time approval prompts. Noninteractive
`exec` correctly blocked those prompts under approval policy never. See the
[hardening evidence](setup-evidence.md#supabase-hardening-verification-2026-10-25)
for the tested runtime mode and limits; do not disable prompts to make it pass.

Claude Code `2.1.310` was installed from Anthropic's official source with valid
Authenticode signature. On this Windows machine it is at
`%USERPROFILE%/.local/bin/claude.exe`; PATH was not changed. Project `.mcp.json`
pins OAuth request scopes to `database:read analytics:read`. Inspect the actual
consent page before authorizing: the initial dynamic-registration flow still
displayed eight read groups and was cancelled. A client registered with the same
two explicit scopes, configured using native `--client-id`, `--client-secret` and
`--callback-port`, resolved this. Its per-project local configuration/credentials
stay outside Git; it overrides the identical project endpoint, not another server.
Cached registration was cleared before the final narrow login. Only Database READ
and Analytics READ appeared on the accepted consent.

The local ignored `.claude/settings.local.json` approves only these two named
servers. Until workspace onboarding/trust is complete, it can be selected explicitly:

```sh
claude --settings .claude/settings.local.json mcp get supabase_enterprise_readonly
claude --settings .claude/settings.local.json mcp get supabase_enterprise_local
```

Both returned Connected. A metadata-only SDK probe using only this Claude client's
OAuth credential returned empty migration/table lists; credentials stayed in
process memory. This is transport/auth evidence, not a Claude model-driven query.
Claude model sign-in and fresh model behavior/policy-loading tests remain BLOCKED.
Current Claude documentation supports direct AGENTS.md loading from 2.1.277;
installed 2.1.310 meets that version threshold and no ancestor policy shadows the
root here, but file presence/default settings do not prove a session loaded it.
Do not add policy mirrors or loaders to resolve that gap.

Both clients launch `scripts/supabase-mcp.mjs` for local MCP. It uses the official
SDK, verifies current stack identity/bindings, derives the real endpoint, refuses
redirects and target overrides, and exposes only six diagnostic tools. Local SQL
may write only the verified disposable DB and still requires client approval.
Start the stack first. A closed MCP session does not stop the shared task stack.
The SDK handshake, tool list and a catalog count query were demonstrated locally;
native Codex metadata calls and Claude CLI connection checks also succeeded.

The installed official Supabase plugin already supplied skill `supabase` `0.1.2`
and `supabase-postgres-best-practices` `1.1.1` to this Codex session. Both were read;
upstream `supabase/agent-skills` was inspected at
`c9be0e931b7930f7d02126d04774d904c381e7d7`. No duplicate skill copies were added.
Claude skill discovery/behavior is NOT VERIFIED. Skills remain technical references.

## Delivery and references

The workflow now runs `Supabase local verification` on a standard Ubuntu 24.04
runner for PR/main events. It exercises the same canonical local commands and
attempts targeted cleanup after an attempted startup, including failures. No
hosted credentials, caches or uploaded artifacts are used. Main requires this
job and `Repository checks` from GitHub Actions; zero independent approvals are
required while there is one maintainer. Passing checks never authorize merging
or Production deployment. See the latest
[Linux CI evidence](setup-evidence.md#github-protection-and-linux-ci-2026-10-25).

Discover → isolated feature/worktree → local replay/SQL/types/checks → commit →
inspect all integrations → gated feature push → explicitly approved PR/hosted CI →
review and approved merge → separately approved production release.
The dated [setup evidence](setup-evidence.md#supabase-agent-setup-2026-10-24)
records outcomes; [operations](operations.md#supabase-pro-readiness) covers costs
and recovery. Neither document grants release authority.

- [Supabase MCP and OAuth](https://supabase.com/docs/guides/ai-tools/mcp)
- [Official skills](https://supabase.com/docs/guides/ai-tools/ai-skills)
- [Local workflows](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Managed stack isolation](https://supabase.com/docs/guides/local-development/running-multiple-local-projects)
- [GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Claude MCP configuration](https://code.claude.com/docs/en/mcp)
- [Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Changelog](https://supabase.com/changelog.md)
