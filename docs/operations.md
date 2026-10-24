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

CI is configured for standard Linux runners, a 10-minute timeout, no scheduled full scans,
no Actions dependency cache, and no uploaded artifacts. Superseded PR runs cancel.
Repository artifact/log retention is seven days. If adding artifacts later, set
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
backup directory outside the repository on a trusted local volume:

```sh
node scripts/backup.mjs C:/Users/YOUR_USER/NestScout-backups/snapshot-YYYYMMDD
```

The script verifies the repository/account, makes a Git bundle of all local refs,
verifies it, clones it into a temporary proof directory inside the backup, and
checks that the restored HEAD commit equals the source HEAD. It also exports
Issues/PR metadata, labels, milestones, releases, and accessible repo settings.
Restricted API exports are recorded as UNVERIFIED, not silently omitted.

Bundle scope is local committed Git objects and refs, not uncommitted files, remote
refs never fetched, Git LFS objects, release binaries, or GitHub database content.
Issue comments and PR reviews/comments are exported separately by the script.
Project views/automation must be captured through its UI when Projects API scope
is unavailable. No credentials or secret values are exported.

To restore to a NEW path, never overwrite the current checkout:

```sh
git clone C:/BACKUP/source.bundle C:/NEW/restore-checkout
git -C C:/NEW/restore-checkout fsck --full
git -C C:/NEW/restore-checkout log -1
```

The restored origin initially points to the bundle. Before any push, set it to
`https://github.com/manhtu0407/NestScout-Enterprise.git`, authenticate, and run the
identity check. Metadata JSON exports are archival records, not an automatic
round-trip restore of GitHub database IDs or settings. Do not republish private data.

Store backup copies outside the checkout and protect the volume. Off-device/encrypted
backup scheduling is not installed. The owner controls retention and destinations.

## Add the application later

Before the first feature, decide the stack in an Issue and record a short architecture
decision: users, platform, runtime/package manager, API/data boundaries, hosting,
environment names, and test/build commands. Then add actual lint/typecheck/unit/build
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
- Resolve the local replay/network blocker and reconcile hosted platform objects
  before using migrations for a release. Review advisor findings and actual RLS,
  Auth, Storage, payment and role tests once those features exist.
- Define database recovery objectives, protected backup retention/destination and
  a disposable restore drill. Database backups do not cover Storage object bytes;
  arrange separate object protection. No production dump or restore was performed.
- Use separately scoped deployment credentials in approved secret stores. Keep
  developer MCP read-only/project-scoped, interactive approvals, and runtime Kael
  permissions separate. Verify MFA, network/TLS settings and incident access.
- Inspect GitHub/Supabase/Expo/Vercel integrations again before publication. Keep
  production auto-deployment off if deployment requires separate owner approval;
  propose reviewed manual CD rather than changing integration settings silently.
- Establish health/error/cost alerts, synthetic smoke checks, release/rollback
  ownership and schema roll-forward/restore procedures. Do not equate a Git revert
  with safe data rollback. Use on-demand preview branches only after approving
  their compute, retention and cleanup costs.
- Reduce unnecessary log generation and broad/repeated log scans locally first.
  The inspected log quotas are upcoming with a grace period through early 2027;
  recheck enforcement and prices before committing a future budget.
