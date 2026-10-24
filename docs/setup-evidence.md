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

| Setting | Before | Intended after |
| --- | --- | --- |
| Merge methods | merge/rebase/squash allowed | squash only |
| Auto-merge | false | false |
| Delete merged branches | false | true |
| Actions | enabled; all Actions allowed | enabled; only approved SHA-pinned Actions |
| SHA pinning policy | false | true if endpoint supported |
| Default workflow token | read; cannot approve PRs | same |
| Log/artifact retention | observe before changing | 7 days |
| Dependency graph/alerts/updates | alerts disabled | enabled where supported |
| Rulesets/branch protection | API 403, upgrade required | BLOCKED BY FREE PLAN |

Settings are outside Git: revert the associated setting using the pre-change snapshot,
not only a Git revert. Final results and evidence links are recorded below after checks.

## Implementation verification

- Owner follow-up: reserved `AGENTS.md`/`README.md` names require separate permission.
  AI instructions moved to `docs/ai-working-guide.md`; development content moved to
  `docs/development-guide.md`. Original README restored to its initial Git blob.
  `npm run check:reserved` checks both the working copy and index; it rejects newly
  introduced reserved filenames. Markdown lint excludes only the untouched original.

IN PROGRESS. Do not interpret the initial coverage register as final acceptance.
