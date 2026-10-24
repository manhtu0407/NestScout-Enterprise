# GitHub foundation setup evidence

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
`935824e4c07ea7de7012a8f1b0d1b72517f41a44` plus the Supabase setup changes on
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
| `npm run db:status` | PASS; reports verified DB-only target and MCP NOT AVAILABLE |
| `npm run db:start`, `db:reset`, `db:drift` | BLOCKED by actual loopback probe before credentialed CLI startup/recreation |
| Local migration replay from reset | BLOCKED; startup initialized an empty schema, not a reset replay proof |
| Customer/Worker/Admin/payment/Kael RLS scenarios | NOT IMPLEMENTED; no owning schema/endpoints; no invented business fixtures |
| Full-stack/local MCP handshake | BLOCKED; full stack stopped after public binding was observed |

The initial CLI start initialized its disposable schema but published all host
interfaces despite the documented network option. Task containers and the shadow
attempt were stopped; an inert Docker probe independently reproduced the runtime
issue. A temporary DB-only container reused this task's initialized volume with
explicit loopback publishing for the successful SQL/types checks. No other stack
or global Docker setting was changed. Generated types are the only schema artifact;
there are no fabricated application migrations or seed data.
After verification, `npm run db:stop` passed and Docker listed no task-owned
containers. The disposable DB volume was retained; unrelated stacks were untouched.

### Agent capabilities and publication gates

| Client | Verified capability | Remaining gap |
| --- | --- | --- |
| This Codex session | Supabase/GitHub connectors authenticated; harmless project/catalog queries demonstrated; official Supabase skill entrypoints read | Connector is broad, not enforced read-only/project-scoped |
| Standalone Codex CLI 0.163.0-alpha.10.2 | MCP inventory inspected; project config prepared | Project config not loaded in untrusted checkout; OAuth/tools/query NOT RUN |
| Claude Code | Project `.mcp.json` prepared; no global config changed | Executable NOT AVAILABLE in inspected paths; skills/auth/discovery/query NOT RUN |
| Local MCP | Disabled config candidate; no tokens | No running API/MCP; handshake NOT RUN |

Hosted MCP endpoint returned HTTP 401 without credentials, proving reachability
only. No OAuth grant or personal access token was created. Existing plugin skills
were reused rather than copied; see provenance in the development guide.

Repository workflow runs on `pull_request` and pushes to `main`; no workflow was
edited or dispatched. No open PR references the setup branch. Repo webhooks,
deployment records and environments were empty; CodeQL default setup is not
configured; Pages endpoint returned 404. Supabase production deployment is OFF,
automatic branching OFF/disabled, branch limit 0, working directory `.`.

**PUSH BLOCKED:** repository Installed GitHub Apps also lists Expo, Vercel, Claude,
Sentry, Supabase and ChatGPT Codex Connector. Expo/Vercel external build/deployment
bindings and push-trigger settings were not verified. Empty GitHub deployment
records do not prove they cannot run. No push or PR was attempted. All changes are
committed locally; the final delivery gives the commit SHA. No hosted CI, merge,
deploy, billing, security-control change or production write was performed.

P1: safe full-stack replay remains blocked; external push automation cannot be
ruled out; main branch protection is absent (API 404), rulesets empty.
P2: dedicated per-client MCP authentication/trust and hosted platform-object
reconciliation remain open; advisor EXECUTE warnings need focused review.
No P0 incident was established. Remediation proposals are not completed fixes.
