# Supabase CLI and local database tooling

Tier A. Triggers: local stack, pgTAP, migration history/drift, schema lint, generated
database types and local MCP contracts. Prefer the existing isolation executor,
not a second Compose stack or copied schema. Vendor/source: [supabase/cli](https://github.com/supabase/cli),
MIT; [CLI reference](https://supabase.com/docs/reference/cli/introduction) and
[testing/linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting).
Version owner is `package.json` / lockfile. Setup and resource ownership are in
[Supabase development](../supabase-development.md); preserve its exact trust boundary.

`npm ci --ignore-scripts` installs the CLI; Docker is a separate host prerequisite.
Windows/Linux x64 is the inspected repo matrix. Missing CLI dependency, unavailable
Engine and missing local managed stack are distinct readiness gaps. Network/image
downloads may be needed for initial stack start; inspect local images and approved
resource budget first. Doctor never starts the database or fetches images.

## Native discovery and existing integration

Native help/version can have side effects: the inspected CLI initializes telemetry
and an update cache by default. For read-only discovery, pass
`SUPABASE_TELEMETRY_DISABLED=1`, `SUPABASE_NO_UPDATE_NOTIFIER=1`, `DO_NOT_TRACK=1`
only in the child process environment. The doctor's `probe` / `discoveryEnvironment`
helpers do this without editing global settings. Their actual CLI regression uses
an owned temporary `SUPABASE_HOME` and asserts that version/help leave it empty.
The commands below assume that child environment. `--agent no` prevents automatic
agent detection; it does not disable telemetry on its own. Do not run a global
`telemetry disable` command to work around a read-only boundary.
See upstream [telemetry](https://github.com/supabase/cli/blob/develop/apps/cli/docs/analytics.md)
and [home/update behavior](https://github.com/supabase/cli/blob/develop/apps/cli/docs/supabase-home.md).

```sh
node node_modules/supabase/dist/supabase.js --version
node node_modules/supabase/dist/supabase.js --agent no --help
node node_modules/supabase/dist/supabase.js --agent no db --help
node node_modules/supabase/dist/supabase.js --agent no migration --help
```

On Windows or Linux, the existing helper can supply the child environment directly
while preserving the complete native command surface. EXAMPLE for `db --help`:

```sh
node --input-type=module -e 'import {probe} from "./scripts/tool-doctor.mjs"; const r=probe(process.execPath,["node_modules/supabase/dist/supabase.js","--agent","no","db","--help"]); process.stdout.write(r.stdout ?? ""); process.exitCode=r.status ?? 1;'
```

CLI namespaces change: installed help is required before using unfamiliar flags.
Local command families include start/status/stop, db reset/lint/diff/dump, migration
new/list/up/down/repair, test db, gen types and inspect database diagnostics.
Remote account/project/link, db push/pull, functions, storage, secrets, branches and
network restriction families are discoverable but do not grant hosted-write authority.
Some diagnostics can default to linked targets: use canonical local executors here.

The manifest is the command source; this workflow map is not a second implementation:

| Intent | Canonical script | Effects / boundary |
| --- | --- | --- |
| Validate executor contracts without Docker | `verify:supabase` | Isolated deterministic positive/negative tests |
| Check existing owned stack | `db:status` | Read-only status/identity; missing stack is not AVAILABLE |
| Start / stop | `db:start`, `db:stop` | Local owned lifecycle; may download/start many services |
| Replay migrations | `db:reset` | Destructive only inside verified disposable local stack |
| History / drift / SQL lint | `db:history`, `db:drift`, `db:lint` | Existing guarded local targets; drift may use shadow resources |
| Security / MCP behavior | `db:test`, `db:mcp:test` | Real local integration with its own prerequisites |
| Generate / compare types | `db:types`, `db:types:check` | Artifact write versus comparison against owned local DB |
| Compile artifact | `typecheck:db` | No-emit local compiler; no Engine needed |

## Workflow, recovery and smoke

Inspect exact worktree/branch, config and linked/override state. Use `verify:supabase`
and `typecheck:db` for a low-resource offline foundation smoke; these do not prove
running SQL integration. For an authorized full local DB task, inspect Docker first,
start only through `db:start`, validate identity/status, run history/test/lint/drift /
types checks, then stop only that task's stack through `db:stop` as documented.
Do not reset or stop another worktree's stack. Product schema/data is absent here.

On a failure retain sanitized error class/exit, determine whether config, daemon,
stack ownership, migrations, SQL policy or generated artifact owns it. Repair that
layer and rerun the consumer, not a replacement harness. Never bypass local guards,
print connection credentials, suppress denied-role tests or apply hosted migrations.
MCP transport availability is not product agent authorization or live agent compliance.
Standalone psql is optional; it does not supersede the executor's local target guard.
Integration NOT RUN stays separate from deterministic PASS. Stack resource costs can
be material on this laptop; startup/resource use is NOT MEASURED unless observed.
