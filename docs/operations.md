# Operations and recovery

## Work tracking and maintenance

Use the private [Delivery project](https://github.com/users/manhtu0407/projects/3).
Keep Issues scoped, assign an owner, and record acceptance criteria. Use Backlog,
Ready, In progress, In review, Done. Closing an Issue completes it; reopening sends
it to Ready. Adding items sets Backlog. Linked PR reviews and merges must still be
checked by the owner. Do not close work merely because CI passed.

At each milestone/release, review open bugs, dependency alerts/PRs, stale branches,
workflow pins, tool versions/checksums, quota, and access. Re-run the repository
checks after any tool update. Remove obsolete integrations only with authorization.
No scheduled maintenance agent or paid automation is installed.

## Cost controls

The owner's existing account-wide Actions budget was observed at $0 with usage
blocking enabled during setup; account billing was not changed. The owner subsequently
approved making this repository public so standard GitHub-hosted runners can run
without consuming private-repository minutes. Larger runners remain paid and are
not configured. The planning Project stays private. Re-check billing before adding
other metered services; a limit is not permission to buy usage or switch runners.

CI uses standard Linux runners, a 10-minute repository job and 20-minute local
database job, no scheduled full scans,
no Actions dependency cache, and no uploaded artifacts. Superseded PR runs cancel.
Seven-day repository artifact/log retention was observed during setup; recheck the
live setting before relying on it. If adding artifacts later, set
`retention-days: 7` explicitly and avoid sensitive content. Add Actions to the
allowlist only after reviewing and SHA-pinning them. GitHub also permits owner-owned
Actions under its selected-Actions policy; retain code review of all workflow changes.
The initial private bootstrap run was blocked by the account spending limit before
a runner started. The owner-approved public transition and rerun evidence are recorded
in setup evidence. Do not treat local checks as a successful hosted CI run.

GitHub's included limits can change: consult
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Do not change account-wide budgets or payment methods as part of repo maintenance.

## Version and release procedure

No iOS store release is evidenced. The mobile app now contains Customer/Worker,
service-intake and Kael session flows. `apps/mobile/eas.json` configures TestFlight
and App Store build/submit profiles, but no build, upload or device run is evidenced
here. Use semantic versioning once an application is released:
MAJOR for incompatible public changes, MINOR for compatible capability, PATCH for fixes.
Do not create tags or releases to imply an application is ready today.

For a real release:

1. Confirm approved scope, exact merged source SHA, clean checkout, and passing CI.
2. Run the application's actual build/tests and record device/runtime evidence where needed.
3. Prepare changelog entries: Added, Changed, Fixed, Security; include migration notes.
4. Create a draft release against that exact commit, with the intended `vX.Y.Z` tag.
5. Attach only verified artifacts and their SHA-256 hashes, if applicable.
6. Owner approves publication separately; verify the published tag/commit and artifacts.

Packages, containers, SBOMs, artifact signing, and deploy workflows wait for an actual
artifact/hosting choice. Native private attestations and protected deployment approvals
are not assumed available on Free. No server credentials are stored in this repository;
provider credentials belong only in Supabase Edge Function secrets.

## Rollback and hotfix

For a bad squash merge, start a fix branch from current `main`, run
`git revert <bad-merge-sha>`, resolve conflicts, run checks, and submit a PR.
For a merge commit, inspect parents and use `git revert -m 1 <merge-sha>` only after
confirming the parent to retain. Never reset/force-push published `main`.

For a repo-setting change, consult the setup evidence and saved pre-change snapshot;
restore only the affected setting through its settings page/API. A Git revert does
not restore GitHub settings, Projects, Issues, secrets, or external systems.
No TestFlight release or app rollback drill has been performed. EAS configuration
does not establish a published binary or a rollback path; database and Storage
recovery also need their own approved objectives and restore evidence.

For a credential incident, follow [SECURITY](../SECURITY.md): revoke/rotate first.

## Kael durable runtime rollback and recovery

The durable service ([design](../services/kael-core/README.md#durable-runtime)) is
reached only while the Edge secret `KAEL_DURABLE_URL` is set. To roll back, remove
that secret from the Supabase Edge Function secrets and redeploy nothing else. The
gateway stops proxying at the next invocation and new turns run on the legacy
runtime. Runs already admitted by the durable service finish if the service is still
up; otherwise the database sweep marks them interrupted once their lease has been
expired for 30 minutes. Applied migrations stay in place: the lease columns are
unused by legacy runs. Re-enable by setting the secret again.

To recover a stopped instance, start any instance with the same
`KAEL_DURABLE_DATA_DIR` volume and a database that is reachable. Its reconciler
takes over runs whose lease expired within seconds, and a client that retries its
`request_id` reattaches. If the volume is lost, the affected runs are closed as
`interrupted`, conversations and approvals are untouched, and the user sends the
message again. Never run two instances against the same volume with the same
`KAEL_DURABLE_HOLDER`. Instances that share a database must share the volume: an
instance with a different volume that claims an expired run finds no journal and
closes the run as `interrupted`, and it marks another volume's purge-pending runs as
purged without deleting their files. An instance that does not own a run's lease
streams a reconnecting client from the shared event file, read-only; the owner is
never interrupted. See the service README.

Hosted deployment of the service, its persistent volume and the secret are owner
actions. No hosted rollback or recovery drill has been run; the evidence is local
(see the service README).

## Kael hosted release contract

One hosted backend, Supabase project `axpdymbusiwxfzurfclg`, serves Hosted
Preview, TestFlight and the App Store. Clients differ only in build target
(`kael-hosted-preview`, `testflight`, `app-store`) and publish no AI
credential. DeepSeek and Anthropic credentials live only as Supabase Edge
Function secrets.

A read-only observation on 2026-11-11 found the project `ACTIVE_HEALTHY`, the
`add_kael_provider_probe_window` migration applied at hosted version
`20261111074958`, and the `kael` Edge Function `ACTIVE` at version 20 with JWT
verification enabled. This records deployed state; it does not establish a hosted
tester session, a native build or a TestFlight/App Store release.

Release order, each step authorized by the owner:

1. Merge to `main` after hosted CI passes.
2. Apply migrations that exist in the repository but not in the hosted history.
   Compare names with `list_migrations`; hosted versions are apply times, so
   compare names, not version numbers. The three pilot migrations
   (`kael_developer_pilot_budget`, `kael_pilot_reauthorization`,
   `configure_kael_pilot_request_limit`) are local-pilot scoped; do not apply
   them to production without a separate decision. The current hosted history
   includes `add_kael_provider_probe_window` (additive: one private table and
   `kael_claim_provider_probe`). Check by migration name before applying it to any
   other environment; apply the migration before deploying a function version that
   requires it. A function deployed first reports `claim_unavailable` rather than
   probing.
3. Deploy the `kael` function from the merged commit. The deployed version is
   reported as `deployment` in readiness and in every `kael_run` log line.
4. Verify with a real account: `GET /functions/v1/kael` with header
   `x-kael-readiness: providers` runs one live call per configured provider,
   cached for 60 seconds, and reports status, HTTP status and latency. One
   database window (`kael_claim_provider_probe`) allows a single live probe
   across all Edge instances every 60 seconds; other callers receive
   `provider_probe: "throttled"` with configuration-only readiness, so probe
   spend is bounded without limiting authenticated chat. A failed or missing
   claim reports `claim_unavailable` and also runs no probe; only a
   per-provider result object reflects actual provider health. The header value `1`
   stays configuration-only.
5. Build iOS with `eas build --profile testflight` or `--profile app-store`.

Failure causes are structured: `kael_provider_failure` (kind, HTTP status,
whether fallback ran), `kael_provider_terminal` (latency), `kael_run`
(status, latency, deployment). Client errors are the HTTP 4xx codes in the
JSON `error.code`; provider and backend causes appear only in these logs.

Rollback: redeploy the previous function source from the prior commit; the
migrations are additive, so the older function keeps working. Revert the
client by shipping the previous build. Availability is a target, not a
guarantee: both providers can be unavailable at once.

## Dispatch recovery and worker handover rollout

This section is a prepared plan. Nothing in it has been applied to the hosted
project, and each step needs the owner's authorization.

A read-only observation on 2026-11-13 found the hosted history ending at
`add_dispatch_outcome_and_recovery` (hosted version `20261112122848`), so two
repository migrations are pending, in this order: `add_dispatch_recovery_and_budgets`
(`20261112080000`) and `add_job_release_and_worker_capacity` (`20261113090000`).
`pg_cron` is available in the project but not installed.

1. Merge to `main` after hosted CI passes.
2. Before applying, confirm the history by name with `list_migrations` and that no
   request is mid-flight that the owner cares about; both migrations run in one
   transaction each and take short table locks.
3. Apply `add_dispatch_recovery_and_budgets`, then
   `add_job_release_and_worker_capacity`, then `add_stage_based_job_recovery`, then
   `add_escalation_handling`, then `add_beta_operator_and_review_recovery`. The
   second drops and recreates `get_dispatch_summary`, `dispatch_summary` and
   `dispatch_state` with two more columns (`can_reassign`, `reassign_at`) and the
   third recreates them again with four more (`job_stage`, `can_escalate`,
   `escalate_at`, `escalated_at`) and the fourth with two more
   (`escalation_status`, `escalation_resolution`); an older client ignores columns it does not
   read, and the older `kael` function keeps its explicit column list. The third
   also drops `auto_dispatch_settings.reassign_idle_minutes` in favour of four
   stage timers, adds `service_job_escalations` and the `job_escalated`
   notification kind, and widens `service_job_releases`. The fourth adds the case
   status columns, the operator queue, review and resolve functions, the
   `operator` release role and the `escalation_received` and `escalation_resolved`
   notification kinds, and narrows participants' column access on
   `service_job_escalations`. The fifth adds `operator_grants` and its event log,
   replaces the fixture operator check on the escalation functions with the grant
   check, adds `operator_access`, the review timeout setting, takeover and review
   history, and recreates `operator_escalation_queue` with three more columns and
   `dispatch_state` so that a stale review reads as open. None of them is applied to the
   hosted project by any task in this repository; apply them only on the owner's
   instruction, after the mobile client that reads the new columns is built.
4. Install `pg_cron` from the dashboard (an owner action that changes the project's
   extensions), then run `select nestscout_private.schedule_dispatch_sweeper();`
   as the database owner. It returns `scheduled` and registers one job named
   `nestscout-dispatch-sweeper` that runs every minute. Without `pg_cron` the
   migration reports `pg_cron not installed`, lapsed offers are still shown as
   `recovering` and refused, and nothing closes them until the sweeper runs. Check
   with `select jobname, schedule, active from cron.job` and
   `select status, start_time from cron.job_run_details order by start_time desc limit 5`.
5. Redeploy the `kael` function from the merged commit, since the Phase 2 and 3
   sources changed the dispatch read and the approval-gated retry and cancel. If the
   owner runs the Rust durable service, deploy it from the same commit.
6. Leave `auto_dispatch_settings.enabled` false. Automatic quotes and invitations
   remain off until the owner decides on a commercial pricing and dispatch policy;
   the defaults for the new limits are `max_active_jobs_per_worker` 3,
   `visit_conflict_minutes` 120, `assigned_response_minutes` 120,
   `visit_grace_minutes` 30, `en_route_arrival_minutes` 120 and
   `arrival_escalation_minutes` 60. They are global, not per service or region.
7. Verify with real accounts: a customer sees `recovering` for a lapsed offer within
   a minute of the sweeper running, a worker in `assigned` or `en_route` can release
   and the customer is notified, a customer can replace an unreachable worker only
   after the stage window, a customer whose worker arrived but never started can
   report an incident after the arrival window and the worker is notified without
   losing the job, and a worker at the cap is refused. `get_advisors` must show no
   new security finding. Escalations are handled by beta operators. No account holds the role after the
   migration. The owner grants it from the SQL editor, for example
   `select nestscout_private.grant_beta_operator('<user id>', '<authorization reference>', 30);`
   (at most 90 days, a signed-in non-anonymous account) and removes it with
   `select nestscout_private.revoke_beta_operator('<user id>', '<reference>');`.
   Check holders with `select user_id, reference, expires_at, revoked_at from nestscout_private.operator_grants`
   and the audit trail in `nestscout_private.operator_grant_events`. Decide
   `review_timeout_minutes` (default 30) and who is on call; there is no
   assignment, service level or paging beyond the in-app notification.

Rollback: unschedule the sweeper with `select cron.unschedule('nestscout-dispatch-sweeper')`.
The migrations are additive apart from the recreated summary functions. A release moves
its job rows to `service_job_releases`, which a code rollback does not undo, so those
handovers stay archived and the customer's request keeps its new search. Revert the
client by shipping the previous build.

## Git and metadata backup

Run from a clean checkout after `git fetch origin --prune`. Use an absolute, new
backup directory outside every linked worktree and the common Git directory on a
trusted local volume:

```sh
node scripts/backup.mjs C:/Users/YOUR_USER/NestScout-backups/snapshot-YYYYMMDD
```

The script verifies the repository/account, makes a Git bundle of all local refs,
verifies it, mirror-clones it into `restore-proof.git` inside the backup, runs
`git fsck --full`, and compares HEAD and every local ref name/object ID. It rejects
ref movement during the drill; coordinate other tasks before retrying. It also exports
Issues/PR metadata, labels, milestones, releases, and accessible repo settings.
Classic protection for each protected branch is exported separately from rulesets.
Restricted API exports are recorded as UNVERIFIED, not silently omitted.

Bundle scope is local committed Git objects and refs, not uncommitted files, remote
refs never fetched, Git LFS objects, release binaries, or GitHub database content.
Issue comments and PR reviews/comments are exported separately by the script.
Project views/automation require a separate authorized export. Credential/secret
endpoints and local agent credentials are never requested. Git history and free-form
Issue/PR content may nevertheless contain sensitive text: keep archives private,
review scanner results and follow SECURITY for any exposure. GitHub settings exports
are snapshots, not proof that they can all be restored through the same APIs.

To restore to a NEW path, never overwrite the current checkout:

```sh
git clone --mirror C:/BACKUP/source.bundle C:/NEW/restore.git
git -C C:/NEW/restore.git fsck --full
git -C C:/NEW/restore.git for-each-ref --format="%(refname) %(objectname)"
git clone C:/NEW/restore.git C:/NEW/restore-checkout
git -C C:/NEW/restore-checkout fsck --full
git -C C:/NEW/restore-checkout log -1
```

The restored origin initially points to the local archive/mirror. Before any push, set it to
`https://github.com/manhtu0407/NestScout-Enterprise.git`, authenticate, and run the
identity check. Metadata JSON exports are archival records, not an automatic
round-trip restore of GitHub database IDs or settings. Do not republish private data.
Compare the mirror's refs and HEAD with `sourceRefs`/`sourceHead` in the manifest;
a normal checkout clone alone renames branch refs and is not an exact ref proof.
Backups exclude reflog-only/unreachable objects, ignored local files, dependency
caches, agent authentication, repository secret values, account recovery material,
Supabase data/Storage and native signing assets. Recover those through their owners.

Store backup copies outside the checkout and protect the volume. Off-device/encrypted
backup scheduling is not installed. The owner controls retention and destinations.
Until a retention/destination decision exists, local snapshots are a recovery drill,
not an off-device disaster recovery guarantee. The repository owner owns restore
decisions and access; designate a second custodian before relying on team recovery.

## Application stack and delivery state

The selected stack and current application are recorded in the
[architecture decisions](architecture.md) and [mobile guide](mobile-application.md):
Expo/React Native, TypeScript, a Node 24/npm workspace, Supabase Auth/Postgres/RLS/
Storage/RPC/Edge Functions, and iOS-first TestFlight/App Store targets. The first customer
slice includes service-request intake across the catalog; it does not claim a
confirmed worker, price, schedule or payment.

Use `apps/mobile/.env.example` for local public Supabase settings; it contains no
server secrets. Reproduce setup with `npm ci --ignore-scripts`, `npm run tools:install`,
`npm run check`, `npm run verify:negative` and `npm run verify:mobile-sdk`. CI runs
repository checks and isolated Supabase local verification for PR/main events. It
does not run an iOS build or verify a live Auth user.

The connected Supabase project has applied migrations and a deployed Kael Edge
Function, but there is no Staging Project. The EAS TestFlight and App Store profiles
target the hosted project and have not been built or uploaded. Keep local validation on the
isolated stack; never treat hosted state or a profile as a preview test or release.

Keep credentials in approved secret stores. The project still needs owner decisions
for database and Storage backup retention and restore objectives, health/error/cost
alert ownership and thresholds, and a native release/rollback drill. No new provider,
environment, deployment automation or architecture is selected here.

## Supabase Pro readiness

Preparation only; no upgrade, billing, branch, addon or production change is
authorized by this checklist. See [Supabase development](supabase-development.md)
and the dated [setup evidence](setup-evidence.md#supabase-agent-setup-2026-10-24).

- Review organization-wide usage and billing cycle, including other projects.
  Pro starts at $25/month with $10 compute credits; extra projects, compute,
  overages and preview branches can increase the total. Agree a monthly ceiling,
  owner and alert thresholds before upgrading; validate the current
  [pricing calculator](https://supabase.com/pricing) and
  [branching charges](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
- Preserve the verified managed-stack loopback checks and reconcile hosted platform objects
  before using migrations for a release. Review current RLS, Auth, Storage, worker,
  service and Kael tests against the real implementation; local fixtures do not
  establish hosted user behavior or payment settlement.
- Define database recovery objectives, protected backup retention/destination and
  a disposable restore drill. Database backups do not cover Storage object bytes;
  arrange separate object protection. No production dump or restore was performed.
- Use separately scoped deployment credentials in approved secret stores. Keep
  developer MCP read-only/project-scoped, interactive approvals, and runtime Kael
  permissions separate. Verify MFA, network/TLS settings and incident access.
- Inspect GitHub/Supabase/Expo integrations again before publication. The owner
  selected native App development without Vercel hosting; no Vercel project is
  bound to this repository in the inspected account. Keep
  production auto-deployment off if deployment requires separate owner approval;
  propose reviewed manual CD rather than changing integration settings silently.
- Establish health/error/cost alerts, synthetic smoke checks, release/rollback
  ownership and schema roll-forward/restore procedures. Do not equate a Git revert
  with safe data rollback. Use on-demand preview branches only after approving
  their compute, retention and cleanup costs.
- Reduce unnecessary log generation and broad/repeated log scans locally first.
  The inspected log quotas are upcoming with a grace period through early 2027;
  recheck enforcement and prices before committing a future budget.

## GitHub protection and local database CI

The owner subsequently authorized main protection and PR-triggered Linux CI on
2026-10-25. One classic rule now protects `main`; no ruleset was added. Both
`Repository checks` and `Supabase local verification` are required from GitHub
Actions (app 15368), with strict/up-to-date checks and administrator enforcement.
The latter was promoted only after successful hosted run
[40147775647](https://github.com/manhtu0407/NestScout-Enterprise/actions/runs/40147775647).
There is still one human maintainer, zero required approving reviews, no bypass
allowances, and auto-merge is disabled. Maintain this single rule using the settings
below; changing protection later requires explicit owner authorization:

1. Require a pull request before merging; keep required approving reviews at
   **zero/off** while there is only one maintainer. Do not require CODEOWNERS or
   last-push approval that the owner cannot independently satisfy.
2. Require both named status checks from GitHub Actions and require branches to
   be up to date. Enable conversation resolution.
3. Enable “Do not allow bypassing the above settings,” including administrators;
   leave force pushes and branch deletion disallowed. Use manual owner review and
   merge authorization; zero required reviews does not mean automatic approval.
4. Verify the saved rule with read-only API/UI inspection. Do not test enforcement
   by pushing to `main`. Add a required database job only after its approved first
   successful run; requiring an absent check would block every merge.

CI retains offline wrapper/configuration/image-pin regressions through `npm run
check`, dependency/tool integrity and negative tests. The implemented `Supabase
local verification` job uses standard `ubuntu-24.04`, Node 24, existing SHA-pinned
checkout/setup Actions, `contents: read`, a 20-minute timeout, locked dependencies,
no hosted credentials, and these sequential commands:

```sh
npm ci --ignore-scripts
npm run db:start
npm run db:status
npm run db:reset
npm run db:history
npm run db:test
npm run db:mcp:test
npm run db:lint
npm run db:drift
npm run db:types:check
npm run typecheck:db
```

Cleanup uses `always()` whenever startup was attempted, including a failed start,
and runs `npm run db:stop` without hiding prior failures. The checkout's actual
verification revision gets the local branch `ci-supabase`, preserving PR merge
revision coverage while satisfying managed-stack identity. PR/main triggers,
concurrency controls and the existing job are unchanged. Standard public
Linux runners have 4 CPUs, 16 GB RAM and 14 GB SSD and are free under current
[GitHub runner terms](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
The first complete hosted database job took 82 seconds, including cold startup
and cleanup. This demonstrates fit on that runner image, not a guarantee against
future image changes or download failures. No cache or artifact upload is configured.
Keep the account's $0 Actions budget; do not use paid larger runners, native fallback
or hosted Supabase credentials to make checks pass. A hard cancellation/runner loss
can prevent in-job cleanup; the hosted VM is disposable and no cloud DB is created.

## Hosted RLS hook ACL proposal

For the hosted `public.rls_auto_enable()` ACL finding, the minimal proposed change
is to retain the definition, owner and event trigger while revoking client access:

```sql
begin;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
commit;
```

**Do not execute without explicit Production approval.** First retain its current
definition, owner, trigger binding and ACL metadata privately and confirm the
installing mechanism with the project creator. Confirm the effective privileges
and Advisor results afterward, without invoking the hosted function. Keep owner
and `service_role` grants; validate hook behavior with disposable local/staging
DDL only. If necessary, restore the exact prior ACL: the inspected snapshot had
EXECUTE granted to PUBLIC, anon and authenticated. No function/trigger drop or
SECURITY INVOKER conversion is proposed. This reduces excess privileges; it does
not imply that the original event-trigger function was an exploitable RPC.

## Google and Apple sign-in

Phone OTP stays the primary method. Google and Apple use Supabase Auth on the
hosted project `axpdymbusiwxfzurfclg`; no credential belongs in the repository,
the app bundle or a log.

- Google: one Web OAuth client in Google Auth Platform. Its authorized redirect
  URI is `https://axpdymbusiwxfzurfclg.supabase.co/auth/v1/callback`. The client
  ID and secret are entered only in Supabase Auth Providers. The secret cannot be
  read back from Google; to rotate it, add a second secret in Google, update
  Supabase, then disable the old one.
- Apple, native iOS: the App ID `com.phanmanhtu.nestscout.horizon` has Sign In
  with Apple enabled and Supabase lists that bundle ID as a client ID. The app
  sends Apple's identity token with a hashed nonce through `signInWithIdToken`.
  No secret key is needed for this path.
- Apple, web: needs a Services ID with the Supabase domain and callback, plus a
  JWT secret signed from a Sign in with Apple key. Apple limits that secret to six
  months, so regenerate it and update Supabase before it expires, or web sign-in
  stops while native sign-in continues.
- Redirect allow list in Supabase URL Configuration: `nestscout://auth/callback`
  for native and `http://localhost:8085/**` for the local web preview. Remove the
  localhost entry before any public web release.
- Identity linking: Supabase links OAuth identities only by a verified email.
  Phone users have no email, so a Google or Apple sign-in creates a separate
  account and never merges by name or unverified email. Adding a provider to an
  existing phone account needs manual linking while signed in, which is not
  enabled in the app.
