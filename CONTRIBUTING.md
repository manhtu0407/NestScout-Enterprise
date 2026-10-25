# Contributing to NestScout

## Receive and prepare work

Use the bug, feature, or task Issue Form. Describe the problem, intended behavior,
acceptance criteria, and verification. Keep credentials and personal data out of
Issues, screenshots, and logs. Report vulnerabilities using [SECURITY](SECURITY.md).

Use the private Project statuses: Backlog → Ready → In progress → In review → Done.
Priority is P0/P1/P2/P3; Size is XS/S/M/L/XL. P0 means an urgent incident; split XL
work before starting. The owner selects Ready work and resolves product decisions.
Assign work when starting; Ready requires testable acceptance criteria.

## Develop a change

Run the setup commands in the [development guide](docs/development-guide.md).
The root [AGENTS.md](AGENTS.md) is the sole repository-wide engineering policy for
Codex and Claude Code. This document provides human contribution procedures.
Never commit environment secrets, signing files, build output, or dependency folders.
When a stack is selected, add a sanitized `.env.example` containing names and dummy
values only, plus actual setup/build/test commands and supported runtime versions.

```sh
npm run identity
git switch main
git pull --ff-only origin main
git switch -c feat/123-short-description
```

Use that switch/pull sequence only from a clean, coordinated checkout. With pending
or concurrent work, fetch and create a separate task worktree from `origin/main`.
For coding agents, the root policy's operation-specific authorization still applies
to PRs, hosted CI, merges and releases in the human workflow below.

Use `feat/`, `fix/`, `docs/`, or `chore/` plus the Issue number. Keep commits focused;
titles should explain the outcome, for example `chore: add repository checks`.
Preserve unrelated local work; do not reset or clean another person's changes.

Run `npm run check` and `npm run verify:negative`. Explain any check not applicable
to the change. Add meaningful application tests when the application exists.

## Open and review a PR

- Push the feature branch and open a PR to `main`; link its Issue with `Closes #N`.
- Include the concrete problem, resulting behavior, verification, and rollback.
- Review the exact latest SHA and all changed files; inspect permissions and secrets
  whenever workflow/security configuration changes.
- AI comments are suggestions, not independent human approval or proof of correctness.
- The owner chooses squash merge after reviewing the evidence; auto-merge is off.
- After merge, confirm the `main` run, close linked work, and remove the merged branch.

Issue Forms, PR templates, and Dependabot configuration take effect from the default
branch; during bootstrap, their source is reviewed and checked on the setup PR.

## Conflicts and hotfixes

Fetch `origin/main`, then merge it into the feature branch. Resolve each conflict
according to intended behavior, inspect the combined diff, rerun checks, and push.
Abort an uncertain merge using `git merge --abort`; do not use a destructive reset.
Avoid rebasing shared branches or force-pushing `main`.

For urgent fixes, create `fix/<issue>-hotfix` from current `main`, reproduce the
incident, make the smallest repair, test it, and use the same PR review procedure.
Record impact and follow-up prevention in the Issue.

## Collaboration

Keep discussion respectful, factual, and focused on the work. Explain disagreement
with evidence; do not post private information or harass contributors. The owner
handles collaboration concerns privately via the contact route in SECURITY.

## Free-plan boundary

This public repository has an enforced classic protection rule for `main`, including
required checks. The [operations guide](docs/operations.md#supabase-hardening-owner-actions)
records its configuration and verification procedure. Zero required approving reviews
accommodates the single maintainer; the owner still reviews and authorizes merges.
Local hooks remain optional and bypassable. The planning Project stays private.
