# NestScout development guide

Persistency on the tenth times...!

Public, new NestScout repository. The Delivery Project remains private. This repository contains development
workflow and security tooling. The confirmed product direction is Expo/React Native,
TypeScript and Supabase, without Vercel; no product application is implemented.

## Repository identity

- Owner/repository: `manhtu0407/NestScout-Enterprise`
- GitHub repository ID: `1432052547`
- Default branch: `main`
- Visibility and plan: public, GitHub Free (explicitly approved by the owner)

Run `npm run identity` before remote writes. It verifies both origin URLs,
repository ID, visibility, default branch, authenticated account, and admin access.
Always pass `--repo manhtu0407/NestScout-Enterprise` to GitHub CLI write commands.

## Application preparation

[Architecture decisions](architecture.md#confirmed-product-direction) separate the
owner-confirmed direction from pending implementation details: one App for Clients
and Workers, guest discovery, multiple roles per account and backend authorization.
Vietnamese phone + OTP comes first; Google/Facebook are future secondary methods.
iOS comes first, with TestFlight later. The repository stays public until the
Deploy-phase owner decision. Development/testing use Supabase Local, without a
Staging Project or Production writes.

The [foundation contracts](foundation-contracts.md) describe environment inputs,
security boundaries and API conventions. There is no application environment loader
or `.env.example` yet: the tooling needs no dotenv file, and the App's variable
names/storage belong to its real consumer. Missing App structure, BPMN, UI, SDK,
business permissions and release design are **OUT OF SCOPE**, not foundation blockers.

The [implementation preparation](architecture.md#entry-into-application-implementation)
maps current folder responsibilities and the information needed before introducing
a product module. This setup creates no app or empty module directories and
installs no product dependencies. Future structure follows real responsibilities,
consumers and verification under the root policy, rather than importing the
HomeServices implementation. Pinned tooling currently supports Windows/Linux x64;
macOS tooling and native iOS execution have not been verified.

## Engineering Foundation V1 audit

Audited main `98187746fc67ea64848a544b4a938e4c643a807e` on 2026-10-27, including
the merged PRs below and their owning source. Historical PR results are not
verification of a new branch.

| Existing capability | Canonical implementation / reference | Audit disposition |
| --- | --- | --- |
| Local DB isolation, replay, SQL security, MCP and generated types | `scripts/supabase-local.mjs`, `supabase/`, [PR #10](https://github.com/manhtu0407/NestScout-Enterprise/pull/10) | Reuse; empty-schema tests do not prove product authorization |
| Backup/restore and isolated agent evaluation | `scripts/backup.mjs`, `scripts/agent-evaluation.mjs`, [PR #12](https://github.com/manhtu0407/NestScout-Enterprise/pull/12) | Reuse; no product/data recovery claim |
| Architecture preparation | [Architecture](architecture.md), [PR #16](https://github.com/manhtu0407/NestScout-Enterprise/pull/16) | Update confirmed decisions; retire staging recommendation |
| Tool catalog and bounded execution | [Tool library](tool-library/index.md), [PR #24](https://github.com/manhtu0407/NestScout-Enterprise/pull/24) | Reuse native tooling; no substitute framework |
| Test selection, execution integrity, secret scans and workflow trust | `scripts/check-test-selection.mjs`, `scripts/run-tests.mjs`, `scripts/check-tools.mjs`, [PR #26](https://github.com/manhtu0407/NestScout-Enterprise/pull/26), [PR #34](https://github.com/manhtu0407/NestScout-Enterprise/pull/34) | Reuse aggregate and negative tests; no redundant guard |
| Skills lifecycle and current 17-package library | [Skills foundation](skills-foundation.md), `.agents/skills/`, [PR #28](https://github.com/manhtu0407/NestScout-Enterprise/pull/28), [PR #35](https://github.com/manhtu0407/NestScout-Enterprise/pull/35), [PR #37](https://github.com/manhtu0407/NestScout-Enterprise/pull/37) | Reuse; structural validation is separate from runtime effectiveness |
| Environment and API contracts | [Foundation contracts](foundation-contracts.md) | Document missing boundaries; implement adapters/checks with real App consumers |

The existing local configuration, dependency/tool pins, hooks and CI already cover
the tooling foundation. No executable enforcement change is needed for these
documentation gaps. New prose tests would prove wording, not security behavior.
Use the existing `npm run check` and `npm run verify:negative`; run the sequential
[local DB gates](supabase-development.md#installation-and-local-runtime) to verify
the inherited database boundary. Review links and the complete diff as well.

## Engineering tool library

Use the [tool library](tool-library/index.md) before writing a substitute for an
existing tool. `npm run tools:list` maps native capabilities to runbooks;
`npm run tools:doctor` reports host readiness without starting services.
Docker smoke is a separate explicitly targeted local operation.

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

These Node/npm commands set up repository tooling, not the future application. There is no
application server, application build, product typecheck, or product unit suite yet.
Tooling unit tests, database artifact typechecking and disposable local SQL checks
do exist; use the commands in `package.json`. Tool downloads
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

`npm run check` also runs `verify:foundation`, retaining backup/restore and agent
evaluation harness regression tests. Its Git environment integration test runs the
hygiene suites and checker entry points with poisoned `GIT_*` selectors and verifies
that the donor repository is unchanged. Git subprocesses use the shared Foundation
environment scrubber, including linked-worktree and staged secret checks.
Hooks reject alternate indexes (including `git commit --only`/`--include`) so they
cannot silently inspect a different index from the proposed commit. Stage the intended
files and use an ordinary commit. Direct checks use the checkout's default index;
custom `GIT_INDEX_FILE` workflows need a separately reviewed inspection contract.

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

The hygiene reader uses Git batch reads for unique index blobs, checks working files
separately, and reuses content inspection only when bytes for the same path are equal.
Manifest hashes and path/configuration presence checks still run for both states.
TypeScript syntax inspection uses the pinned TypeScript 7 native API in a virtual
filesystem with no emit, imports or standard libraries resolved; every client closes
in `finally`. Its API is explicitly unstable, so dependency updates must retain the
TypeScript comment/string/JSX regression fixtures. No new dependency is installed.
Native compiler startup remains a per-distinct-TypeScript-file cost. Measure it
before applying full scans to a large TypeScript tree or source-heavy archive;
batching compiler inputs may then be appropriate. Keep full CI coverage if a future
local changed-file optimization is approved. Secret-history scan growth is separate
from hygiene reader performance. Artifact support and manual-review limits are in
[CONTRIBUTING](../CONTRIBUTING.md#file-and-review-workflow).

## Test artifact lifecycle

Use these categories when implementing the root policy with Codex or Claude Code:

- **EPHEMERAL:** one-off investigation, exploratory tests, diagnostics, scratch
  fixtures, logs and generated outputs. Use a unique task directory created with
  `mkdtemp` under `.cache/agent-tests/`, or an owned OS temporary directory when
  the existing runner supports it. These are disposable and never Git assets.
- **PERSISTENT:** reviewed unit, integration, security, regression and contract
  tests with lasting assertions. Follow the owning module's existing conventions;
  Node tests use `.test.mjs`, `.spec.mjs`, `.integration.test.mjs` or
  `.integration.spec.mjs` under `scripts/`, including kebab-case subdirectories.
  Database tests remain under `supabase/tests/database/`.
  Keep their sanitized fixtures and relevant local/CI verification versioned.

Register each persistent Node test exactly once as an explicit path in the owning
`package.json` runner: `verify:foundation`, `verify:supabase`, `verify:negative` or
`db:mcp:test`. `npm run check:test-selection` checks index and working-tree
snapshots separately, including untracked tests, missing files and duplicate
registrations. It rejects filters, globs, masked failures and disabled mandatory
commands. Discovery includes both test/spec suffixes even when a path violates
the naming policy; runner targets must pass the canonical hygiene path check.
The optional pre-commit hook invokes the guard directly with Node so replacing
its npm entry with a no-op cannot disable that hook gate. It retains the existing
hygiene, metadata and secret checks. Hooks can be bypassed; pre-push and CI also
run the aggregate. Registration proves selection, not assertion quality or agent
intent.

Every runner is `node scripts/run-tests.mjs <test files>`, and the selection guard
rejects a bare `node --test` runner. The script is the execution boundary: it starts
`node --test` with the integrity reporter (loaded by file URL, so absolute paths work
on Windows and Linux), removes a stale `NODE_TEST_CONTEXT`, and refuses to run when
`NODE_OPTIONS` or npm's `node-options` carry any `--test-*` or
`--experimental-test-*` option (name and skip patterns, `--test-only`, sharding, isolation,
reporters), because those silently drop tests while exiting 0. The value is read with
Node's own `NODE_OPTIONS` grammar, so quoting, extra spaces and underscores cannot hide
an option, and a value that is malformed or uses whitespace other than spaces is
rejected. Other Node options remain allowed. It also requires the reporter's evidence file to list every
requested test file, so a run whose reporter never completed fails even if Node
reported success. To run a subset while developing, call `node --test` directly;
such a run is not verification evidence.

The reporter keeps the normal spec output
but fails the run when a persistent test is skipped, marked todo, or its file executes
no passing test, because `node --test` otherwise exits 0 for all three. A legitimate
exception is a reviewed `repositoryHygiene.testExceptions` entry in `package.json`
with `file`, `name` and `reason`. Each entry authorizes exactly one skipped test or
suite: a repeated file and name pair, or a name shared by several skipped tests or
suites in one file, is rejected as ambiguous, and an entry fails once it no longer
matches a skipped test. No exceptions exist today. The guard does not judge
assertion quality.

Secret scans ignore inline Gitleaks suppression comments and ambient `GITLEAKS_*`
configuration, and Gitleaks ignore or configuration files are unapproved paths, so
the checked-in defaults apply to staged, history and working-copy scans. `npm run
lint:workflows` also enforces the workflow trust policy in the index and working
tree for every workflow file: only `pull_request`, `push` (limited to `main`),
`workflow_dispatch` and `workflow_call` triggers, explicit read-only token
permissions, and actions pinned to a full commit SHA or image digest. Changing that
policy requires owner authorization.

Use the existing runner (for example `node --test`), capture its actual exit status
and signal, and use `try/finally` to clean only the unique directory created by
that operation. Before recursive removal, verify its resolved absolute parent
and reject a replaced symlink/junction. Do not sweep `.cache/agent-tests/`, the OS
temp root, stale directories or another agent's files. `scripts/verify-negative.mjs`
contains an executable example covering success, failure and isolated cleanup.
Temporary fixtures follow the same rule: create them with `mkdtempSync` under the OS
temp directory, remove only that returned directory in `finally`, and first assert
that its resolved parent is the resolved temp directory and that it is not a link.
The evidence tests in `scripts/check-verification.test.mjs` show the pattern.

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
[architecture direction and decisions](architecture.md).

## GitHub Free limits

Public repositories can use standard GitHub-hosted runners without consuming private
repository minutes. `main` now has a classic protection rule and required checks;
see the [current configuration](operations.md#github-protection-and-local-database-ci).
Earlier visibility-transition statements in setup evidence are historical.
Auto-merge remains off. A previous successful run does not validate a new revision.

Public visibility changes eligibility for native security features and attestations;
do not infer their activation from this change. Gitleaks CI detects secrets after
upload and is not native GitHub push protection. No paid services or AI API jobs
are configured. The management Project remains private.

## Ownership

No open-source license has been selected. The owner will decide licensing separately.
