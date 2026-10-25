# Optional tooling and controlled onboarding

Tier B means useful now when prerequisites and scope permit, not silently installed.
Doctor probes host versions without downloading tools or vulnerability databases.
Missing optional binaries remain discoverable as MISSING_BINARY. A successful
version probe is not a completed scan. All examples require inspecting installed
help first. OS/arch claims below describe upstream distribution, not a tested repo
platform expansion; the repository supports Windows/Linux x64.

## Selection and licensing

Recommended initial combination: existing Gitleaks/actionlint plus OSV for dependency
advisories. jq adds JSON querying when native gh JSON/PowerShell is insufficient.
ShellCheck covers actual POSIX hooks; Hadolint adds Dockerfile rules and includes
ShellCheck analysis of RUN content. Trivy adds image/OS-package/config coverage when
there are relevant images/configs, with overlap in filesystem dependency scanning.
Do not download the Trivy database just to repeat a bounded OSV lockfile scan.

jq, ShellCheck and Hadolint now have explicit project-local onboarding through the
existing installer. jq supports catalog/fixture JSON queries, ShellCheck has real
consumers in the three repository hooks, and Hadolint supports the owned synthetic
Dockerfile workflow before product code exists. Trivy and standalone PostgreSQL
clients remain staged: there is no demonstrated IaC/image scan or separate client
consumer justifying another install/database download today. This is not a workaround
for OSV's Windows execution restriction.

```sh
npm run tools:install -- --tool jq
npm run tools:install -- --tool shellcheck
npm run tools:install -- --tool hadolint
```

Pins, release tag conventions, archive layout and SHA-256 stay exclusively in
`scripts/tools.json`. The installer verifies bytes before writing/extracting; the
ShellCheck Windows ZIP preserves its README/license and its Linux archive strips
one upstream directory level. No PATH or global package manager is changed.
Resolve all installed optional binary paths with `toolPath(ID)` from
`scripts/tool-path.mjs`; doctor prefers that path to an existing PATH installation.
Default `tools:install` still installs only the original mandatory tools, so optional
host readiness and mandatory CI coverage are separate. A binary placed in cache is
not proof of execution or a completed scan. Use native help and the smoke assertions
below, record actual exits and preserve failures.

| Tool / trigger | Upstream source, license and install entry | Distribution / overlap |
| --- | --- | --- |
| jq / JSON queries | [jq download](https://jqlang.org/download/), [source](https://github.com/jqlang/jq), MIT plus bundled notices | Windows/Linux/macOS binaries; gh `--jq`/PowerShell may suffice |
| OSV / lockfile advisories | [installation](https://google.github.io/osv-scanner/installation/), [source](https://github.com/google/osv-scanner), Apache-2.0 | Windows/Linux/macOS release assets; npm audit overlaps npm advisories |
| ShellCheck / POSIX script | [source/install](https://github.com/koalaman/shellcheck), GPL-3.0 | Inspect exact release assets; Windows instructions/distribution differ; not a PowerShell analyzer |
| Hadolint / Dockerfile | [source/install](https://github.com/hadolint/hadolint), GPL-3.0 | Linux/macOS/Windows release assets vary; overlaps ShellCheck for embedded shell |
| Trivy / images, IaC | [installation](https://trivy.dev/docs/latest/getting-started/installation/), [source](https://github.com/aquasecurity/trivy), Apache-2.0 | Select supported upstream host asset; no Docker image pull as an implicit installer |
| PostgreSQL / local SQL, dump | [downloads](https://www.postgresql.org/download/), [source/license](https://www.postgresql.org/about/licence/) | OS packages/vendor Windows distribution; isolated Supabase already carries server tooling |

Use CLI subprocesses, not vendored source integration. Retain notices when distributing
binaries; GPL redistribution obligations differ from executing an unmodified local
tool. No repository license is selected by this task. Open-source CLI use introduces
no paid API job; hosted products and Docker Desktop have separate terms. Do not sign
up for trials, install a package manager or change system PATH/permissions by inference.

For tools without a repo installer: choose an exact maintained release from the
linked official source, inspect its license and platform asset, verify SHA-256 against
the upstream release manifest/signature, then seek matched scope before a host install.
If a project-local pin is later justified, extend `scripts/tools.json` and the shared
installer instead of adding a second downloader. Do not use `curl | sh`, an unpinned
"latest" binary URL, or an unexplained third-party mirror. Until that is implemented
and run, onboarding is documentation only and installation/smoke stays NOT RUN.

## OSV: lockfile analysis and execution prerequisites

The existing installer has explicit optional binary support for OSV; default
`tools:install` still installs only the original mandatory tools. The single
pin/hash owner is [tools.json](../../scripts/tools.json). Release provenance and
checksums come from [official releases](https://github.com/google/osv-scanner/releases),
not this document. It uses public GitHub HTTPS, no credentials or global config.

```sh
npm run tools:install -- --tool osv-scanner
npm run tools:doctor -- --tool osv-scanner
```

Use `toolPath('osv-scanner')` from `scripts/tool-path.mjs` to resolve the local binary;
the doctor prefers this installed binary, otherwise probes an existing PATH binary.
`binaryPresent` records a project-local file separately from successful executable
discovery. A host application-control or antivirus execution block remains
PROBE_FAILED with a bounded native error code; do not disable host policy, change
permissions, or use another environment to bypass that restriction. Report the
verified download and blocked version/scan independently.
Inspect that executable's `--version`, `--help`, `scan --help`, `scan source --help`.
The [V2 documentation](https://google.github.io/osv-scanner/usage/) covers source,
image, license, offline matching, output and remediation namespaces. Do not reuse
V1 syntax or run guided remediation automatically. Help can vary by installed release.

EXAMPLE for V2, after checking actual help, with the selected pinned binary path:

```text
OSV_BINARY scan source --lockfile package-lock.json
```

Inspect the exact lockfile and any scanner config first. A normal online scan sends
dependency/version queries to advisory infrastructure; source/image and license modes
can have different network/data costs. Never scan private source or arbitrary roots
by inference. Offline mode needs a separately obtained local database; no database
availability is implied by an installed scanner. Keep network blocking distinct from
zero findings. Native exit codes can distinguish findings from operational failure;
inspect the installed help and complete native summary before interpreting them.

A bounded smoke is the real repository lockfile plus a synthetic owned lockfile with
an intentionally vulnerable known dependency and one with no vulnerable packages.
Report expected finding versus failure, never convert a vulnerability into PASS for
the repository. Findings require traceable advisory/package/version review and an
authorized dependency fix, not exclusions. `npm audit` is a mature alternate npm-only
scan; compare coverage, not counts as a quality metric. Cleanup removes only the
owned fixture, not scanner/global caches. Initial binary bandwidth and query latency
are measured only if observed; no recurring scan or paid account is configured.

## jq

Discovery: `jq --version`, `jq --help`, [manual](https://jqlang.org/manual/).
Families: filters, `-e` status, `-r` raw output, `--arg` parameters, slurp/stream,
files and module search. Filters read input; shell redirection/output paths mutate
files. Avoid command interpolation and untrusted jq modules. Workflow: select a
sanitized JSON file, inspect filter/help, query with exact path, check `-e`/parse
failure and expected value. Offline smoke: `jq -e '.schemaVersion == 1'
scripts/tool-capabilities.json`. No-match/false has a meaningful nonzero status;
invalid JSON/filter is a failure. No resource cleanup beyond owned output files.
Missing binary is MISSING_BINARY; use native gh `--jq` or PowerShell for this task
instead of pretending jq is installed. Runtime/cost is NOT MEASURED until executed.

## ShellCheck

Discovery: `shellcheck --version`, `shellcheck --help` and
[diagnostic wiki](https://www.shellcheck.net/wiki/). Families: dialect selection,
files/stdin, external sources, severity, output formats and source paths. Read-only
analysis should not follow arbitrary source files; inspect owned fixture/includes.
Workflow: choose POSIX shell consumer, inspect dialect, analyze exact file, trace
warning to quoting/lifecycle semantics, repair, rerun valid/invalid fixtures and the
real consumer. Synthetic smoke: an owned `#!/bin/sh` script containing
`printf '%s\n' "$value"` versus an unquoted `echo $value`; assert diagnostic and exit.
Do not suppress the rule to pass. No shell execution or network is required by the
analyzer. BLOCKED if no supported binary; no PowerShell compatibility claim.
Keep synthetic files under owned temp and remove only that directory. Startup and
real-hook reliability remain NOT MEASURED/NOT RUN until analyzed.

## Hadolint

Discovery: `hadolint --version`, `hadolint --help`, upstream rule reference.
Families: Dockerfile/stdin, format, failure threshold, config and trusted registries.
Analysis is read-only but config/ignore rules can mask results; inspect exact config.
Workflow: lint an actual/owned synthetic Dockerfile, identify shell versus image/user
rule, repair owning input and rerun; Docker Engine is not required. Bounded synthetic
smoke: a maintained pinned base with a non-root USER for valid input, and an untagged
`FROM alpine` for a known rule violation, asserting exact native diagnostic/exit for
the installed version. Do not add an imaginary product Dockerfile. No image pull or
build is implied. Missing binary stays BLOCKED; cleanup exact owned fixture only.
No observed startup/performance claim until run.

## Trivy

Discovery: `trivy --version`, `trivy --help`, `fs --help`, `image --help`,
`config --help`; [filesystem docs](https://trivy.dev/docs/latest/target/filesystem/).
Families also include repository/rootfs/SBOM, vulnerability/misconfiguration/license
scanners, cache, database and output controls depending on installed release.
Prefer OSV for today's lockfile; select Trivy for a real image or IaC boundary.
Workflow: verify source/target, scanner/config and database provenance/age, inspect
help, run exact scoped scan, review findings and rerun after authorized repair.
Image pulls and vulnerability DB updates use network/disk and may be substantial;
offline flags without a database are NETWORK_BLOCKED/NOT RUN, not a clean scan.
Synthetic config smoke can lint an owned bad/good Dockerfile with installed rules;
never scan entire host or mount Docker socket just for convenience. Reports may
expose source metadata/secrets. Cleanup only owned output; do not reset shared cache.
No periodic update/download is configured; performance is NOT MEASURED.

## PostgreSQL clients

Discovery: `psql --version`, `psql --help`, `pg_dump --help`, `pg_restore --help`,
`pg_isready --help`; [psql reference](https://www.postgresql.org/docs/current/app-psql.html).
Families: connection/interactive SQL, metadata commands, readiness, dump/restore and
format/list selection. SQL/restore can mutate; even diagnostics must use a verified
owned loopback endpoint. Prefer existing `db:*`/MCP tests for this repo. Match client
major to server compatibility before dumps, inspect local stack identity and avoid
connection strings/passwords in argv/logs. A local read-only smoke uses a transaction
with `BEGIN READ ONLY; SELECT 1; ROLLBACK;`, with credentials provided privately via
the documented local mechanism; never connect to a default inherited remote target.
Missing client and missing local stack are separate gaps. No standalone client is
installed just to duplicate Supabase's executor. On auth/connection failure inspect
ownership/status; no credential/role change. Dumps may contain private data and
need explicit retention; remove only owned fixture/output. Product DB behavior,
startup cost and recovery compatibility remain NOT RUN until tested.
