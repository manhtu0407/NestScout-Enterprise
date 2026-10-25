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

Use `feat/`, `fix/`, `docs/`, or `chore/` plus a positive Issue number and lowercase
kebab-case description. Agent task branches may use `codex/<kebab-name>` or
`claude/<kebab-name>`; this does not grant remote-write authority. Keep commits
focused; use `type(scope): outcome` (scope optional), at most 100 characters.
Accepted types are `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`, `build`,
`ci`, and `revert`, with optional `!` for a breaking change. Ordinary Git merge
commits with multiple parents and complete Git revert messages are supported.
Preserve unrelated local work; do not reset or clean another person's changes.

Run `npm run check` and `npm run verify:negative`. Explain any check not applicable
to the change. Add meaningful application tests when the application exists.

## File and review workflow

The root policy defines authority; these are the current checker's input formats.
New files need a real implementation or verification consumer and one responsibility
in the existing module. Do not add a source file merely to split a short function.

| Existing category | Naming accepted by `check:hygiene` |
| --- | --- |
| Node ESM tooling and tests | `scripts/<kebab-name>.mjs`, optional `.test`, `.spec`, `.integration.test`, `.integration.spec` suffix; lowercase kebab directories |
| Tool data | `scripts/<kebab-name>.json` in lowercase kebab directories |
| Technical documentation | `docs/<kebab-name>.md`; dotted technical names such as `claude.architecture.md` remain valid |
| Workflows and Issue Forms | `.github/workflows/<kebab-name>.yml`, `.github/ISSUE_TEMPLATE/<kebab-name>.yml` |
| Supabase migrations | `supabase/migrations/<14-digit-timestamp>_<snake_case_name>.sql` |
| Database tests | `supabase/tests/database/<kebab-name>.test.sql`, optionally in kebab directories |
| Required and generated names | Exact paths in `scripts/check-hygiene.mjs`, including root policy/docs/configs, hooks, `database.types.ts` and `supabase.lock` |
| Legal/contributor records and skills | Exact conventional basenames such as `LICENSE`, `NOTICE`, `AUTHORS`, `CONTRIBUTORS.md`, module `README.md`, and `.agents/skills/<kebab-name>/SKILL.md` or `.claude/skills/<kebab-name>/SKILL.md` |

Case aliases, unknown categories, and document/source basenames beginning with
`todo`, `notes`, `plan`, `report`, `handoff`, `session-summary`, `debug`, or `scratch`
as a complete hyphen/dot-delimited prefix are rejected. Existing required names are
exact exemptions, not folder-wide exclusions. For a genuinely required new framework
filename, generated artifact, fixture format, dependency snapshot or module convention,
review its purpose and add the smallest tested path rule in the same change. There
is no application naming policy until an application/module is approved.

Disposable evidence belongs in ignored task-owned `.cache/` directories or outside
the checkout. Forced staging still fails. Permanent PDF/ZIP input is accepted only
at `docs/artifacts/<kebab-name>.pdf` or `.zip`, registered in the existing
`package.json` under `repositoryHygiene.artifacts`. Each entry needs `path`,
`sha256` (lowercase SHA-256), `purpose`, and `source`; register only actual approved
artifacts. Blobs must fit the checker's 32 MiB read limit; retain larger inputs
outside Git. Both index and working manifests must match their own bytes. Review
licensing, provenance and publication authority; a hash cannot establish them.

`check:hygiene` inspects resolved regular index blobs and tracked/unignored working
files separately, including renamed and force-added files. JavaScript comments are
parsed with Acorn so test strings and regular expressions are not treated as comments.
Other configuration/generated formats receive line-leading comment checks; Markdown
and legal/contributor records receive signature-line checks. Known AI trailers,
promotional signatures, explicit role signatures and AI self-introductions fail.
There is no blanket comment ban or automatic deletion. Reviewers must assess narrative
or redundant comments, arbitrary claims and paraphrases, useful technical comments,
legitimate provenance, actual authorship and authorization. A justified exception
needs a narrow reviewed rule and positive/negative fixtures, not a scanner-disable
comment or an entire excluded directory. Factual human trailers remain accepted.

`check:metadata` checks local commits absent from `origin/main`; fetch that ref before
checking. CI checks every commit in the event's exact range and the current PR title,
body, head branch and target. PR titles use the commit format; bodies need
`Closes #N`, `Fixes #N` or `Resolves #N`. CI-skip directives are rejected. A same-repo
PR from the authenticated `dependabot[bot]` identity may use its generated dependency
branch/title and omit the Issue link; a similarly named human/fork branch cannot.
Commit subjects beginning `Bump` also accept the exact historical Dependabot name
and numeric noreply address in the checker. Git author fields are forgeable; this
format exemption grants no trust, Issue exemption, signature exemption or authority.
The optional pre-push hook only accepts the current feature branch at HEAD with an
identical remote name. It rejects direct `main` pushes, alternate-ref pushes and
deletions; exceptional operations still need the owner's explicit authorization.

## Open and review a PR

- With the required owner authorization, push the feature branch and open a PR to
  `main`; link its Issue with `Closes #N`. Agents must follow the root authorization
  rules, including authorization before any push that triggers hosted CI.
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

PR review and green checks are our operating procedure. This repository is public
by explicit owner approval; inspect current branch protection separately from CI.
Local hooks are optional and bypassable. No approval claim, ownership file, or bot
is a substitute for actual branch protection. The planning Project stays private.
