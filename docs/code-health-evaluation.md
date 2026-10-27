# Code health evaluation

Status: **advisory baseline and acceptance protocol; no new blocking gate.** Base
`origin/main` `d87c9d97683c3dccf7cbad67f3434bc7c70f1f97`, measured 2026-10-27 on Windows 11,
Node.js 24.19.0, npm 11.17.0. This is a task-specific procedure under the sole root
[policy](../AGENTS.md), not another instruction source, and it grants no authority to
delete code, merge, push or change CI.

The question is whether the repository can tell a safe refactor from an unsafe one
using public tools and its existing gates, without treating fewer lines as better
quality. The answer recorded here is partial: some properties are decidable
deterministically, structural quality and semantic equivalence are not.

## Baseline evidence

Every row names the command and its observed outcome at the base revision, run from a
clean worktree with `npm ci --ignore-scripts` and `npm run tools:install`.

| Check | Outcome | Evidence and limits |
| --- | --- | --- |
| `check:reserved`, `check:hygiene`, `check:comments`, `check:format`, `check:metadata` | PASS | Inside `npm run check` |
| `lint:markdown`, `lint:yaml`, `lint:workflows`, `scan:secrets` | PASS | Inside `npm run check`, after the pinned tools were installed; the first attempt failed only because `actionlint` was missing |
| `verify:supabase`, `typecheck:db`, `check:test-selection`, `check:capabilities` | PASS | Inside `npm run check` |
| `verify:foundation` | **FAIL**, 88 of 89 | `git-environment.test.mjs` hit `ETIMEDOUT`. Reproduced alone in 187.6 s with no clock jump. Its child commands each carry a 120 s cap; `check-verification.test.mjs` alone takes 63 s unloaded here. Cause is probable, not proven |
| `npm run check` as an aggregate | **FAIL** | Stops at `verify:foundation`; `check:skills` and `check:mobile` are NOT RUN inside it |
| `check:skills` | PASS | 34 manifests, run separately |
| `check:mobile` | PASS when run separately | Typecheck and lint clean; jest 15 suites, 272 tests, 14.6 s. A first run showed 6 failures with suite times near 7336 s, a clock jump on the host, and is discarded |
| `verify:negative`, component view | **FAIL** | `check-format.test.mjs` fails 1 of 7: Git for Windows sets `core.autocrlf=true` system-wide, so the test's temporary repository normalizes its CRLF fixture before the gate reads it. Confirmed independently with a scratch repository. The other components passed individually |
| Supabase local stack (`db:*`) | NOT RUN | Not needed to evaluate this change and not demanded by the policy |
| Hosted CI | NOT RUN | A local result does not validate hosted CI |

The two FAIL rows are pre-existing and environmental or hermeticity defects. They are
reported as found; no test was edited to hide them.

## Entry points that static import analysis cannot see

| Mechanism | Where | Consumer |
| --- | --- | --- |
| Expo Router file-system routes | `apps/mobile/src/app/**`, `main: expo-router/entry` | Router, no import |
| Jest selection and alias | `apps/mobile/package.json` `jest`, `tsconfig.json` paths | jest-expo, TypeScript |
| Test registration through a wrapper | `scripts/run-tests.mjs <files>` in `package.json` | `check:test-selection` |
| Reporter loaded by path | `scripts/run-tests.mjs` to `test-integrity-reporter.mjs` | Node test runner |
| MCP server launch | `.mcp.json`, `.codex/config.toml`, `.cursor/mcp.json` to `scripts/supabase-mcp.mjs` | External clients |
| CLI invoked by computed path | `scripts/supabase-local.mjs` to `node_modules/supabase/dist/supabase.js` | npm `supabase` |
| Generated types | `supabase/database.types.ts` | `typecheck:db`, `db:types:check` |
| SQL objects and RPC names | `supabase/migrations/`, `supabase/tests/database/` | PostgreSQL, called by string from clients |
| Environment-driven configuration | `EXPO_PUBLIC_*` in `apps/mobile/src/lib/config.ts` | Expo build |

## Diagnostic signals

These are signals, not verdicts. The repository has 58 mobile source and test files
(4,177 lines; 15 of them tests), 48 Node ESM scripts (8,470 lines), one migration and
two database test files. No code file reaches 1,000 lines; the largest are test files
(`check-verification.test.mjs` 702, `check-hygiene.test.mjs` 636,
`check-comments.test.mjs` 628, mobile `supabase-auth-gateway-sdk.test.tsx` 497).

An advisory ESLint run with `complexity` above 8, `max-depth` above 3 and
`max-lines-per-function` above 80 gives 22 signals in 16 files. Apart from
`ActionButton` and one navigation test, every production signal is in access, session
storage or configuration-validation code, for example `accessReducer` (complexity 51, a
state-transition switch), `parseConfig` (15) and `normalizeVietnamPhone` (14). Those are
the modules the pilot rules exclude from early refactoring, and none of the thresholds
was validated, so none is proposed as a limit.

Gaps found in the existing workflow, each verified by experiment:

- A skipped test, an assertion-free test and an `it.todo` in a mobile test file
  all pass `jest --ci` and `eslint .` with exit 0. The existing integrity reporter
  covers `scripts/*.test.mjs` only.
- `@typescript-eslint/no-unused-vars` is a warning, and `lint` has no
  `--max-warnings`, so an unused import cannot fail the gate. `eslint . --max-warnings 0`
  exits 0 today, so the stricter form would pass at the base revision.
- Nothing detects a weakened or altered assertion, a deleted test file, or a removal
  that leaves a still-referenced symbol, in either `scripts` or mobile tests.
- Static analysis cannot see SQL, routes, configuration references or runtime
  registration (previous section).
- No mobile end-to-end or native-device evidence exists (`AGENTS.md` records native iOS
  as NOT VERIFIED).

## Tool decisions

| Candidate | Decision | Evidence |
| --- | --- | --- |
| Knip 6.42.1 (ISC) | **ADOPT as advisory** | Dev dependency with an exact pin, `npm run health:dead-code`, not part of `check`, not in CI. Runs in about 6 s here. It parses with oxc, so it works beside the root `typescript` 7.0.2. Release 6.42.1 was 8 days old when pinned; 6.43.0 was 3 days old. A scratch install showed 0 advisories. Adds roughly 50 lockfile entries, most of them optional per-platform native bindings, all present in the lockfile for Linux CI |
| ESLint and TypeScript, existing | **REUSE; no change made** | `strict` and `noUncheckedIndexedAccess` already on. Promotion candidates are listed below |
| Stryker 10.0.0 (Apache-2.0) | **DEFER** | Pilot on `vietnam-phone.ts` and `route-policy.ts` (125 mutants, perTest coverage, concurrency 2): 96.80% mutation score, 100 killed, 21 timed out, 4 survived, 0 no-coverage, 0 errors, 23 min 41 s. The 4 survivors are all in `vietnam-phone.ts` lines 24 and 30 and are unadjudicated review items, not confirmed test gaps or equivalent mutants: the `startsWith('0')` branch condition and string literal, and the country-code and `MOBILE` type checks. It needs the classic TypeScript API, so it cannot run against the root `typescript` 7.0.2 and was run from the mobile workspace on 6.0.3. Runtime is too high for a per-change gate, and `npm audit` reported 2 moderate transitive advisories in the scratch install. No Stryker dependency or configuration is committed. Revisit as a scheduled advisory job on pure-logic modules only |
| CodeQL | **DEFER; owner decision** | `README.md` states the repository is public with no software license selected. The CodeQL CLI terms grant free CI use only for open source code under an OSI-approved license, so eligibility is unproven. A workflow would also need new permissions. The repository already records CodeQL as unconfigured in the [tool library](tool-library/activation.md) |
| `thermo-nuclear-code-quality-review` skill | **REUSE, manual only** | Read-only structural review on explicit request, as its own scope says. Its 1,000-line presumptive blocker is not adopted as a gate here |
| Endor dependency review | NOT RUN | The tooling was not connected; license and advisory review used `npm view` and `npm audit` |

Knip at zero configuration is unusable on this repository: all 21 reported "unused
files" were false positives, because tests are registered through `run-tests.mjs`, the MCP
server is launched from client configuration, the reporter is loaded by path and the
generated types are read by `tsc`. The committed `knip` key in `package.json` is the
smallest configuration that removes them, and each entry is justified:

| Entry | Why it is needed |
| --- | --- |
| `entry: scripts/*.test.mjs` | Tests are arguments to `run-tests.mjs`, selection integrity is enforced by `check:test-selection` |
| `entry: scripts/supabase-mcp.mjs` | Launched by three client configuration files |
| `entry: scripts/test-integrity-reporter.mjs` | Loaded by path from `run-tests.mjs` |
| `entry: supabase/database.types.ts` | Generated, consumed by `tsc` through an npm script |
| `project: scripts/**/*.mjs, supabase/**/*.ts` | Limits unused-file reporting to the areas whose entries are declared above |
| `ignoreDependencies: supabase` (root) | Invoked as `node_modules/supabase/dist/supabase.js`, a computed path |
| `ignoreDependencies: expo-updates` (mobile) | Knip's Expo plugin assumes it whenever `updates.enabled` is not `false`; nothing in the repository references it |

Scripts are not declared entries as a group, so a genuinely unreferenced script would
still be reported.

With this configuration `npm run health:dead-code` reports only the items below. They are
review items for the owner. None has been removed, and none is claimed to be dead:
several are exported for tests or as part of a feature's public surface.

| Kind | Item | Location |
| --- | --- | --- |
| export | `classifyIdentityError` | `apps/mobile/src/features/access/auth/supabase-auth-gateway.ts:22` |
| export | `useAccess` | `apps/mobile/src/features/access/index.ts:8` |
| type | `CapabilityFailure` | `apps/mobile/src/features/access/capability/capability-repository.ts:5` |
| type | `AccessServices` | `apps/mobile/src/features/access/index.ts:8` |
| type | `AccessNotice` | `apps/mobile/src/features/access/state/access-reducer.ts:5` |
| type | `SessionEventType` | `apps/mobile/src/features/access/state/access-reducer.ts:29` |
| type | `WorkerStatus` | `apps/mobile/src/features/access/state/access-reducer.ts:204` |

## Evaluating the evaluators

### Dead-code detector

`scripts/dead-code-evaluation.test.mjs` builds a disposable Expo Router style project
in a temporary directory and records, per case, what Knip 6.42.1 does at zero
configuration. The test fails if any outcome changes, so a version bump needs a
conscious update.

| Case | Truth | Outcome |
| --- | --- | --- |
| Unused file, unused export, unused dependency | defect | TP, TP, TP |
| Unused SQL function | defect | **FN**: SQL is outside the import graph |
| Router route, type-only import, path alias, literal dynamic `import()`, side-effect registration, jest setup, npm script target, workflow script target, used dependency, SQL function called by RPC name | live | TN, ten cases |
| Computed-path `import()` | live | **FP** |
| Custom config plugin referenced only from `app.json` | live | **FP** |
| `expo-updates` reported as unlisted | not needed | **FP** |

That is 3 TP, 3 FP, 1 FN, 10 TN: precision 0.50 and recall 0.75 on 17 hand-labeled
cases written by the same author as the tool configuration. The sample is far too small
and too favorable to set a precision threshold, and a threshold was deliberately not
chosen after seeing it. **Enforcement is NOT_READY; the tool stays advisory.**

Limits of visibility: SQL and other backend resources, routes consumed by the router,
configuration-referenced files and computed dynamic paths are not reliably seen. Any
removal touching those needs manual evidence.

### Diff reviewer

`scripts/review-diff.mjs` reads a frozen base-to-head diff (resolved SHAs and the merge
base) and returns a verdict of `PASS`, `FAIL` or `INSUFFICIENT_EVIDENCE` for each of five
dimensions. `scripts/review-diff.test.mjs` exercises it on isolated temporary
repositories, never production modules, with 17 tests:

- test weakening: `it.skip`, `it.only` and a node-test `skip` option fail; a deleted test
  file fails; a deleted assertion, an altered expected value and a removed test case
  need justification;
- controlled behavioral regressions (wrong state transition, changed authorization
  check, broken idempotency) fail through the recorded command results;
- removals: a still-referenced file or export fails, an unreferenced one is never
  approved, a moved export is recognized as a move;
- scope: a path outside the declared scope fails, a missing scope is insufficient,
  protected areas and dependency changes need owner review, a gate removed from `check`
  fails;
- artifacts: disposable file names and AI attribution lines fail;
- evidence binding to the frozen head and a clean tree, and immunity to later commits.

Two defects in the evaluator itself were found by these tests and fixed: a "moved
export" heuristic that matched any export line mentioning the name, and nested
`node --test` commands silently skipping tests under an inherited `NODE_TEST_CONTEXT`.

One test records a **known blind spot** deliberately: a behavior change that no
existing test covers leaves correctness, scope, test integrity and dead-code safety at
PASS. The overall verdict still cannot reach PASS without an independent code-health
verdict, which is why that dimension exists.

## Independent refactor acceptance protocol

The implementing session must not be the only authority on its own change.

Inputs, all frozen before review: base and head SHAs, the declared scope, the diff, the
baseline in this document, and command results recorded by the script itself.

```sh
npm run health:review-diff -- --base origin/main --head HEAD --scope "apps/mobile/src/lib/**" --run check --run verify:negative --reviewer reviewer.json
```

`--run` executes `npm run <script>` only for scripts present in `package.json`, and only
when `HEAD` equals the frozen head and the working tree is clean. Otherwise the commands
are not recorded and correctness is `INSUFFICIENT_EVIDENCE`. The reviewer file is
optional JSON: `reviewer`, `independent`, and `codeHealth` with a `verdict` and an
`evidence` list of file and line references. Keep it outside the repository.

| Dimension | Decided by | PASS requires | FAIL when |
| --- | --- | --- | --- |
| `correctness` | Recorded command results | `check` and `verify:negative` both run on the frozen head and exit 0 | Any recorded command exits non-zero |
| `codeHealth` | An independent read-only reviewer | A verdict of PASS with file and line evidence from a reviewer marked independent | The reviewer reports FAIL |
| `deadCodeSafety` | Diff plus head search | No removed file or export | A removed file or export is still referenced at the head |
| `scope` | Diff and declared scope | Every path inside the scope, no high-risk area, no dependency change | A path is outside the scope, or a gate was dropped from a `check` or `verify` script |
| `testIntegrity` | Diff | No disabled test, deleted test, lost assertion or disposable artifact | A disabled test, a deleted test file, a disposable name or an AI attribution line |

Rules that follow from the policy:

- The overall verdict is FAIL if any dimension fails, `INSUFFICIENT_EVIDENCE` if any is
  insufficient, otherwise PASS. There is no weighted score and source length is never a
  verdict. Any FAIL or unresolved critical uncertainty blocks merge, and the owner makes
  the merge decision.
- A removal with no remaining reference is still `INSUFFICIENT_EVIDENCE`: static absence
  does not show routes, configuration, runtime registration or backend contracts are
  unused. Uncertain usage means do not delete.
- A reviewer that is not independent, or a PASS without evidence, is capped at
  `INSUFFICIENT_EVIDENCE`. A reviewer narrative never overrides a failed deterministic
  dimension.
- Reviewer prompt: read-only access, the frozen diff, this table and the
  `thermo-nuclear-code-quality-review` skill when the owner asks for it. The reviewer
  reports findings with file and line and cannot edit, commit or run hosted CI.
- CI needs no model call and no secret. A second session or another connected agent is
  an optional layer; the deterministic dimensions are reproducible without it.

Heuristics to know: test and assertion counts are matched by pattern, not parsed;
the high-risk path list encodes the areas the owner asked to protect (access control,
session storage, routes, migrations and policies, policy and tooling files) and is data
in `scripts/review-diff.mjs`.

## Pilot

**Read-only; the baseline was retained unchanged.** The candidate was
`apps/mobile/src/features/shared/ui/action-button.tsx`: isolated, used by the access
screens, with 100 percent statement and 93 percent branch coverage. Its complexity
signal of 10 comes from defaults and ternaries in JSX. There is no concrete
maintainability defect and no reliable behavior gap, so refactoring it would only
produce a changed file. Every other signal is in access, storage or configuration code,
which the pilot rules exclude.

Review items from the configured Knip run on the real repository are listed in the
previous section. They are not deletion proposals.

## Follow-up plan

Promote only when the stated evidence exists, one item at a time, each as its own change
with positive and negative fixtures:

1. Test-integrity coverage for mobile tests: an enforced check for disabled tests in
   `apps/mobile` using the same exception model as `test-integrity-reporter.mjs`.
   Evidence needed: a fixture proving `it.skip`, `it.todo` and empty tests fail.
2. `eslint . --max-warnings 0` for the mobile workspace. It passes today; the owner
   should confirm no in-flight branch carries warnings.
3. A blocking dead-code check only after at least 30 labeled cases from this repository
   with an owner-set precision threshold, plus an entry-point inventory for routes,
   SQL and configuration references.
4. Mutation testing for pure access logic only if a Windows and Linux CI runtime budget
   is approved and Stryker is compatible with the root TypeScript pin.
5. CodeQL after the owner selects a license or enables the required GitHub plan, and
   approves its workflow permissions.
6. Repair the two baseline failures as separate work: the hard-coded child timeout in
   `git-environment.test.mjs`, and the `core.autocrlf` dependence of
   `check-format.test.mjs`.

## Reproduce

```sh
npm ci --ignore-scripts
npm run tools:install
npm run health:dead-code
npm run health:review-diff -- --base origin/main --head HEAD --scope "<owner scope>"
node scripts/run-tests.mjs scripts/review-diff.test.mjs scripts/dead-code-evaluation.test.mjs
```

Raw logs, scratch installs and Stryker output are not committed; keep them outside the
checkout. A Stryker sandbox has to sit inside the workspace tree to resolve modules, so
remove it before running `npm run check`, which correctly scans untracked files.
