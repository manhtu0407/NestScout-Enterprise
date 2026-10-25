# Node.js and npm

Tier A. Select for runtime, dependency graph, test execution, locked installs and
script discovery. Reuse npm and `node --test` rather than adding a task runner or
package-manager facade. [Node.js source](https://github.com/nodejs/node) is MIT
with bundled third-party notices; [npm CLI](https://github.com/npm/cli) is Artistic-2.0.
Official references: [Node CLI](https://nodejs.org/api/cli.html),
[npm commands](https://docs.npmjs.com/cli/v11/commands/).

Version owner: `package.json` engines for the Node major, `package-lock.json` for
dependencies, actual host `node --version` / `npm --version` for runtime. Use
[Node's official downloads](https://nodejs.org/en/download) for supported host
installation with matched authority. This is not a global installer. Repo native
tooling supports Windows/Linux x64; package native dependencies need their own assets.

## Discover and operate

Run `node --help`, `npm --help`, `npm help <command>` and `npm run`. Inspect the
current [manifest](../../package.json) before any runnable command; examples do
not supersede it. Node families include execution, `--check`, `--test`, `--watch`,
`--inspect`, diagnostics reports, CPU/heap profiling and module-resolution options.
Syntax/test inspection is local; executing a script gives it that process's access.
Debugger ports and heap/report artifacts can expose secrets; bind locally and keep
outputs in task-owned ignored storage. Do not profile unrelated processes.

| npm families | Effects |
| --- | --- |
| `run`, `exec`, `test` | Discover scripts or execute code; exec may fetch missing packages, so prefer installed paths |
| `ci`, `install`, `uninstall`, `update`, `dedupe` | Dependency/lock/cache mutation; install scripts may execute arbitrary dependency code |
| `ls`, `explain`, `query`, `view`, `outdated` | Graph inspection; registry variants use network |
| `audit`, `audit fix` | Advisory network scan versus dependency mutation; no automatic fix to chase green |
| `pack`, `publish`, `dist-tag`, `access`, `owner`, `config`, `login` | Packaging versus external publish/credentials/settings; explicit scope required |

Bootstrap using `npm ci --ignore-scripts`; it downloads locked packages and replaces
this checkout's node_modules. Do not run over an unrelated install operation. Follow
with `npm run tools:install` only for checksum-verified native tools when needed.
No background database or Docker boot is required for docs or compiler-only tasks.

For dependency failures inspect `npm ls` and `npm explain PACKAGE`, installed Node
major, lockfile and platform. Repair the responsible approved manifest entry; do
not delete the lockfile, switch package managers or use `--force` to hide conflicts.
Audit network errors remain NETWORK_BLOCKED; a zero advisory result covers that
database/time/dependency scope only. Never put registry credentials in logs.

## Verification

Doctor verifies executable versions (Node must match the manifest's supported major
in this implementation) and distinguishes missing dependencies from missing binaries.
Safe local smoke: `node --check scripts/tool-doctor.mjs`, `npm ls --depth=0`,
`npm run typecheck:db`; meaningful permanent behavior lives in the selected Node tests.
Finish with `npm run check` and `npm run verify:negative`. No product build/test
command is invented. Test fixtures clean only their owned temp directories; compiler
checks do not emit. Startup and individual probe durations are measured when run;
install/audit bandwidth and registry costs are environmental, with no paid service
introduced. Model performance comparisons remain NOT MEASURED.
