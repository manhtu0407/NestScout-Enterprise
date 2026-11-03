# Unified agent engineering setup report

Disposable delivery report for the owner's review. Delete this file when the branch
is merged; it is evidence, not policy, and grants no authority.

Branch `codex/clean-start-20261103`, base `origin/main` at `7ada06a`. Platform
Windows 11, Node.js 24.19.0, Claude Code 2.1.310. Codex CLI is not installed.

## Overall status

PARTIAL. Every repository change is implemented and its gates pass. Codex
runtime loading is NOT RUN because the Codex CLI is unavailable on this machine.

## Implemented

- Language ownership policy: `scripts/language-policy.json` (data),
  `scripts/check-languages.mjs` (enforcement), `scripts/check-languages.test.mjs`
  (36 positive and negative tests), and a "Language ownership" section in
  `AGENTS.md`.
- Wiring: `check:languages` in the aggregate `check` script, the mandatory-check list of
  `check-test-selection.mjs`, and `verify:negative`. No workflow change: hosted CI
  already runs `npm run check` and `npm run verify:negative`.
- Pins updated for the changed policy: the expected `verify:negative` command in
  `git-environment.test.mjs` and the delivered `AGENTS.md` hash in
  `scripts/fixtures/qa-impact-review-r3-v2.json`, as PR #46 did before.
- Short notes in `CONTRIBUTING.md`, `docs/development-guide.md` and
  `docs/skills-foundation.md` (dated Claude Code observation).

Deliberately not added: `CLAUDE.md`, a Claude skills copy or symlink, a plugin
manifest or marketplace, subagent definitions, Python, Rust, or any new service.

## Language policy

| Path | Allowed |
| --- | --- |
| `apps/mobile/` | TypeScript |
| `services/` | TypeScript |
| `supabase/` | SQL and TypeScript (generated types, Edge code) |
| `scripts/` | Node ESM JavaScript |
| `.githooks/` | POSIX shell |
| everything else | no source language |

- Python and Rust are conditional: a module may not list them, and a path needs an
  `exceptions` entry with justification and approval text. Stale entries fail.
- Detected from extensions, extensionless shebangs, language manifests
  (`requirements.txt`, `Cargo.toml`, `go.mod`, and others) and runtime setup actions in
  workflow files (`setup-python`, `rust-toolchain`, `setup-go`, and others). Config,
  JSON, Markdown, YAML and generated files are not language sources.
- The one exception is `apps/mobile/eslint.config.mjs`, existing tooling.
- Negative results: Python, Rust, Swift, plain JavaScript, misplaced SQL and
  TypeScript, manifests, shebang scripts and setup actions are rejected in the
  working tree and in an index-only snapshot; malformed policies are rejected.
- Limit: `check-hygiene.mjs` already rejected unknown filenames. The new gate adds
  path ownership, manifests, shebangs and workflow runtimes. Dependency-level
  admission stays with the lockfile and Dependabot.

## Codex

- Configuration: root `AGENTS.md`, `.agents/skills/` and `.codex/config.toml`, all
  pre-existing and unchanged.
- Status: static only. Instruction and skill loading are NOT RUN.

## Claude Code

- Observed with `claude -p` in this checkout: the root `AGENTS.md` policy is loaded
  with no `CLAUDE.md`, so no adapter is needed or added.
- Observed: project skills under `.agents/skills` are not discovered by default.
  `claude -p --plugin-dir ./.agents` lists `.agents:be-auth-rls`,
  `.agents:skill-lifecycle` and `.agents:kael-tool-permissions`.
- A project-settings marketplace was tried in a scratch directory and did not load
  headlessly. It was not added: it needs an interactive install and a new root folder.
- Remaining gap: default Claude discovery of shared skills is not established.

## Shared skills

Canonical location `.agents/skills/`, 17 packages (lifecycle plus 16 specialists),
unchanged; `npm run check:skills` passes for the index and working tree.

## Verification

| Command | Result |
| --- | --- |
| `npm run check`, first run (Knip not installed) | FAIL, environment |
| `npm run check`, after `npm ci --ignore-scripts`, two runs | Every gate before `check:mobile` PASS; `check:mobile` FAIL both times on a 5 s jest timeout in `kael-motion-text.test.tsx` (first run also `primitives.test.tsx`) |
| `npm run check:mobile`, run alone after each | PASS, 65 suites, 784 tests |
| `npm run verify:negative` | PASS, 192 tests |

The aggregate therefore has no single end-to-end PASS on this machine. The timeouts
hit unchanged mobile tests while the CPU was loaded by the preceding gates, and the
same suites pass alone. Hosted CI has not run for these changes.

## Scope

No application, database, workflow, dependency or lockfile change. `README.md`,
`.claude/settings.json`, `.codex/config.toml` and the MCP files are untouched.
Nothing was pushed, and no pull request was opened.
