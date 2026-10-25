# NestScout development guide

Persistency on the tenth times...!

Public, new NestScout repository. The Delivery Project remains private. This repository contains development
workflow and security tooling. The intended product direction is native React Native,
TypeScript and Supabase, without Vercel; no product application is implemented.

## Repository identity

- Owner/repository: `manhtu0407/NestScout-Enterprise`
- GitHub repository ID: `1432052547`
- Default branch: `main`
- Visibility and plan: public, GitHub Free (explicitly approved by the owner)

Run `npm run identity` before remote writes. It verifies both origin URLs,
repository ID, visibility, default branch, authenticated account, and admin access.
Always pass `--repo manhtu0407/NestScout-Enterprise` to GitHub CLI write commands.

## Start here

Requirements: Git, GitHub CLI authenticated as `manhtu0407`, Node.js 24 LTS,
npm, and `tar`. Pinned native tools support Windows/Linux x64.

```sh
git clone https://github.com/manhtu0407/NestScout-Enterprise.git
cd NestScout-Enterprise
npm ci --ignore-scripts
npm run identity
npm run tools:install
npm run check
npm run verify:negative
```

Node/npm are repository tooling, not a choice of application stack. There is no
application server, application build, product typecheck, or product unit suite yet.
Tooling unit tests, database artifact typechecking and disposable local SQL checks
do exist; use the commands in `package.json`. Tool downloads
are version-pinned and SHA-256 checked; dependency installation uses the lockfile.

Optional local hooks (affect only this checkout):

```sh
git config --local core.hooksPath .githooks
```

Hooks can be bypassed and are not server-side protection. Secret checks cover Git
history plus tracked/unignored working files. Keep local secrets in ignored files.

## Test artifact lifecycle

Use these categories when implementing the root policy with Codex or Claude Code:

- **EPHEMERAL:** one-off investigation, exploratory tests, diagnostics, scratch
  fixtures, logs and generated outputs. Use a unique task directory created with
  `mkdtemp` under `.cache/agent-tests/`, or an owned OS temporary directory when
  the existing runner supports it. These are disposable and never Git assets.
- **PERSISTENT:** reviewed unit, integration, security, regression and contract
  tests with lasting assertions. Follow the owning module's existing conventions;
  current examples are `scripts/*.test.mjs` and `supabase/tests/database/*.sql`.
  Keep their sanitized fixtures and relevant local/CI verification versioned.

Use the existing runner (for example `node --test`), capture its actual exit status
and signal, and use `try/finally` to clean only the unique directory created by
that operation. Before recursive removal, verify its resolved absolute parent
and reject a replaced symlink/junction. Do not sweep `.cache/agent-tests/`, the OS
temp root, stale directories or another agent's files. `scripts/verify-negative.mjs`
contains an executable example covering success, failure and isolated cleanup.

Report failure even when cleanup succeeds. When investigation needs retained
evidence, keep only reviewed, sanitized diagnostics in a separately owned ignored
directory, with command/revision and exit/signal metadata. Do not copy raw subprocess
output or credentials into evidence. Remove that evidence when the investigation
no longer needs it; cleanup is not a reason to change a failing status to PASS.

Evaluate every important regression found by an ephemeral probe for promotion:
extract the smallest deterministic assertion that fails before the fix, remove
private data and experimental scaffolding, and add it to the existing owning test
suite and its verification command. A one-off probe passing does not replace that
lasting coverage. This task does not change the root engineering policy.

The existing ignore rules exclude caches, coverage and logs from normal staging.
`npm run scan:secrets` now also checks the entire Git index for the designated
root `.cache/` and `coverage/` paths, case-insensitively, even after `git add -f`
or when the working file was removed. Staged deletion is allowed. This same guard
runs through the existing optional pre-commit hook, `npm run check`, pre-push hook
and repository CI; no new hook setup or workflow is required. It does not classify
intent outside these paths or reject legitimate test/spec filenames, nested
fixture paths or application code. Review misplaced exploratory code before staging.
No global test/spec or permanent-test-directory ignore is introduced.

## Work and delivery

Supabase local tooling and agent connection setup are documented in
[Supabase development](supabase-development.md). This does not select a product
application stack or authorize hosted operations.

1. Create an Issue with acceptance criteria; prioritize it in the private
   [NestScout Delivery project](https://github.com/users/manhtu0407/projects/3).
2. Create a short branch, implement the scoped change, and run the checks.
3. When authorized, open a PR linked to the Issue; include evidence and rollback steps.
4. The owner reviews the exact commit and CI results, then chooses whether to merge.
5. Release only when there is an application/artifact and a verified source commit.

See [CONTRIBUTING](../CONTRIBUTING.md), [security reporting](../SECURITY.md),
[operations and recovery](operations.md),
[root engineering policy](../AGENTS.md),
[workflow coverage](workflow-coverage.md), and
[setup evidence](setup-evidence.md), [agent evaluation](agent-evaluation.md), and
[proposed architecture decisions](architecture.md).

## GitHub Free limits

Public repositories can use standard GitHub-hosted runners without consuming private
repository minutes. `main` now has a classic protection rule and required checks;
see the [current configuration](operations.md#supabase-hardening-owner-actions).
Earlier visibility-transition statements in setup evidence are historical.
Auto-merge remains off. A previous successful run does not validate a new revision.

Public visibility changes eligibility for native security features and attestations;
do not infer their activation from this change. Gitleaks CI detects secrets after
upload and is not native GitHub push protection. No paid services or AI API jobs
are configured. The management Project remains private.

## Ownership

No open-source license has been selected. The owner will decide licensing separately.
