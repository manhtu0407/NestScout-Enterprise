# Supabase development

Technical setup under the root [engineering policy](../AGENTS.md).
The owner selected native App development, without Vercel hosting. This repository
currently contains tooling, with no Expo application, Supabase client, bookings,
payments, product roles or Kael runtime. Do not import another project's schema.

## Installation and local runtime

Use Node 24 and an installed, running local Docker engine:

```sh
npm ci --ignore-scripts
npm run tools:install
npm run db:start
npm run db:status
```

CLI `2.122.0`, MCP SDK `1.32.2`, TOML parser `1.9.1`, and TypeScript `7.0.2` are
pinned in npm. `supabase/supabase.lock` pins official service images by digest;
startup uses `--frozen`. No application or hosted deployment dependencies were added.

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
`.cache/supabase-local.lock`. Stop retains this stack's data. Never log raw CLI
status/start JSON: its `env` field contains local passwords and API keys. The
wrapper outputs only selected identity and endpoint fields.

## Schema and verification limits

`supabase/migrations/` is the sole application schema source; no SQL migrations
were invented. Hosted history and public relations are empty. Hosted metadata
also contains `public.rls_auto_enable()` and `ensure_rls`, absent locally. Their
platform ownership/source remains a reconciliation gap, so empty local drift
does **not** establish complete hosted parity. No remote repair, DDL or data
export was performed. Generate future migration names with the pinned CLI.

`supabase/seed.sql` contains no data. Add synthetic fixtures alongside real product
migrations. `supabase/database.types.ts` is the single generated artifact, from
local `public`, normalized to LF without trailing whitespace. There is no app
client to consume it yet. `typecheck:db` checks that artifact only.

The four pgTAP checks inspect actual public RLS, view security, privileged RPC
access and function search paths. Eight wrapper tests exercise target rejection,
identity/binding validation, remote Docker rejection, asynchronous locking,
redaction and client configuration. Empty-schema success does not prove Customer
A/B, Worker, Admin, payment or Kael isolation: those features are NOT IMPLEMENTED.

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
Claude model sign-in and fresh model behavior/policy-loading tests remain NOT RUN.
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
