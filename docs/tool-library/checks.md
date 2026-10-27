# Repository checks, security and evaluation

Tier A. Select the existing checker for workflow errors, secrets, syntax, policy
invariants, persistent test selection and isolated agent evaluation. Do not implement
another scanner or weaken checks to pass. Versions for Gitleaks/actionlint belong
only to [tools.json](../../scripts/tools.json), resolved by `tool-path.mjs` and
installed by `npm run tools:install` with SHA-256 verification. Windows/Linux x64
assets are supported. Missing binaries are MISSING_BINARY; no fake installation is
inferred from a catalog entry. Setup downloads archives; installed scans are local.

## Gitleaks

Source: [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks), MIT. Triggers:
secret exposure, staged blob, working file or history credential. Native command
families: `version`, `--help`, `git --help`, `dir --help`, `stdin --help`; inspect
installed help for redaction, reports, baselines and config options. Scope choices
change what is scanned. Reports can contain secrets; use existing redacted options.

Use `npm run scan:secrets`: its canonical owner `check-tools.mjs` invokes staged
blob inspection, full ref history and working/index file coverage. A clean working
file can hide an exposed index blob. Do not substitute `gitleaks dir .` or add an
allowlist to hide a finding. Smoke with the real script and negative fixture suite;
secret/history scans require no network but consume CPU/history disk reads. On
findings, follow [SECURITY](../../SECURITY.md) privately; removal is not revocation.
On unavailable binary install through the pinned installer within approved scope.
Temporary scan trees belong only to that invocation; no broad cleanup. Doctor's
version means executable availability, not a secret-free repository assertion.

## actionlint

Source: [rhysd/actionlint](https://github.com/rhysd/actionlint), MIT. Triggers:
workflow YAML, expressions, Actions interfaces and job syntax. Discovery uses the
resolved binary with `-version`, `-help`; families include file/stdin inputs, config,
format/report output and optional ShellCheck/Pyflakes integration. The repository's
canonical `npm run lint:workflows` checks index and working workflow content with
the existing options; it does not require Docker or hosted CI.

Run it on the current workflow for real static smoke; use `verify:negative` for
known invalid fixtures. Repair the workflow's responsible field and rerun the
checker; do not disable a scanner or trigger a hosted workflow just to test it.
Its current external ShellCheck/Pyflakes integrations remain as configured; this
task does not silently enable additional host dependencies. Static PASS does not
prove GitHub permissions, required-check enforcement or a successful hosted job.
No external writes or persistent artifacts are needed; bounded private logs only.

## Markdown, YAML, metadata and permanent tests

Locked packages and scripts are in [package.json](../../package.json). Provenance:
[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) (MIT),
[yaml](https://github.com/eemeli/yaml) (ISC),
[Node test runner](https://nodejs.org/api/test.html) (Node's MIT/third-party notices),
[MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) (MIT) and the
repository's own enforcement code (no new repository license selected).
Bootstrap with `npm ci --ignore-scripts`; retain notices/lockfile. No global linter.

Inspect `npm run`, `node --help`, `markdownlint-cli2 --help` from installed package
context. Native Node test families include test selection, isolation, reporter and
coverage options; flags depend on installed help. Repository executors own reserved
files, metadata, hygiene, added source comments, formatting, YAML, secrets, test
selection and capability validation.
Do not create duplicate command definitions in a new runner.

Use `lint:markdown`, `lint:yaml`, `check:reserved`, `check:hygiene`, `check:comments`,
`check:format`, `check:metadata`, `check:test-selection`, `check:capabilities`, `verify:foundation`, `verify:supabase`
and `verify:negative` as appropriate, then the mandatory aggregate `check` and
negative suite before delivery. Selected persistent tests retain positive and
negative assertions; `db:mcp:test` remains a separately prerequisite-dependent
real database integration. A missing dependency, syntax failure, test exit or signal
must stay visible. Doctor's module-presence probe reports CHECKS_NOT_RUN, never PASS
for these workflows. Repair root causes and rerun affected consumers, then aggregate.

## Agent evaluation

`agents:evaluate -- prepare` / `verify ABSOLUTE_DIRECTORY` create/check owned
temporary Git fixtures under [the evaluation procedure](../agent-evaluation.md).
They neither invoke a model nor establish live skill loading. Fresh Codex and Claude
runs need separate authentication, read-only execution and evidence. The tool
library's [pilot matrix](index.md#agent-discovery-pilot) extends task selection
measurement without changing permissions, MCP servers or global config. Synthetic
test PASS is not model-compliance PASS. Fixture cleanup verifies the exact canonical
parent and ownership; never sweep another agent's directory. Test/probe durations
are measured when run; model cost/quality improvement and native product behavior
remain NOT MEASURED/NOT RUN unless independently demonstrated.
