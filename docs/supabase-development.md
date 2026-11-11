# Supabase development

Technical setup under the root [engineering policy](../AGENTS.md).
The current app uses Expo SDK 58, React Native and TypeScript with Supabase Auth,
Postgres/RLS, Storage, RPCs and Edge Functions. Customer service intake, Worker
workflows and Kael sessions/runtime are implemented in the repository; payment
settlement and commercial dispatch are not established. Do not import another
project's schema.

Ordinary development and tests use **Supabase Local**. There is no Staging Project.
The connected hosted Supabase project is the app backend, while the project-scoped
read-only MCP connection below is diagnostic access only. Hosted state is never a
local-test fallback. A read-only observation on 2026-11-11 found project
`axpdymbusiwxfzurfclg` `ACTIVE_HEALTHY`, migration history through
`20261110224223` (`add_kael_session_management`), and `kael` Edge Function v19
`ACTIVE` with JWT verification enabled. This audit made no hosted changes and did
not verify a tester Auth session, real SMS, or a complete live app flow. See the
[environment and security contracts](foundation-contracts.md).

The local `[auth]` service retains `enable_signup = false`,
`enable_anonymous_sign_ins = false`, no extra redirects and the loopback `site_url`.
The mobile client has email/password and phone OTP flows. Local signup and SMS
delivery remain disabled by default, and this audit did not verify a live OTP
round trip. Guest discovery means unauthenticated access to an approved public
projection, not enabling anonymous Auth accounts. Provider, OAuth and redirect
configuration still need review against the relevant owner-approved flow.

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
startup uses `--frozen`. The root npm workspace includes the Expo app in
`apps/mobile`; the application also uses the connected hosted Supabase project.

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
Unused Realtime, Functions, mail, Analytics and pooler are excluded. Storage runs locally for two
private buckets, `avatars` and `request-photos`: 5 MiB, JPEG/PNG/WebP, owner-folder policies, deletion
only through the Storage API. The hosted project has both buckets with the same limits, and database
backups do not cover object bytes, so treat uploaded files as outside the database recovery path.
A request folder accepts at most twelve raw objects, counted by a definer helper because a policy cannot
read its own table; at most six of them can be attached. The app names each photo once, keeps the
pending list on the device, and retries an interrupted upload under the same name, so a retry never
creates an orphan object. Owner-authorized hosted migration application began on
2026-11-02. A read-only history check on 2026-11-11 reached
`20261110224223` (`add_kael_session_management`) and matched repository migration
names and versions through that head. Hosted PostgreSQL was observed at 17.11.0.003
and the pinned local image at 17.11.0.006; version differences remain separate from
migration-history parity.
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

`supabase/migrations/` is the sole application schema source. It now includes
service-request, Customer/Worker and Kael boundaries in addition to
`worker_access_grants`; use the migration history and feature-specific tests rather
than treating the V2 baseline as the current schema. A 2026-11-02 hosted metadata
review found `public.rls_auto_enable()` and `ensure_rls`, absent locally, matching
Studio's optional Auto enable RLS template, owned by `postgres` and not extension
members. The installing actor/mechanism was unverified. Their `execute` grants to
`public`, `anon` and `authenticated` were revoked on 2026-11-02 because the trigger
runs without an execute check and the function must not be callable through the API;
a probe table confirmed row-level security still enabled automatically. This is a
dated observation, not a claim that those objects are platform-managed. Empty drift
establishes local application migration consistency, **not** complete hosted catalog
parity. Generate future migration names with the pinned CLI.

`supabase/seed.sql` holds synthetic local Customer/Worker fixtures for service
requests, jobs and Kael boundaries; they are not hosted customer records. Add further
fixtures alongside real product migrations. `supabase/database.types.ts` is the
single generated artifact from local `public`, normalized to LF without trailing
whitespace. The mobile app uses feature repositories and runtime response validation;
`typecheck:db` checks the generated artifact, not application query typing.

pgTAP inspects actual public RLS, table/column view grants, readable snapshots,
SECURITY DEFINER EXECUTE (ordinary RPC and hooks separately), and reviewed function
search paths. Transactional fixtures prove rejection and acceptance after local
repairs and then roll back. Hook ACL hygiene is not a claim that event-trigger
functions can execute through RPC. These checks do not replace SQL/source review
of definer functions. Exposing additional application schemas requires updating
the configuration guard and corresponding database checks; `graphql_public` is
the existing platform GraphQL schema, outside the application type artifact.
Wrapper tests cover target/environment isolation, locks, diagnostic disclosure,
image pinning and both client configurations. Local SQL tests cover service intake
and workflow boundaries, Customer/Worker visibility, and Kael runtime, knowledge
and session behavior. They do not establish live hosted Auth, provider or native-app
behavior. Admin workflows and payment settlement remain unimplemented.
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

## Phone OTP delivery (Send SMS Hook and eSMS)

Supabase Auth creates, stores, expires and verifies every OTP. The Edge Function
`supabase/functions/send-sms-hook` only relays the code Auth hands it to eSMS; the mobile
app calls `signInWithOtp` and `verifyOtp` and never contacts eSMS.

- The function verifies the Standard Webhooks signature (`webhook-id`, `webhook-timestamp`,
  `webhook-signature`, 5 minute tolerance, constant-time comparison) over the raw body
  before reading the payload, so a direct client call is refused with 401. It needs
  `verify_jwt = false` because Auth does not send a user JWT; the signature is the only
  gate, so never deploy it without `SEND_SMS_HOOK_SECRET`.
- Server-side settings (names only; values never enter Git, the app bundle, logs or
  reports): `SEND_SMS_HOOK_SECRET` (the hook signing secret, `v1,whsec_...`),
  `ESMS_API_KEY`, `ESMS_SECRET_KEY`, `ESMS_BRANDNAME`, `ESMS_OTP_TEMPLATE` (must contain
  `{{otp}}` and be an eSMS-approved template), optional `ESMS_SMS_TYPE` (default `2`) and
  `ESMS_SANDBOX`. Missing settings fail closed with 503 and log only the setting names.
- `ESMS_SANDBOX` defaults to sandbox: eSMS validates the request, sends nothing and
  charges nothing. Only the exact value `0` requests live delivery, after the brandname,
  template and `SmsType` are approved on the eSMS account.
- eSMS `CodeResult` 100 means the request was accepted, not delivered. `124` (RequestId
  reused) is a duplicate of an accepted message; the RequestId is a hash of the phone and
  OTP so a repeated hook call cannot bill twice. Other codes (`101`, `104`, `146`, ...),
  non-2xx replies, unreadable bodies and the 4 second timeout return a generic 500, which
  Auth surfaces as a send failure; the message is never retried blindly.
- Logs contain the outcome, the last three phone digits and the eSMS code, never the OTP,
  the full number or any credential.
- Hosted enablement is not part of the repository and needs owner approval: enable the
  Phone provider with confirmations on, deploy the function, register its URL as the Send
  SMS hook with the generated secret, and set OTP length 6, expiry 300 seconds and a 60
  second resend interval. Local `config.toml` keeps signup and the hook disabled.
- Cost and abuse controls are enforced by Supabase Auth, not by the app or the hook. Official
  defaults: 30 SMS per hour per project, 30 sign-in or OTP requests per 5 minutes per IP, 30
  verifications per 5 minutes per IP and one OTP per user per 60 seconds. Each is adjustable
  under Authentication, Rate Limits. Recommended for a private beta: SMS per hour at 15 and
  the per-IP request limit at 10 per 5 minutes (carrier NAT shares IPs, so do not go lower),
  leaving the verify limit and the 60 second user window alone. Raise the hourly cap when
  real peak logins approach it, because a global cap is also a way to block real users.
- The hook accepts Vietnamese mobile numbers only, which removes the international
  premium-route incentive behind SMS pumping. Keep the eSMS balance prepaid and low with no
  automatic top-up, so the balance is the final cost ceiling. Use Supabase test phone
  numbers for development and QA; they skip the hook and send nothing.
- Before a public launch, add CAPTCHA on the OTP request (Supabase supports hCaptcha and
  Cloudflare Turnstile) and a per-phone daily cap, and watch the ratio of OTPs sent to OTPs
  verified in the function logs. Neither is implemented yet.
- Live delivery, the Auth-to-function round trip and the hosted rate limits are NOT
  VERIFIED; the repository tests cover the function against a mocked eSMS.

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
