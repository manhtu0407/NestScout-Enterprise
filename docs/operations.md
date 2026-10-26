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

No product release exists. Use semantic versioning once an application is added:
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
are not assumed available on Free. No production credentials are configured.

## Rollback and hotfix

For a bad squash merge, start a fix branch from current `main`, run
`git revert <bad-merge-sha>`, resolve conflicts, run checks, and submit a PR.
For a merge commit, inspect parents and use `git revert -m 1 <merge-sha>` only after
confirming the parent to retain. Never reset/force-push published `main`.

For a repo-setting change, consult the setup evidence and saved pre-change snapshot;
restore only the affected setting through its settings page/API. A Git revert does
not restore GitHub settings, Projects, Issues, secrets, or external systems.
No deployment rollback exists until a deployment target and runbook are implemented.

For a credential incident, follow [SECURITY](../SECURITY.md): revoke/rotate first.

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

## Add the application later

The intended native React Native/TypeScript/Supabase direction is recorded in the
[architecture decisions](architecture.md): one App, guest discovery, multiple roles
per account, backend authorization, Vietnamese phone + OTP first, and iOS first.
Development/testing use Supabase Local without a Staging Project. Project layout,
SDK, operation permissions and release choices belong to Application Foundation
and the later Deploy phase. They are OUT OF SCOPE for Engineering Foundation V1.
Resolve the applicable decisions before
the first feature. Then add actual lint/typecheck/unit/build
checks, lockfiles, sanitized environment examples, and a reproducible local setup.

Keep credentials in appropriate secret stores; use OIDC only where the selected
provider supports it. Preview/deployment, smoke tests, monitoring/alerts, data backup,
migrations, recovery objectives, and rollback require a concrete service design.
No current repository check proves application readiness or native-device behavior.

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
  before using migrations for a release. Review advisor findings and actual RLS,
  Auth, Storage, payment and role tests once those features exist.
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
