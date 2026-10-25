import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localRuntime, localEnvironment, validateContainer, validateLocalStatus, requireLocal, withLocalLock, safeDiagnostic } from './supabase-local.mjs';
import { dockerTarget } from './tool-doctor.mjs';
import { root } from './tool-path.mjs';

const clients = ['psql', 'pg_isready', 'pg_dump', 'pg_restore'];

export function databaseContainer(containers, identity) {
  const databases = containers.filter(item => item.Config?.Labels?.['com.supabase.service'] === 'database');
  requireLocal(databases.length === 1, 'Exactly one owned database container is required.');
  const container = databases[0];
  validateContainer(container, identity.id);
  requireLocal(/^[a-f0-9]{64}$/.test(container.Id), 'Invalid database container ID.');
  requireLocal(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(identity.databaseInstance ?? '')
    && container.Config.Labels['com.supabase.instance'] === identity.databaseInstance, 'Database instance differs from verified local status.');
  requireLocal(container.NetworkSettings.Ports['5432/tcp'].every(binding => /^\d+$/.test(binding.HostPort)
    && Number(binding.HostPort) > 1024 && Number(binding.HostPort) < 65536), 'Invalid local database backend port.');
  return container.Id;
}

export function clientAction(args) {
  if (args.length === 1 && args[0] === 'smoke') return 'smoke';
  if (args.length === 2 && args[0] === 'help' && clients.includes(args[1])) return args[1];
  throw new Error('Use smoke or help <psql|pg_isready|pg_dump|pg_restore>; targets and SQL are fixed.');
}

export async function postgresClients(args, runtime) {
  const action = clientAction(args);
  runtime ??= localRuntime();
  return withLocalLock(() => {
    const target = dockerTarget();
    const status = runtime.status(true);
    requireLocal(status, 'BLOCKED_NO_LOCAL_STACK: this worktree/branch has no managed local stack.');
    validateLocalStatus(status, realpathSync(root), runtime.branch);
    const before = runtime.verify();
    requireLocal(status.identity.id === before.id, 'Stack identity changed during discovery.');
    const databases = status.services?.filter(service => service.service === 'database');
    requireLocal(databases?.length === 1 && databases[0].state === 'running', 'Exactly one running database service is required.');
    const command = (argv, options = {}, expectedStatus = 0, diagnostic) => {
      const result = spawnSync('docker', ['--context', target.context, ...argv], {
        env: localEnvironment(process.env), encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
        shell: false, windowsHide: true, ...options,
      });
      requireLocal(!result.error && !result.signal && result.status === expectedStatus, `PostgreSQL local command failed (exit ${result.status ?? 'unavailable'}); upstream credential-bearing output withheld.`);
      if (diagnostic) requireLocal(diagnostic.test(result.stderr), 'Expected PostgreSQL denial diagnostic was not observed.');
      return result.stdout;
    };
    const ids = command(['container', 'ls', '--filter', `label=com.supabase.stack=${before.id}`, '--format', '{{.ID}}']).trim().split(/\s+/).filter(Boolean);
    requireLocal(ids.length > 0 && ids.every(id => /^[a-f0-9]{12,64}$/.test(id)), 'No valid owned container IDs.');
    const containers = JSON.parse(command(['container', 'inspect', ...ids]));
    const id = databaseContainer(containers, { ...before, databaseInstance: databases[0].id });
    const exec = argv => command(['exec', id, ...argv]);
    if (action !== 'smoke') {
      const help = exec([action, '--help']);
      requireLocal(runtime.verify().id === before.id, 'Local identity changed during discovery.');
      return help;
    }
    const versions = Object.fromEntries(clients.map(client => [client, exec([client, '--version']).trim()]));
    requireLocal(Object.values(versions).every(version => /\b17\./.test(version)), 'Client/server major compatibility requires PostgreSQL 17.');
    exec(['pg_isready', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-t', '3']);
    const sql = exec(['psql', '-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc',
      "BEGIN READ ONLY; SELECT current_database(), current_setting('server_version_num'); COMMIT;"]);
    requireLocal(/postgres\|17\d+/.test(sql), 'Unexpected database/version result.');
    const psql = ['psql', '-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'];
    const absent = "SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nestscout_tool_smoke_denied'), to_regclass('public.nestscout_tool_smoke_forbidden') IS NULL;";
    requireLocal(exec([...psql, '-U', 'postgres', '-Atc', absent]).trim() === 't|t', 'SQL denial fixture names are already in use.');
    command(['exec', '-i', id, ...psql, '-U', 'postgres', '-f', '-'], {
      input: 'BEGIN READ ONLY;\nCREATE TABLE public.nestscout_tool_smoke_forbidden (id integer);\nROLLBACK;\n',
    }, 3, /25006/);
    command(['exec', id, ...psql, '-U', 'nestscout_tool_smoke_denied', '-c', 'SELECT 1;'], {}, 2, /FATAL:\s+role "nestscout_tool_smoke_denied" does not exist/);
    requireLocal(exec([...psql, '-U', 'postgres', '-Atc', absent]).trim() === 't|t', 'SQL denial checks changed the database.');
    const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-pg-clients-'));
    try {
      const connection = ['-w', '-h', '127.0.0.1', '-p', '5432', '-U', 'postgres', '-d', 'postgres'];
      const dump = exec(['pg_dump', ...connection, '--lock-wait-timeout=3s', '--schema-only', '--schema=public']);
      requireLocal(dump.includes('PostgreSQL database dump'), 'Invalid schema dump.');
      writeFileSync(path.join(directory, 'schema.sql'), dump, { mode: 0o600 });
      const archive = command(['exec', id, 'pg_dump', ...connection, '--lock-wait-timeout=3s', '--schema-only', '--schema=public', '--format=custom'], { encoding: 'buffer' });
      requireLocal(archive.subarray(0, 5).toString() === 'PGDMP', 'Invalid custom archive.');
      writeFileSync(path.join(directory, 'schema.dump'), archive, { mode: 0o600 });
      const listing = command(['exec', '-i', id, 'pg_restore', '--list'], { input: archive });
      requireLocal(listing.includes('Archive created at'), 'Invalid archive listing.');
      requireLocal(runtime.verify().id === before.id, 'Local identity changed during diagnostics.');
      return { status: 'PASS', versions, hostNativeInstalled: false, schemaDumpBytes: Buffer.byteLength(dump),
        restore: 'PASS: owned schema archive listed only; no restore',
        denied: ['read-only DDL exit 3 / SQLSTATE 25006', 'unknown role exit 2 / FATAL role does not exist'],
        cleanup: 'PASS: owned dumps removed; SQL denial fixtures absent; no database changes' };
    } finally {
      requireLocal(path.dirname(realpathSync(directory)) === realpathSync(tmpdir()) && !lstatSync(directory).isSymbolicLink(), 'Unsafe PostgreSQL temporary root.');
      rmSync(directory, { recursive: true });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { clientAction(process.argv.slice(2)); console.log(await postgresClients(process.argv.slice(2))); }
  catch (error) { console.error(safeDiagnostic(error)); process.exitCode = 1; }
}
