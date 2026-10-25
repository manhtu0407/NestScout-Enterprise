# GitHub foundation setup evidence

Latest Supabase results: [hardening verification, 2026-10-25](#supabase-hardening-verification-2026-10-25).
Earlier dated test counts and agent limitations below are historical observations.

## Supersession note — 2026-10-24

This file preserves historical observations, not current agent instructions or
standing authorization. The root [AGENTS.md](../AGENTS.md) is the sole repository-wide
engineering policy for Codex and Claude Code. References below to the former custom
AI guide, Copilot instructions, reserved-name restrictions, and pending merges
describe earlier states; the original evidence is retained unchanged.

The owner reviewed and merged PR #3 (`2f89c3f`) and PR #7 (`3df31aa`). Commits
`24f0301` and `9e5b1fe` were explicitly authorized for review. The current
consolidation starts from `9e5b1fe` and supersedes the old AI instruction sources;
those approved actions are not governance violations. Current checks and runtime
compatibility require fresh evidence for the consolidation revision.

## Current state after owner-approved public transition — 2026-10-24

The owner explicitly confirmed making `manhtu0407/NestScout-Enterprise` public to
run standard hosted CI. Repository ID remains `1432052547`; the management Project
stays private. The identity guard now requires public visibility for this exact repo.
Billing, ownership, original README, and the no-new-AGENTS restriction are unchanged.

The owner merged bootstrap PR #3 at 2026-10-24 10:56:26 UTC as
`2f89c3fdca58c93557aefd0dabc798dc8988336c`; the agent did not perform that merge.
Issue Forms now visibly offer Bug report, Feature request and Task on GitHub.
Dependabot opened its first Actions update PRs after default-branch activation.
The public-alignment follow-up is isolated in PR #7 and remains for owner review.

PASS: [run 40087426696, attempt 2](https://github.com/manhtu0407/NestScout-Enterprise/actions/runs/40087426696/attempts/2)
completed on hosted Linux, including all repository checks, negative fixtures, and
fresh-checkout executable-hook validation. The initial account-limit blocker is
resolved for this public repository's standard runner. Final-head checks are linked
from PR #3. This does not claim application tests/builds exist.

Public branch protection/native security features have different eligibility from
the initial private setup. No ruleset or CodeQL configuration was added by this
visibility task. API currently reports native secret scanning and push protection
disabled; Gitleaks remains the implemented scanner. Existing billing limits remain.

The remaining sections record the initial private setup and its historical blockers;
the public-transition evidence above supersedes their current-state restrictions.

## Identity and baseline — 2026-10-24

- Repository: `manhtu0407/NestScout-Enterprise`, ID `1432052547`, private, default `main`.
- CLI and GitHub connector authenticated as `manhtu0407`; admin access confirmed.
- Connector fetched the expected README; initial main SHA `0374b22e793da10f45cf22b2f8303b2058484351`.
- Initial contents: README only; no workflows, environments, hooks, secrets/variables,
  releases, or other collaborators. Local directory was empty before clone.
- GitHub App installation already selected all repositories. Left unchanged;
  all task writes explicitly target NestScout.
- Billing UI confirmed GitHub Free and Copilot Free, existing account-wide Actions
  budget $0 with usage blocked beyond its budget. No billing settings changed.

## Repository settings baseline

| Setting | Before | Verified after |
| --- | --- | --- |
| Merge methods | merge/rebase/squash allowed | squash only |
| Auto-merge | false | false |
| Delete merged branches | false | true |
| Actions | enabled; all Actions allowed | selected external Actions: checkout/setup-node at pinned SHAs |
| SHA pinning policy | false | true, API verified |
| Default workflow token | read; cannot approve PRs | same |
| Log/artifact retention | 90 days, UI observed | 7 days, UI saved |
| Dependency graph/alerts/updates | alerts disabled; graph not established | all three enabled, UI/API verified |
| Rulesets/branch protection | API 403, upgrade required | BLOCKED BY FREE PLAN |

Settings are outside Git: revert the associated setting using the pre-change snapshot,
not only a Git revert. Final results and evidence links are recorded below after checks.
GitHub's selected-Actions policy also allows the owner's own Actions/reusable workflows;
it is not an absolute two-Action-only boundary. SHA pinning remains enabled. Fork PR
workflows are off; Actions components are not accessible from other repositories.

## Implementation verification

- Owner follow-up: reserved `AGENTS.md`/`README.md` names require separate permission.
  AI instructions moved to `docs/ai-working-guide.md`; development content moved to
  `docs/development-guide.md`. Original README restored to its initial Git blob.
  `npm run check:reserved` checks both the working copy and index; it rejects newly
  introduced reserved filenames. Markdown lint excludes only the untouched original.

## Checks and review

- PASS: `npm run identity`, `npm run check`, `npm run verify:negative` on Windows x64.
- PASS: `npm audit` found zero known vulnerabilities after a pinned KaTeX override to
  0.18.2 for transitive advisory GHSA-238p-pmpm-9mq7. This is development tooling only.
- PASS: invalid Markdown, duplicate YAML keys, invalid workflow property, redacted
  synthetic token, and staged-secret/clean-working-file fixtures were rejected.
- PASS: Standards and Spec reviews completed. Findings about staged blob coverage
  and Linux executable hook modes were fixed and re-reviewed. Hooks are Git mode 100755.
- Tool provenance: actionlint 1.7.12 from rhysd/actionlint and Gitleaks 8.30.1 from
  gitleaks/gitleaks official releases; checked against their published SHA-256 lists.
  Exact Windows/Linux x64 hashes are recorded in `scripts/tools.json`.
- Local hooks enabled only for this checkout using `core.hooksPath=.githooks`.

## Initial private GitHub Actions: BLOCKED BY ACCOUNT LIMIT (historical)

The [initial PR run](https://github.com/manhtu0407/NestScout-Enterprise/actions/runs/40086896998)
failed before any step or runner started. GitHub's check annotation says:

> The job was not started because recent account payments have failed or your spending limit needs to be increased.

This is the provider's generic billing/spending-limit message, not proof of failed
payment specifically. The existing $0 Actions budget remains unchanged. Do not raise
it, buy minutes, or move to paid runners. At that point Linux workflow/hook execution
was UNVERIFIED. Public-transition evidence above now confirms Linux execution. Local checks are not a
substitute for this missing runner evidence. The final head's check state is visible
on [setup PR #3](https://github.com/manhtu0407/NestScout-Enterprise/pull/3).

## Project and task tracking

- PASS: [NestScout — Delivery](https://github.com/users/manhtu0407/projects/3) is private;
  default repository is NestScout-Enterprise. No other repo is selected for auto-add.
  Repository Projects tab lists this exact Project with its Private badge.
- PASS: ordered Status values Backlog, Ready, In progress, In review, Done;
  Priority P0/P1/P2/P3 and Size XS/S/M/L/XL saved and used on Issues.
- PASS: native workflows add new matching open Issues/PRs to Backlog, closed Issues
  to Done, reopened items to Ready, linked Issues to In review. Merged PRs target Done.
  Item-closed workflow excludes PRs so an unmerged closed PR is not marked completed.
- PASS: [verification Issue #4](https://github.com/manhtu0407/NestScout-Enterprise/issues/4)
  was observed moving Backlog → Done → Ready, then closed after the test.
- PASS: foundation Issue #1 linked to PR #3 and automatically moved to In review;
  stack-planning Issue #2 is in Backlog. Both are assigned to the owner.
- PR-merged automation configuration was inspected; no merge was performed to test it.
- Issue Forms, PR template and Dependabot configuration are WAITING FOR MERGE into
  default `main`. Their source/YAML have been checked; live default-branch activation
  cannot be claimed before the owner's merge decision.

## Backup and recovery

- PASS: `scripts/backup.mjs` created a bundle outside the checkout, verified it,
  cloned it into a new restore-proof directory, and ran `git fsck --full`.
- Source/restored SHA matched: `8f904761860c7203ee1628e626243a69cfec2435`.
- Initial backup: `C:/Users/Phan Manh Tu/NestScout-backups/foundation-20261024-1742`.
  It includes accessible repo/settings/branch/label/milestone/release/Issue/PR data,
  comments/reviews, a manifest, and pre/post-settings JSON snapshots.
- Ruleset export is restricted by the Free plan. Projects API export is UNVERIFIED
  because the CLI token lacks Projects scope; UI observations are recorded here.
  Board/settings DOM snapshots, a configuration summary, and screenshots are saved
  alongside the initial backup; these are evidence, not a complete Projects API dump.
  Bundle/metadata exports do not include secret values, LFS objects, or release binaries.

## AI and account follow-up

- PASS: GitHub connector reads this exact repository; Codex operates on its verified
  checkout. The custom AI guide must be explicitly referenced for Codex tasks; it is
  not claimed to load automatically under a reserved instruction filename.
- PASS: Copilot Free entitlement observed in billing. Instructions are prepared;
  Copilot response behavior is UNVERIFIED and default-branch instructions await merge.
  No paid Copilot review, AI API workflow, or trial was enabled.
- OWNER ACTION: account UI reports two-factor authentication is not enabled.
  The owner must configure authentication and retain recovery credentials privately;
  no password, passkey, OTP, or recovery-code changes were attempted.
- Application build/test/deployment/monitoring/data recovery: WAITING FOR STACK.
- Initial private eligibility was BLOCKED BY FREE PLAN. After the authorized public
  transition, reevaluate native features separately; no mandatory merge rules were added.

## Supabase agent setup 2026-10-24

Verdict: **PARTIALLY_READY**. Evidence applies to baseline
`935824e4c07ea7de7012a8f1b0d1b72517f41a44`, setup commit
`4c5f00b5816f49617e42ce30414a1e5c7a00e5d9`, and the managed-stack follow-up on
`chore/supabase-agent-local-setup`, Windows x64, Node 24.19.0, npm 11.17.0,
Supabase CLI 2.122.0, Docker 29.9.2 / local named-pipe context `desktop-linux`.
The task cloned the existing GitHub repository into the previously empty workspace;
its initial working tree was clean. Root policy and original README are unchanged.

### Hosted discovery

- PASS: GitHub connector and `npm run identity` verified repository ID `1432052547`,
  owner `manhtu0407`, public, default `main`, exact HTTPS fetch/push origins.
- PASS: Supabase connector project/org metadata and authenticated dashboard agree:
  `axpdymbusiwxfzurfclg`, Seoul `ap-northeast-2`, Free, Nano/t4g.nano, healthy,
  Postgres `17.11.0.003`. Integration names the exact target repository.
- OBSERVED: zero hosted migrations, zero public relations, zero Storage buckets,
  no public/Storage policies, no Edge Functions. Catalogs show `rls_auto_enable`
  returning `event_trigger`, `SECURITY DEFINER`, `search_path=pg_catalog`, with
  PUBLIC/anon/authenticated EXECUTE grants, and an `ensure_rls` event trigger.
  Local public schema is empty. Platform-object parity remains NOT VERIFIED.
- OBSERVED: email Auth enabled, email confirmation/signup enabled; anonymous and
  manual linking disabled; listed social/phone providers disabled, no custom
  providers. No provider settings, secrets or customer records were accessed/changed.
- Security Advisor: two WARN findings for anonymous/authenticated EXECUTE on
  `rls_auto_enable`. Exploitability of this event-trigger-returning function was
  not established; no production fix was applied. Review
  [anonymous EXECUTE guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  and [authenticated EXECUTE guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
  Performance Advisor returned no findings. This does not prove application security.
- Logs queries: NOT RUN to avoid additional scan usage; dashboard health and
  small catalog queries only. Exposed Data API schema settings beyond observed
  public objects/grants remain NOT VERIFIED.

### Free usage alert

Dashboard cycle **25 Sep–25 Oct 2026**. Organization totals showed Log Ingestion
**4.39 GB / 1 GB** (3.39 GB over) and Log Query **690.37 GB / 100 GB**
(590.37 GB over). Other observed totals were below allowance: egress 1.98/5 GB,
Storage average 0.06/1 GB, 18/50,000 MAU, 169,065/500,000 function invocations,
215/2,000,000 realtime messages, peak connections 8/200.

Project filter for NestScout-Enterprise showed ingestion approximately **0.001 GB**,
query **0 GB**, DB **24.88 MB**, no reported egress/MAU/Storage/function usage.
These aggregate observations do not attribute the organization excess to this
project. Dashboard labels the log metrics UPCOMING; official
[ingest](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest)
and [query](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query)
docs confirm the grace period through the start of 2027. No billing/restriction
impact from these two metrics was observed. Usage may lag; reassess after cycle
reset. Lowest-cost response: avoid polling/broad scans, narrow time/source/columns,
and investigate logging sources only within the approved project scope.

### Local verification

| Command/check | Result and limit |
| --- | --- |
| `npm ci --ignore-scripts`, pinned installs | PASS; no lifecycle scripts; npm audit reported 0 vulnerabilities |
| `npm run tools:install` | PASS; existing actionlint/gitleaks SHA-256 verification preserved |
| `npm run check` | PASS; reserved files, Markdown, YAML, workflows, staged/history/working-file secret scans |
| `npm run verify:negative` | PASS; existing invalid fixtures and staged-secret regression rejected |
| `npm run verify:supabase` | PASS; local target, container/bind, Docker endpoint, diagnostics and MCP configuration cases |
| `npm run db:types`, `npm run db:types:check` | PASS; generated from verified local DB; byte-equivalent normalized regeneration |
| `npm run typecheck:db` | PASS; generated artifact only; product typecheck NOT IMPLEMENTED |
| `npm run db:test` | PASS; 4 pgTAP metadata checks on actual empty public schema |
| `npm run db:lint` | PASS; no public function/type issues locally |
| `npm run db:status` | PASS; reports verified worktree/branch stack and actual loopback endpoints without credentials |
| `npm run db:start`, `db:reset`, `db:history`, `db:drift` | PASS on managed Docker stack; reset/replay, empty migration history and strict pg-delta drift |
| Local migration replay from reset | PASS for the actual empty migration directory; not application schema coverage |
| Customer/Worker/Admin/payment/Kael RLS scenarios | NOT IMPLEMENTED; no owning schema/endpoints; no invented business fixtures |
| Local MCP handshake/catalog query | PASS; SDK discovered six allowed tools; catalog query returned zero public tables |
| `npm run db:mcp:test` | PASS; real stdio/HTTP catalog query and denied migration-tool request |

The initial legacy runtime published all interfaces despite Docker's documented
network option. Those task containers were stopped, and an inert probe reproduced
the problem. The follow-up proved the experimental managed stack on a separate
disposable scratch root: explicit `127.0.0.1` bindings, distinct identity/endpoints,
and targeted destroy. Its generated local credentials were accidentally included
in a diagnostic output; the scratch stack was destroyed to invalidate them. No
hosted credential was involved. The final wrapper withholds raw credential-bearing
status/start JSON and reports only selected identity/endpoints.

The verified task stack ID is
`ebb98b437806fcbf5befd634aa49e3c47385672ad6aad011030a0a889b1e0cf2`, root
`C:/Users/Phan Manh Tu/Documents/ChatGPT/NestScout`, branch
`refs/heads/chore/supabase-agent-local-setup`. Observed dynamic ports were DB
28148, API/MCP 23033, Studio 26249, pgmeta 31244. Docker inspection confirmed
loopback-only publishing for every running task service. Both `db:start` resume
and a second reset/test/lint/drift/type-consistency sequence passed. The lock
rejects concurrent CLI/MCP operations and releases after asynchronous failure.
`npm run db:mcp:test` then passed against the real stack, including a rejected
migration-tool call. `npm run db:stop` passed, retaining local data for later use.

The managed backend rejected migra; the wrapper uses its supported pg-delta engine
with strict coverage. CLI and service-image digests are pinned. Experimental
compatibility risk remains; this is not a stable-runtime guarantee. Docker Desktop
was started when it was found stopped; no global Docker setting or unrelated stack
was changed. No application migrations or seed data were fabricated.

### Agent capabilities and publication gates

| Client | Verified capability | Remaining gap |
| --- | --- | --- |
| This Codex session | Supabase/GitHub connectors authenticated; harmless project/catalog queries demonstrated; official Supabase skill entrypoints read | Connector is broad, not enforced read-only/project-scoped |
| Standalone Codex CLI 0.163.0-alpha.10.2 | Exact checkout trusted; narrow OAuth; six-tool discovery and hosted/local `list_migrations` returned empty lists through app-server | Fresh model policy/approval behavior NOT RUN |
| Claude Code 2.1.310 | Official signed Windows executable installed; hosted/local native `mcp get` Connected; narrow OAuth accepted | Claude model sign-in, model-driven query and skill/policy behavior NOT RUN |
| Claude OAuth transport | SDK used only the matching endpoint/client credential in memory; hosted `list_migrations` and `list_tables(public)` returned empty lists | This is independent auth/transport proof, not a model-driven Claude query |
| Local MCP | Shared stdio bridge; six-tool allowlist, verified dynamic endpoint, no redirects, identity checks and serialized operations | Start the local stack before connecting; experimental backend |

The owner explicitly approved Database READ and Analytics READ for both clients.
Codex's scoped login succeeded. Claude's first consent listed eight read groups
despite its requested scopes; it was cancelled. Explicit narrow client registration,
native fixed-client configuration, clearing the old cached registration and another
login produced a consent with only the approved two groups. Claude authenticated
successfully. Its local per-project override retains the identical hosted URL;
client configuration/credentials remain outside Git. The local approval file names
only these two servers and keeps tool prompts. Tracked Claude permissions also deny
`query_logs`, migration/deploy and key retrieval. No PAT was created. Existing Codex
plugin skills were reused rather than duplicated; Claude skill behavior is unverified.

Repository workflow runs on `pull_request` and pushes to `main`; no workflow was
edited or dispatched. No open PR references the setup branch. Repo webhooks,
deployment records and environments were empty; CodeQL default setup is not
configured; Pages endpoint returned 404. Supabase production deployment is OFF,
automatic branching OFF/disabled, branch limit 0, working directory `.`.

The initial push blocker was investigated through authenticated external dashboards.
Vercel account `manh-tus-projects` listed four existing projects: two had no Git
repository, and the two Fable projects referenced other repositories. The uncertain
Fable project's Git settings explicitly named `manhtu0407/Fable-Thread-`, not
NestScout-Enterprise. No NestScout Vercel hosting was created. Expo account `tshine`
listed one existing `home-services` project; GitHub settings offered
`manhtu0407/NestScout-Enterprise` with a Connect button, proving it was unbound.
No connection, build, deployment or unrelated setting was changed.

Feature-push gate: PASS for this branch without an open PR, with the inspected
workflow triggers, no repo webhooks and Supabase production deployment/automatic
branching OFF. No trigger was disabled or bypassed. The final delivery records
the committed SHA and push verification. PR creation, hosted CI, merge, deployment,
billing and production schema changes remain NOT RUN.

P1: main branch protection is absent (API 404), rulesets empty; successful local
checks do not provide server-side enforcement. Hosted platform-object parity is
incomplete and must be resolved before a production migration release.
P2: experimental runtime compatibility; two advisor EXECUTE warnings need focused
review; fresh Claude model/skill/policy behavior remains unverified. No P0 incident
was established. Recommendations are not completed production fixes.

### Changed files in the complete setup

- Agent configuration: `.codex/config.toml`, `.mcp.json`, `.claude/settings.json`.
- Tooling: `package.json`, `package-lock.json`, `scripts/supabase-local.mjs`,
  `scripts/supabase-local.test.mjs`, `scripts/supabase-mcp.mjs`,
  `scripts/supabase-mcp.integration.test.mjs`.
- Local schema/configuration: `supabase/config.toml`, `supabase/supabase.lock`,
  `supabase/.gitignore`, `supabase/database.types.ts`, `supabase/migrations/.gitkeep`,
  `supabase/seed.sql`, `supabase/tests/database/security.test.sql`.
- Documentation/hygiene: `.gitignore`, `docs/development-guide.md`,
  `docs/supabase-development.md`, `docs/operations.md`, `docs/setup-evidence.md`.

Root `AGENTS.md`, reserved original `README.md` and hosted workflow files are
unchanged. Machine trust, OAuth credentials and Claude local approvals are not Git
artifacts. No paid plan, production release or Vercel hosting was provisioned.

## Supabase hardening verification 2026-10-25

Verdict: **ACCEPT WITH CONDITIONS** for continued local development. This is not
approval for a PR, hosted CI, merge or Production deployment. The independent
audit started at `3d0af495b6fcb0855c78606ef207ce0c60baae0f`, with a clean working
tree on `chore/supabase-agent-local-setup`; current main was
`935824e4c07ea7de7012a8f1b0d1b72517f41a44`. Git root, single worktree, HTTPS
fetch/push origins, public repository ID `1432052547` and authenticated owner were
verified. No other agent or unexpected modifications were observed. Results below
cover that HEAD plus this hardening diff; the delivery commit identifies the diff.
Root AGENTS, original README, workflow, dependencies and service pins are unchanged.

### Fixes and verified boundaries

- Local guards now reject both CLI link formats and dotenv variants before every
  CLI invocation, scrub ambient target/Git overrides case-insensitively, normalize
  Docker selector casing, verify the real Git root, and reject host networking or
  missing inspectable database bindings. The existing deterministic stack design
  and CLI 2.122.0/image digests are retained.
- Diagnostics allowlist stable error/exit codes and endpoint fields instead of
  forwarding arbitrary subprocess/upstream errors. Successful CLI text still has
  credential redaction. MCP failures stay failures, with upstream error bodies
  withheld. Synthetic negative cases cover URL, bearer, JSON/env/query secrets and
  unexpected response fields without printing test secrets.
- Async locks record PID/start time and a unique lease; replaced/stale locks are
  preserved for investigation. Tests use isolated temporary directories and cover
  overlap, failure and abrupt process exit. No automatic stale-lock deletion was
  introduced. Stop verifies owner state and actual task containers; repeat stop
  succeeds without touching another stack or deleting data.
- The shared pgTAP catalog query catches column-only view grants, client-readable
  materialized/foreign relations, RPC versus hook EXECUTE paths and unreviewed
  definer search paths. Transactional real catalog fixtures demonstrate negative
  cases and repaired positive cases, then roll back. No product tables or migrations
  were added. This is metadata coverage, not business-role authorization proof.
- Existing development/operations guides explain Windows reinstall ordering,
  migration reconciliation, future role tests, exact owner-only ACL remediation,
  solo-maintainer branch protection and a minimal proposed Linux database CI job.

### Hosted catalog and reconciliation

Read-only connector/native metadata queries and the dashboard agree on project
`axpdymbusiwxfzurfclg`, Seoul `ap-northeast-2`, Free, healthy, PostgreSQL
`17.11.0.003`. Hosted migrations, public relations and ordinary public RPCs remain
zero. Local database image `17.11.0.006` agrees on major/minor, not platform patch.
Empty local reset/history/drift/types establish reproducible **application**
migration consistency; they do not compare complete hosted platform catalogs.

`public.rls_auto_enable()` is PL/pgSQL, returns `event_trigger`, SECURITY DEFINER,
owner `postgres`, `search_path=pg_catalog`, without extension membership. PUBLIC,
anon, authenticated, service_role and postgres have EXECUTE. The enabled
`ensure_rls` ddl_command_end trigger binds it to CREATE TABLE, CREATE TABLE AS and
SELECT INTO. The inspected body resolves table names through catalog OIDs, quotes
identifiers and catches/logs ALTER failures. Client roles have no CREATE on public.

The definition matches the official
[Studio template at 7e866ef](https://github.com/supabase/supabase/blob/7e866ef83e89e35cdda45a6c98abd069d5fa1b2f/apps/studio/components/interfaces/Database/Triggers/EventTriggersList/EventTriggers.constants.ts).
[Project creation source](https://github.com/supabase/supabase/blob/7e866ef83e89e35cdda45a6c98abd069d5fa1b2f/apps/studio/components/interfaces/ProjectCreation/ProjectCreationForm.tsx)
offers it through an optional flag, default false. This establishes template
provenance, not the actual installing actor. Ask the project creator which creation
option/editor operation installed it; do not call it an automatically maintained
extension or import it into migrations without an explicit ownership decision.

Fresh usage UI still shows cycle 25 Sep–25 Oct: organization log ingestion
4.393/1 GB and log query 690.373/100 GB, both UPCOMING with the documented early
2027 grace period. The project-only filter shows about 0.002 GB ingestion, zero
log query and 24.88 MB database size. Other organization quotas are below allowance;
the UI reports no current Free quota excess. This does not attribute other projects'
usage to NestScout. No log scans, upgrades, paid branches or billing changes were
performed; aggregates may lag the cycle reset.

Both anonymous/authenticated Security Advisor warnings remain; Performance Advisor
returned none. PostgreSQL 17's
[PL/pgSQL compiler](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/pl/plpgsql/src/pl_comp.c)
rejects ordinary calls of event-trigger-returning PL/pgSQL functions with 0A000
before executing their body. The
[event trigger contract](https://www.postgresql.org/docs/17/event-trigger-definition.html)
requires trigger context; normal [PostgREST RPC](https://docs.postgrest.org/en/stable/references/api/functions.html)
does not supply it. Thus a directly executable privileged body is not established
by these warnings. Exact hosted HTTP/schema-cache behavior is **NOT RUN**: the
function was never invoked. Excess EXECUTE remains an ACL-hardening finding.
The old local hook exclusion missed that hygiene issue; tests now report hooks
separately. A local PASS still cannot clear hosted warnings.

Dashboard Data API exposes public and graphql_public, reports one exposed function,
no tables, and automatic new-table exposure enabled. These settings were only read.
Future migrations must explicitly enable RLS and review grants; the optional hook
can log a failure without preventing table creation. Avoid its names and rely on
reviewed migrations, not automatic RLS. The minimal proposed ACL change, verification,
compatibility checks and exact-ACL recovery are in
[owner actions](operations.md#supabase-hardening-owner-actions); none was executed.

### Fresh verification matrix

Windows x64, Node 24.19.0, npm 11.17.0, Docker 29.9.2, local desktop-linux pipe,
CLI 2.122.0 and MCP SDK 1.32.2. Commands ran sequentially against the verified
worktree/branch stack `ebb98b437806fcbf5befd634aa49e3c47385672ad6aad011030a0a889b1e0cf2`.
All published service bindings were 127.0.0.1; no hosted reset was attempted.

| Command/check | Fresh outcome |
| --- | --- |
| `npm run identity` | PASS; exact repository, owner and branch |
| `npm ci --ignore-scripts` | PASS after stopping this task stack; initial EPERM was its open supabase.exe on Windows, not bypassed |
| `npm audit --audit-level=low`, `npm run tools:install` | PASS; zero reported vulnerabilities, actionlint/gitleaks checksums verified |
| `npm run db:start`, `npm run db:status` | PASS; pinned Docker stack and isolated loopback endpoints |
| `npm run db:reset`, `npm run db:history` | PASS; empty migration replay/history |
| `npm run db:test` | PASS; 13 actual pgTAP assertions including transactional negative/positive fixtures |
| `npm run db:mcp:test` | PASS; real stdio/HTTP session, six tools, catalog query, denied migration tool and sanitized SQL failure |
| `npm run db:lint`, `npm run db:drift` | PASS; local public lint and strict pg-delta drift |
| `npm run db:types`, `npm run db:types:check`, `npm run typecheck:db` | PASS; normalized generated artifact unchanged |
| `npm run check`, `npm run verify:negative` | PASS; 10 wrapper/config tests, repository checks and invalid/staged-secret fixtures |
| `npm run db:stop` twice | PASS; no task containers running, data retained |
| Product role/isolation tests | NOT RUN; owning application modules are not implemented |
| Hosted Linux Docker job | NOT RUN; proposed, not added/dispatched |
| Production mutations | NOT RUN; metadata inspection only |

### Agent states, independently observed

| Gate | Codex 0.163.0-alpha.11.2 | Claude Code 2.1.310 |
| --- | --- | --- |
| CONFIGURED | Project-scoped read-only hosted endpoint; exact six tools; prompt approvals; local bridge | Same endpoint/scopes; local per-project override; ask and explicit deny rules |
| AUTHENTICATED | ChatGPT model login and existing hosted OAuth | Hosted OAuth works; model auth reports loggedIn=false |
| TRANSPORT VERIFIED | Fresh native app-server and interactive metadata responses | Fresh native `mcp get` Connected for both; OAuth SDK metadata responses |
| TOOL DISCOVERY VERIFIED | Six allowed tools on each native server | Seven upstream hosted tools observed by SDK; query_logs denied by native config, not filtered by SDK |
| MODEL BEHAVIOR VERIFIED | Fresh read-only interactive session returned hosted migrations=[] and local tables=[] | BLOCKED: no model authentication |
| POLICY COMPLIANCE VERIFIED | Root policy/target/reserved files recalled; existing edits preserved; hypothetical Production write refused | BLOCKED: version/default ancestor inspection alone is not runtime proof |
| Supabase skill discovery/use | Fresh interactive session found and read the existing installed plugin entrypoint | BLOCKED: no authenticated model session |

Codex noninteractive `exec` initially refused both MCP calls because prompt approval
was unavailable under policy never. Interactive `--no-daemon --sandbox read-only
--ask-for-approval on-request` then displayed and received a separate one-time
approval for each authorized metadata read; persistent configuration was unchanged.
The bundled CLI's default interactive background-server mode lacked a complete local
package, so its documented no-daemon mode was used. This mode's installed-plugin
skill discovery succeeded; isolated app-server skill inventory alone was empty.
Unrelated pre-existing global MCP/hook warnings were observed, not repaired or
treated as Supabase failures. These representative checks do not prove arbitrary
future model compliance. Claude native denial behavior remains untested by a model;
the SDK probe is only OAuth/transport evidence, not permission-runner evidence.

### Governance and release decisions

Fresh GitHub inspection: main protection absent, rulesets zero, one human admin,
no setup-branch PR, only unrelated Dependabot PRs. Workflow still triggers PRs and
pushes to main only, with existing pins/read permissions; repository webhooks zero.
Supabase production deployment OFF, automatic branching disabled/OFF, branch limit
zero. Expo offers this repo with Connect (unbound); inspected Vercel projects are
unbound or point to Fable repositories. No NestScout Vercel hosting was introduced.
Recheck these gates immediately before the authorized feature push and verify its
remote SHA and absence of Actions runs/checks/deployments afterward.

P1: main has no server-side protection. P2: hosted hook excess EXECUTE, experimental
runtime and unverified Linux Docker compatibility, and incomplete Claude model
verification. P3: exact hook installer remains unknown; global client warnings need
separate scoped investigation if they affect development. No P0 exploit was
established. Local development can continue; the diff is ready for owner PR review.
Hosted CI needs explicit authorization. Merge requires successful approved checks
and governance; Production release needs a separate application/security/release
decision. No PR, hosted CI, merge, deployment or settings change was performed.
