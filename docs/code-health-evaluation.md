# Code health evaluation

Status: **advisory baseline and acceptance protocol.** The Knip report and the diff
reviewer are not part of `check`, CI or the hooks and cannot block anything by themselves.
Their two test files do join `verify:foundation`, so they run in `check`, CI and the
pre-push hook, and they pin exact Knip outcomes: a Knip or oxc version bump, including
one proposed by the weekly npm Dependabot update, fails them until the fixture outcomes
are reviewed by a person. The baseline table was measured on 2026-10-27 at
`origin/main` `d87c9d97683c3dccf7cbad67f3434bc7c70f1f97` on Windows 11, Node.js 24.19.0,
npm 11.17.0; the branch was later rebased onto `33a3e10dd3f1f1740f2ca08e153829f8f29bd9c2`.
This is a task-specific procedure under the sole root [policy](../AGENTS.md), not another
instruction source, and it grants no authority to delete code, merge, push or change CI.

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
| Stryker 10.0.0 (Apache-2.0) | **DEFER** | Pilot on `vietnam-phone.ts` and `route-policy.ts` (125 mutants, perTest coverage, concurrency 2): 96.80% mutation score, 100 killed, 21 timed out, 4 survived, 0 no-coverage, 0 errors, 23 min 41 s. All 4 survivors and all 21 timeouts were adjudicated (see "Mutation pilot adjudication"): 2 survivors are a real, killable gap in the phone tests, 2 are probably equivalent, and the 21 timeouts are real kills that hang only in the wider suite. It needs the classic TypeScript API, so it cannot run against the root `typescript` 7.0.2 and was run from the mobile workspace on 6.0.3. Runtime is too high for a per-change gate, and `npm audit` reported 2 moderate transitive advisories in the scratch install. No Stryker dependency or configuration is committed. Revisit as a scheduled advisory job on pure-logic modules only |
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

| Kind | Item | Location | Classification from a repository-wide word search |
| --- | --- | --- | --- |
| export | `emptyTree` | `scripts/repository-files.mjs:29` | Live code. Called at line 38 of the same file; only the `export` modifier is unused |
| export | `classifyIdentityError` | `apps/mobile/src/features/access/auth/supabase-auth-gateway.ts:22` | Live code. Called at lines 36, 74 and 83 of the same file; only the `export` modifier is unused |
| export | `useAccess` | `apps/mobile/src/features/access/index.ts:8` | Unresolved. The hook is used widely, but every consumer imports it from `state/access-provider`; whether the feature barrel is a public surface is an owner decision |
| type | `CapabilityFailure` | `apps/mobile/src/features/access/capability/capability-repository.ts:5` | Live. Used by an exported type in the same file; exporting it lets callers name the failure reason |
| type | `AccessServices` | `apps/mobile/src/features/access/index.ts:8` | Unresolved, with the same barrel question as `useAccess`; the type itself is used by the provider, the default services and the test fakes |
| type | `AccessNotice` | `apps/mobile/src/features/access/state/access-reducer.ts:5` | Live. Used by the reducer state type in the same file |
| type | `SessionEventType` | `apps/mobile/src/features/access/state/access-reducer.ts:29` | Live. Used by the reducer action type in the same file |
| type | `WorkerStatus` | `apps/mobile/src/features/access/state/access-reducer.ts:204` | Live. Used by the access state type and its derivation in the same file |
| binary | `ssh-keygen` | `scripts/review-diff.test.mjs` | False positive. A host tool that generates throwaway signing keys for the attestation tests, not a package dependency |

No item is confirmed dead code, no dynamic or runtime reference was needed to explain
any of them, and nothing was removed. The first eight are `export` modifiers or barrel
re-exports that no other module imports; removing a modifier is an API decision for the
owner of each module and is outside this change.

## Evaluating the evaluators

### Dead-code detector

`scripts/dead-code-evaluation.test.mjs` builds a disposable Expo Router style project
in a temporary directory and records, per case, what Knip 6.42.1 does at zero
configuration. The test fails if any outcome changes, so a version bump needs a
conscious update.

| Case | Truth | Outcome |
| --- | --- | --- |
| Unused file, export, dependency, devDependency, exported type, export re-exported through a barrel | defect | TP, six cases |
| Unused SQL function | defect | **FN**: SQL is outside the import graph |
| Unused non-exported function | defect | **FN**: Knip reports exports, not locals |
| Router route, dynamic route segment, route group, type-only import, path alias, literal dynamic `import()`, literal registry `import()`, `new URL(..., import.meta.url)` worker, side-effect registration, jest setup, npm script target, workflow script target, used dependency, dependency used only by an `app.json` plugin entry, dependency used only as a script binary, barrel export that is imported, SQL function called by RPC name | live | TN, seventeen cases |
| Computed-path `import()`, computed-path `require()` | live | **FP**, two cases |
| Custom config plugin referenced only from `app.json` | live | **FP** |
| Script referenced only from `.mcp.json` arguments | live | **FP** |
| Script run only by a shell script that a package script calls | live | **FP** |
| Supabase Edge Function entry, loaded by the runtime | live | **FP** |
| `expo-updates` reported as unlisted | not needed | **FP** |
| Export used only by a test file | unknown | not flagged |
| Module referenced only by `jest.mock` | unknown | export flagged |

That is 6 TP, 7 FP, 2 FN, 17 TN and 2 unknown: precision 6/13 (0.46) and recall 6/8
(0.75). The two unknown cases depend on whether test-only use counts as live and are
excluded from both ratios. All 34 cases are hand-labeled by the author of the tool
configuration, so they are favorable and small, and a threshold was deliberately not
chosen after seeing them. Every added runtime-entry reference that is not an import
(`.mcp.json`, shell, Edge Function, computed `require`) is a false positive, which is
the dominant risk. **Enforcement is NOT_READY; the tool stays advisory.**

Caveats the numbers carry, reported by a separate read-only review and not corrected in
the fixtures: the two FN cases and the SQL TN case use subjects that Knip cannot name by
construction, so recall 6/8 reflects which out-of-scope cases were chosen, not Knip's
recall on the fixture; the fixture's full report holds five exported items that carry no
label, and only labeled subjects are classified, so 6/13 is precision over labeled
subjects, not over everything Knip printed; and the literal and registry dynamic
`import()` cases are labeled live although the fixture never calls the loader with those
names. Treat the ratios as descriptive only.

Limits of visibility: SQL and other backend resources, routes consumed by the router,
configuration-referenced files, shell and JSON launch arguments, Edge Function
entries and computed dynamic paths are not reliably seen. Any removal touching those
needs manual evidence.

### Diff reviewer

`scripts/review-diff.mjs` reads a frozen base-to-head diff (resolved SHAs and the merge
base) and returns a verdict of `PASS`, `FAIL` or `INSUFFICIENT_EVIDENCE` for each of five
dimensions. `scripts/review-diff.test.mjs` exercises it on isolated temporary
repositories, never production modules, with 44 tests:

- test weakening: `it.skip`, `it.only` and a node-test `skip` option fail; a deleted test
  file fails, and so does a test file renamed to a name that no longer matches the test
  pattern; a deleted assertion, an altered expected value and a removed test case need
  justification;
- JavaScript and TypeScript test files are analyzed from the syntax tree, parsed with the
  TypeScript native API, so quoted, templated and commented `it.skip(` text is never
  counted. Disabled tests are counted for modifier chains (`it.concurrent.skip`,
  `xit.each`), computed access (`it['skip']`, a dynamic key), aliases and destructuring of
  the test function, a stored `it.skip`, `skip`, `todo` or `only` options that are not the
  literal `false`, and `skip()` or `todo()` on the context parameter of a test callback;
- assertions are the outermost `expect` and `assert` call chains, compared as a whole
  expression with every control-flow guard around them: an enclosing `if`, loop, `try` or
  `catch`, `case`, conditional or `&&`, `||`, `??`, any earlier statement in the block
  that can return, throw, break or continue, an enclosing function that is not the test
  callback itself (an assertion moved into a closure nobody calls), and whether the
  assertion is awaited or returned (an `await` dropped from `rejects`). Whitespace is
  ignored only between tokens, never inside a string, template or regular-expression
  literal, so an edited expected string is an altered assertion. Same-file `const` and `let` values that the
  expression names (looked up by scope, to three levels) are part of the comparison, so a
  weakened matcher, an early return, an unreachable branch or a changed expected constant
  is reported even when the assertion's own line is unchanged. A non-test file that
  contained an assertion is compared the same way, which covers shared test helpers;
- a changed test file that cannot be parsed, at either revision, is reported as not
  comparable and never passes; there is no raw-text fallback for JavaScript or
  TypeScript. SQL tests keep the earlier line-based comparison;
- registrations: appending an existing test file to a `check`, `verify:` or `check:`
  script, and extending the assertion that pins that script, is reported as an owner
  review item and not as a scope failure. Dropping a registered test, appending anything
  other than a test file (a flag, for example), registering a file that does not exist at
  the head, or extending the pin assertion with a non-test token still fails or is
  reported as an altered assertion;
- controlled behavioral regressions (wrong state transition, changed authorization
  check, broken idempotency) fail through the recorded command results;
- removals: a still-referenced file or export fails and an unreferenced one is never
  approved. Exports, including default exports, and imports are read from the syntax
  tree. A removed export that a
  consumer still imports from the original module fails, even when another file exports
  the same name or the consumer itself re-exports it; a default export written as
  `export default value` is tracked like a declared one. A move is accepted only when the consumer now imports the name from a
  module whose declaration text equals the removed one and which did not export it
  before. A re-pointed import to a pre-existing or different declaration, a whole-module
  import, a re-export that cannot be compared, or a mention without an import needs
  owner review, and an import of a name the destination does not export fails;
- renamed and removed modules: every static import, re-export, `require` and mocked path
  (relative, or through the nearest `tsconfig.json` `paths`) that stops resolving at the
  head because its target was removed or renamed fails, and so does a moved file whose
  own relative imports stop resolving. A dynamic `import()` or `require()` with a
  non-literal argument, or a remaining mention of the old path, makes the dimension
  `INSUFFICIENT_EVIDENCE` whenever a module was removed or renamed;
- scope: a path outside the declared scope fails, a missing scope is insufficient, and a
  dependency change in any `package.json` needs owner review. The high-risk list now
  covers all of `scripts/` and `supabase/`, all of `apps/mobile/src/features/access/`,
  `scripts/tools.json`, tool and compiler configuration (`jest`, `babel`, `metro`,
  `eslint`, `knip` and `knip.json`, `stryker`, `tsconfig`), `.npmrc`, `.env*`, `.gitignore`,
  `.gitattributes` and `.editorconfig`. Independently of paths, a changed line in a
  source or SQL file that contains a word such as role, capability, permission, grant,
  policy, authorization, credential or secret (camelCase split) needs owner review. Any
  `check`, `test`, `lint`, `typecheck`, `scan` or `verify` script in any changed
  `package.json` that stops running a command it ran before fails;
- test selection is derived from the base and the head, whether or not the root manifest
  changed: a test file that still exists but is no longer selected by a test invocation in a script
  (a runner such as jest, `node --test`, `run-tests.mjs` or a test file argument, not a
  linter or typechecker) or by a jest `testMatch`, `testRegex` or `testPathIgnorePatterns` fails, a new test that
  nothing selects needs review, and a jest `roots`, `projects`, glob or `preset` this
  evaluator cannot evaluate, or a changed `jest.config.*`, needs review;
- reviewer attestation (see the protocol below): a self-declared verdict is ignored;
- artifacts: disposable file names and AI attribution lines fail, and so does a comment
  added to a source file after code or on its own line. The comment text of each changed
  file is read with the canonical `sourceComments` and `commentViolations` rules, so a
  string that merely contains `//` is not a comment;
- the reference search and the recorded commands run without the caller's `GIT_*`
  variables, as every other Git call in the repository does;
- an evaluation that cannot be completed, such as an unreadable ref, a usage error or a
  file larger than the 32 MiB Git buffer, prints `INSUFFICIENT_EVIDENCE` with the error
  and exits 3, so it
  is never mistaken for a `FAIL` verdict (exit 1) or a `PASS` (exit 0). The list of
  required commands cannot be shortened by the caller;
- evidence binding to the frozen head and a clean tree, and immunity to later commits.

Two defects in the evaluator itself were found by these tests and fixed: a "moved
export" heuristic that matched any export line mentioning the name, and nested
`node --test` commands silently skipping tests under an inherited `NODE_TEST_CONTEXT`.

One test records a **known blind spot** deliberately: a behavior change that no
existing test covers leaves correctness, scope, test integrity and dead-code safety at
PASS. The overall verdict still cannot reach PASS without an independent code-health
verdict, which is why that dimension exists.

### Mutation pilot adjudication

The pilot report carried 125 mutants: 100 killed, 21 timed out, 4 survived. The reported
96.80% is not a quality score and is not used as one.

| Mutants | Location | Finding |
| --- | --- | --- |
| Survived: `startsWith('0')` replaced by `true`, and by `startsWith('')` | `vietnam-phone.ts:24` | **Real gap, killable.** The branch only runs for input that matches no earlier prefix. For a 10-digit number with a stray leading digit such as `1350774849` the original returns `invalid_number` and either mutant returns `ok` with `+84350774849`. Across 679,572 generated inputs the mutants differ from the original on 14,351. No existing test pins this input class. No test was added here because mobile access tests are outside this task; the input is the recommended regression case |
| Survived: country-code check replaced by `false` | `vietnam-phone.ts:30` | **Probably equivalent, unproven.** Every candidate reaching the parser starts with `+84`. In 400,000 parses of `+84` plus random digits the calling code was always `84`, and no input in the 679,572 differed |
| Survived: `getType() !== 'MOBILE'` replaced by `false` | `vietnam-phone.ts:30` | **Probably equivalent, unproven.** The `libphonenumber-js/mobile` bundle (1.13.15) returned `MOBILE` for all 14,118 valid parses and no other type. A different bundle or version could change this |
| Timed out, 21 mutants | `route-policy.ts` lines 5 to 26 | **Real kills.** Rerun under Jest outside Stryker, each mutant hangs past a 90 s cap in the 39-test related set, where the unmutated run takes 12 s, so it is not machine load. The dedicated `route-policy.test.ts` kills all 21 by assertion in about 1.3 s each, with 1 to 6 of its 7 tests failing. The hang is non-termination in the surrounding suite, probably a redirect loop in the route guard screens; the loop was not traced |

Consequences: the timeouts are not hidden survivors, but they cost most of the 23
minutes because every hang runs to the timeout, which is a reason against a per-change
mutation gate. The two probable equivalents are defensive checks that this dependency
makes unreachable, and removing them is a separate decision for the owner. Equivalence
here rests on sampling and was not proven.

### Modified pin assertion

The only existing assertion changed is the exact pin of `verify:foundation` in
`scripts/git-environment.test.mjs`. It was checked on throwaway copies, with the
repository untouched. The new expected string is the old string with exactly two
whitespace-separated tokens appended, `scripts/review-diff.test.mjs` and
`scripts/dead-code-evaluation.test.mjs`, both present at the head. Running the test's
`aggregate verification` case against edited manifests:

| Assertion and manifest | Result |
| --- | --- |
| new assertion, new manifest | pass |
| old assertion, new manifest | **fail**, so the edit was required to register any test |
| new assertion, old manifest | **fail** |
| old assertion, old manifest | pass |
| new assertion, any one of the nine registered tests dropped | fail, nine of nine |
| new assertion, two tests reordered, an extra flag, an unknown extra test, or no tests | fail, four of four |

The pin still rejects every change to the script string, so the original protection
(no test silently dropped or reordered, no flag added) is intact. This is a single
author's check of one case, not independent review.

### Platform coverage

Measured at the code commit `abbe33a6ae22d8e98f772891bf3897ee081bf472`; only
documentation changed after it. Each platform used a fresh clone with its own
`node_modules`; the Linux container was built from a Git bundle of the full history.

| Platform | Environment |
| --- | --- |
| Windows | Windows 11, Node.js 24.19.0, npm 11.17.0, Git for Windows |
| Linux | `node:24-bookworm` container (capped at 2 CPUs and 4 GiB), Node.js 24.22.1, npm 11.19.1, x86_64, OpenSSH 9.2 (`ssh-keygen`, needed by the attestation tests) |

| Command | Windows | Linux |
| --- | --- | --- |
| `npm ci --ignore-scripts`, `npm run tools:install` | exit 0 | exit 0 |
| the two evaluator test files | inside the 130 foundation tests below | 41 of 41, run on their own |
| `npm run check` (foundation, mobile) | exit 0; 130 and 272 tests | exit 0; 130 and 272 tests |
| `npm run verify:negative` | exit 0; 151 tests | exit 0; 151 tests |
| `npm run health:dead-code` | exit 0; the nine items listed above | exit 0; the same nine |
| `npm run health:review-diff`, scoped to `docs/**`, `scripts/**` and the two manifests | exit 2, `INSUFFICIENT_EVIDENCE` | exit 2, `INSUFFICIENT_EVIDENCE` |

The review exits 2 on both platforms because no signed reviewer attestation exists for
this branch, so code health stays at insufficient evidence; that is the intended result
until the owner supplies one. Both platforms report the same nine Knip items.

An earlier Windows run of `npm run check` failed 6 mobile tests in four access-state
suites, all with the default 5 second timeout, while another process was loading the
machine. At the code commit the same run passed 272 of 272, the four suites passed in
five repeated, two serial and one randomized-order run, and an unchanged `origin/main`
clone (`33a3e10`) failed the same six tests in one of two runs under artificial CPU
load. This branch changes no mobile source, so the failures are not caused by it. The
tests are sensitive to a starved host; the mechanism was not traced, and they were not
changed.

The first Linux pass of an earlier commit found a real defect in this change:
`review-diff.mjs` located the npm CLI only in the Windows layout, so recorded commands
failed whenever it was not started through npm. It now also looks in the Linux layout,
with a regression test that clears `npm_execpath`. `npm run identity` needs the `gh`
CLI and the GitHub API, and was not run on Linux; three benchmark tests need a pinned
commit that exists only outside `origin/main`, which a history-limited clone lacks.
Hosted CI checks out with full history.

Not covered: macOS, arm64, a real GitHub-hosted runner, and the native device. Hosted CI
remains the authoritative check.

## Independent refactor acceptance protocol

The implementing session must not be the only authority on its own change.

Inputs, all frozen before review: base and head SHAs, the declared scope, the diff, the
baseline in this document, and command results recorded by the script itself.

```sh
npm run health:review-diff -- --base origin/main --head HEAD --scope "apps/mobile/src/lib/**" --run check --run verify:negative --reviewer review/head
```

`--run` executes `npm run <script>` only for scripts present in `package.json`, and only
when `HEAD` equals the frozen head and the working tree is clean. Otherwise the commands
are not recorded and correctness is `INSUFFICIENT_EVIDENCE`. The same two conditions are
checked again after every command; a command that changes `HEAD` or the working tree
stops the run and invalidates all results, so correctness is `INSUFFICIENT_EVIDENCE`.

`--reviewer` names a signed, annotated git tag whose message is JSON,
`{"codeHealth":{"verdict":"PASS","evidence":["path:line"]}}`. The tag is accepted only
when all of these hold: it points at the frozen head commit; `git verify-tag` reports a
good SSH signature (`gpg.format=ssh`) against the `gpg.ssh.allowedSignersFile` of the
machine that runs the evaluation; the signing principal and key fingerprint are not the
author, committer or signing key of any commit between the merge base and the head; the
verdict is PASS, FAIL or `INSUFFICIENT_EVIDENCE`; and a PASS carries at least one
evidence reference whose file and line exist at the head. Anything else, including a
JSON file or a verdict declared as independent, leaves `codeHealth` at
`INSUFFICIENT_EVIDENCE`. The allowed-signers file must lie outside the repository under
review, and `git verify-tag` runs without the caller's `GIT_*` variables, so neither the
change nor an environment variable can add a trusted signer. This shows that a key the
verifier trusts signed the verdict for
this head and did not write the change. It does not show that the signer is a human, that
the signer looked at the diff, or that a model and the implementation session do not share
a key; the allowed-signers file is the trust root and belongs to the owner.

| Dimension | Decided by | PASS requires | FAIL when |
| --- | --- | --- | --- |
| `correctness` | Recorded command results | `check` and `verify:negative` both run on the frozen head and exit 0 | Any recorded command exits non-zero |
| `codeHealth` | A signed reviewer attestation verified by git | A verified attestation with a PASS verdict and file and line evidence that resolves at the head | The verified reviewer reports FAIL |
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
- A reviewer attestation that git cannot verify or that is not independent of the
  change, or a PASS without resolvable evidence, is capped at `INSUFFICIENT_EVIDENCE`. A reviewer narrative never overrides a failed deterministic
  dimension.
- Reviewer prompt: read-only access, the frozen diff, this table and the
  `thermo-nuclear-code-quality-review` skill when the owner asks for it. The reviewer
  reports findings with file and line and cannot edit, commit or run hosted CI.
- CI needs no model call and no secret. A second session or another connected agent is
  an optional layer; the deterministic dimensions are reproducible without it.

Heuristics to know: the high-risk path list encodes the areas the owner asked to protect
(access control, session storage, routes, migrations and policies, policy and tooling
files) and is data in `scripts/review-diff.mjs`.

Known limits of the diff reviewer, found by a separate read-only review of
`33a3e10..71ceb5d`. The test-weakening gaps it reported are fixed in the sections above
with regression tests, and so are reviewer provenance, same-name export moves, references
to renamed files, the high-risk list gaps (the Client/Worker mode store, `scripts/tools.json`,
configuration files) and test selection that depended on the root manifest. A PASS from the
deterministic dimensions is still not evidence that behavior is intact. Open:

- the assertion comparison follows same-file values only. Data that reaches an assertion
  through a callback parameter (for example an `it.each` table), through an import, or
  through a shadowed `expect` is not compared, and a helper in another file is compared
  only if that file is changed and contained an assertion before;
- attestation checks the signature, the head binding, the signer's distance from the
  commits and the evidence lines. It cannot show who the signer is or that the diff was
  read, only SSH-signed tags are recognised, and verification needs `ssh-keygen` and an
  allowed-signers file on the verifying machine. Who wrote that file is not checked, so an
  implementer who controls the machine can still list their own second key;
- reference analysis is syntactic: `tsconfig` `paths` are read from the nearest file
  without `extends`, package imports are not resolved, a namespace or computed property
  access that reaches a removed export is only reported as a review item, and a word-based
  mention search is noisy for generic names. Every rename of a module in a repository with
  any non-literal `import()` or `require()` is reported for review;
- authorization detection is a word list on changed lines plus path rules, not an analysis
  of the access model; new modules outside the listed paths that use other vocabulary are
  not recognised. The jest evaluation handles `testMatch` globs without braces or
  extglobs, `testRegex` and `testPathIgnorePatterns`; other forms are reported for review;
- attribution and comment rules are applied to the text a diff adds, with the canonical
  comment extraction, and not to the whole delivered tree, which `npm run check:comments`
  still judges;
- the assertion comparison is exact: rewriting `await expect(p).resolves` as a returned
  promise, extracting assertions into a called helper, or wrapping them in `waitFor` is
  reported for review even when behavior is unchanged, and so is adding an `await` that
  strengthens a test. These are review items, never failures;
- the word-based reference search uses whole-word matching, so an identifier containing
  `$` can be missed, and a file named `index.*` is always reported for review because its
  stem is too generic to search; both are conservative for the second case only;
- `--run` executes the head's own scripts with the host environment minus `GIT_*` and
  prints the last 1500 characters of their output in the packet, so run it in a
  disposable worktree and do not share a packet produced with secrets in the environment.

The later read-only review also reported eight lower findings. Their disposition: the
`GIT_*` handling of the reference search and the recorded commands, the exit code of an
oversized or unreadable input, the added-text comment and attribution depth, the dead
`dimensionNames` export and the caller-supplied `required` list are fixed with tests; the
guarded script list and the stale document facts were fixed earlier; the `index.*` and
`$` search behavior and the `--run` environment are documented above as accepted limits.

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
6. Repair the two baseline failures as separate work if they recur: the hard-coded child
   timeout in `git-environment.test.mjs`, and the `core.autocrlf` dependence of
   `check-format.test.mjs`. Both passed on the rebased head (`33a3e10` plus this change)
   without any edit to those tests, and the cause of the change is not established.

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
