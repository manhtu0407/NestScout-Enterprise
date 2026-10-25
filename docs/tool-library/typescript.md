# TypeScript compiler

Tier A for existing database types and future actual TypeScript consumers. Triggers:
type error, compiler, generated artifact, module resolution. Prefer the project
compiler over a bespoke type parser. Vendor/source: [Microsoft TypeScript](https://github.com/microsoft/TypeScript),
Apache-2.0; [compiler reference](https://www.typescriptlang.org/docs/handbook/compiler-options.html).
The exact pin belongs to `package.json` / lockfile, not this page.

Bootstrap: `npm ci --ignore-scripts` installs the locked compiler and host-specific
native dependency. Windows/Linux x64 is the repo's supported matrix. Other compiler
platforms are not a repository compatibility claim. Network is needed for setup,
not an installed local no-emit check. No global `tsc` or app config is installed.

## Native discovery and workflow

```sh
node node_modules/typescript/bin/tsc --version
node node_modules/typescript/bin/tsc --help
node node_modules/typescript/bin/tsc --help --all
npm run typecheck:db
```

Use installed help for `--noEmit`, `--project`, `--showConfig`, `--explainFiles`,
`--traceResolution`, `--listFiles`, diagnostics and build/watch/incremental options.
Inspect/read-only reporting can disclose local paths. Emit, build/watch and incremental
cache options write files/start watchers. TypeScript's native compiler/API evolves;
do not assume every JS-era flag or unstable API is present in the installed version.

Select the actual consumer: the existing database artifact uses `typecheck:db`.
No application tsconfig, React lint stack or empty test app belongs in this task.
For a module error inspect compiler version, manifest, actual import/caller and
resolution output; repair the owning type or generation step, rerun affected consumers
and required checks. Never conceal an error with unsafe casts, skip a test or replace
an assertion with a weaker contract.

Doctor's version probe means INSTALLED/AVAILABLE for the compiler only. The no-emit
artifact command is the offline smoke; its real exit code supplies behavioral
evidence, not application readiness. Missing native assets are MISSING_DEPENDENCY /
PROBE_FAILED, not a reason to fetch a different compiler silently. No cleanup is
needed for no-emit; profiling/tracing output belongs to task-owned temp storage.
Installed package licenses/notices remain intact. Duration is measured only when
executed; native startup and product/device behavior are otherwise NOT MEASURED /
NOT RUN. Existing hygiene tests exercise the compiler API consumer separately.
