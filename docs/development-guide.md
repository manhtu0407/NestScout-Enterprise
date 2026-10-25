# NestScout development guide

Persistency on the tenth times...!

Public, new NestScout repository. The Delivery Project remains private. This repository contains development
workflow and security tooling; the application stack has not been selected.

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
application server, application build, typecheck, or unit suite yet. Tool downloads
are version-pinned and SHA-256 checked; dependency installation uses the lockfile.

Optional local hooks (affect only this checkout):

```sh
git config --local core.hooksPath .githooks
```

Hooks can be bypassed and are not server-side protection. Pre-commit checks reserved
files, hygiene, existing commit metadata and secrets; commit-msg validates the proposed
message; pre-push verifies identity, the actual pushed ref, metadata and aggregate
checks. Secret checks retain staged-blob, history and working-file scans. Keep local
secrets in ignored files. `npm run verify:negative` includes deterministic positive
and negative hygiene/metadata fixtures in isolated temporary Git repositories.

## Attribution settings and runtime limits

`.claude/settings.json` sets `attribution.commit` and `attribution.pr` to empty
strings and `attribution.sessionUrl` to `false`, preserving permissions and MCP.
These are [supported Claude Code settings](https://code.claude.com/docs/en/settings-reference#attribution).
The guard also accepts `attribution: false`, supported since 2.1.281; the committed
object form remains compatible with versions that support the individual fields.
Claude Code 2.1.310's read-only doctor accepted the project settings on Windows;
the local installation was not signed in, so model-driven commit/PR attribution
and policy discovery were NOT RUN. No PR was created to test attribution.

Installed Codex CLI 0.163.0-alpha.11.2 rejects `commit_attribution` as an unknown
project configuration field with `app-server --strict-config`. Automatic attribution
disablement is BLOCKED for this runtime; the incompatible key is not committed.
Existing `.codex/config.toml` MCP configuration is preserved. Older runtime advice
about this key is not proof of support in the installed version. Recheck the
[official configuration reference](https://developers.openai.com/codex/config-reference/)
and strict runtime parsing before adding a supported replacement. If a compatible
runtime uses that key, the hygiene checker permits only an empty value. Repository
metadata guards reject known AI signature forms independently of runtime settings.
Strict `config/read` without the incompatible key confirmed the project configuration
layer loads; the effective configuration exposed no Git/attribution keys.
Project/user/managed/CLI precedence and arbitrary model behavior require separate
runtime verification; file presence and schema acceptance do not prove effective
loading or complete behavioral compliance. No Git author identity is changed.

The implementation adapts project-local consistency and technical comment guidance
from [VS Code](https://github.com/microsoft/vscode/wiki/Coding-Guidelines) and
[Google](https://google.github.io/styleguide/jsguide.html), shared upload/commit
validation and full-scope fixtures from
[Chromium presubmits](https://www.chromium.org/developers/how-tos/depottools/presubmit-scripts/),
and the separation between checks and enforced merge gates from
[GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).
It retains NestScout's ESM, kebab names, two-space indentation and current modules.
Comments explaining security, races, compatibility, legal constraints or contracts
remain legitimate; their usefulness is a human review decision.

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
3. Open a PR linked to the Issue; include evidence and rollback steps.
4. The owner reviews the exact commit and CI results, then chooses whether to merge.
5. Release only when there is an application/artifact and a verified source commit.

See [CONTRIBUTING](../CONTRIBUTING.md), [security reporting](../SECURITY.md),
[operations and recovery](operations.md),
[root engineering policy](../AGENTS.md),
[workflow coverage](workflow-coverage.md), and
[setup evidence](setup-evidence.md).

## GitHub Free limits

Public repositories can use standard GitHub-hosted runners without consuming private
repository minutes. Branch protection and required status checks are now eligible
under GitHub Free, but are not configured by the visibility-change task. Checks alone
do not enforce a server-side merge gate. Auto-merge remains off.

Public visibility changes eligibility for native security features and attestations;
do not infer their activation from this change. Gitleaks CI detects secrets after
upload and is not native GitHub push protection. No paid services or AI API jobs
are configured. The management Project remains private.

## Ownership

No open-source license has been selected. The owner will decide licensing separately.
