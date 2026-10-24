# GitHub foundation setup evidence

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

## GitHub Actions: BLOCKED BY ACCOUNT LIMIT

The [initial PR run](https://github.com/manhtu0407/NestScout-Enterprise/actions/runs/40086896998)
failed before any step or runner started. GitHub's check annotation says:

> The job was not started because recent account payments have failed or your spending limit needs to be increased.

This is the provider's generic billing/spending-limit message, not proof of failed
payment specifically. The existing $0 Actions budget remains unchanged. Do not raise
it, buy minutes, or move to paid runners. Live Linux workflow/hook execution remains
UNVERIFIED until the account has usable included capacity. Local checks are not a
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
- GitHub Free private branch protection/native Code scanning/Secret Protection:
  BLOCKED BY FREE PLAN. No claim of mandatory server-side enforcement is made.
