# PostgreSQL clients

Prefer the PostgreSQL clients already shipped in the verified owned Supabase
database container. No host-native client or second database server is installed.
The canonical [local workflow](supabase.md) retains stack identity, lifecycle,
migrations, type generation and drift ownership. Client discovery is not authority
to connect to an arbitrary local container or hosted database.

## Target verification and execution

`npm run tools:postgresql -- help psql` (or `pg_isready`, `pg_dump`,
`pg_restore`) obtains installed help through a verified owned database container.
`npm run tools:postgresql -- smoke` uses the same path. It requires the current
worktree/branch's existing managed local stack and canonical lock/verification,
checks Docker context, stack label, running state, database service-instance UUID,
immutable container ID and loopback bindings, then invokes the container's native CLI.
The managed endpoint and Docker backend have separate ports; equality is not an
identity check. The instance UUID must match the verified managed database service.
No target/SQL flags are accepted. It does not start or stop any stack.

Without a matching stack the result is BLOCKED_NO_LOCAL_STACK. Containers from
another repository/worktree do not satisfy the prerequisite. Host-native `psql`
presence in doctor is reported separately and never substitutes for ownership.
Use canonical `db:start` only under an authorized bounded local lifecycle task.
The authorized V2 finalization runs the canonical bounded start/stop lifecycle.

| Client / help | Operational families and effects | Default smoke |
| --- | --- | --- |
| `psql --help` | SQL, meta-commands, transaction/session diagnostics; SQL can mutate | `-X -w`, ON_ERROR_STOP, explicit loopback/port/database/user, READ ONLY version/database SELECT |
| `pg_isready --help` | Bounded readiness probe; not authentication proof | Three-second local readiness |
| `pg_dump --help` | Read database, write SQL or archive; schema/data/format selection | Schema-only public SQL and custom archive in owned OS temp |
| `pg_restore --help` | `--list` reads archive; restore mutates target | Lists the just-created owned schema archive through stdin; no restore |

Container clients and server must match PostgreSQL major 17 for this inspected
foundation. All four versions are checked. Canonical ownership is verified again
after smoke. No passwords/connection strings are logged; no hosted fallback,
restoration, reset, credential harvesting or persistent container files occur.
Inherited host PG/connection overrides are removed by the canonical environment.
Do not equate readiness with a successful authenticated SQL operation.
Smoke also verifies an unknown local role is denied (exit 2 / FATAL role does not exist)
and DDL in a read-only transaction is denied (exit 3 / SQLSTATE 25006). It checks
the fixture role/table names are absent before and after; it creates neither.
These same workflows run in the existing isolated Supabase CI job before cleanup.

## Diagnostics, archive handling and limitations

Native [psql](https://www.postgresql.org/docs/current/app-psql.html),
[pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html) and
[pg_isready](https://www.postgresql.org/docs/current/app-pg-isready.html)
references complement installed-version help. Use canonical `db:history`,
`db:drift`, `db:types:check` for migration questions; client SQL is not a competing
schema source. For an approved owned archive, use `pg_restore --list` only after
checking source/version/path; never restore into real/shared data as smoke.
An owned schema archive can be created under a separate approved dump operation.

Wrong stack, branch/root, context, non-loopback port, wrong binding, absent
container and access denial must reject before SQL. PostgreSQL command failures
retain sanitized classification and nonzero exit; credential-bearing upstream
details are withheld. Owned dump files are removed in finally; failed cleanup
fails the operation. Windows/native Linux container-client execution remains
NOT RUN when the worktree stack is absent; deterministic guard fixtures prove
their narrow rejection rules, not real SQL execution or installation.
