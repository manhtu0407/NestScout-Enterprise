import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, realpathSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { root } from './tool-path.mjs';

class LocalGuardError extends Error {}

export function requireLocal(condition, message) {
  if (!condition) throw new LocalGuardError(message);
}

export function safeDiagnostic(error) {
  if (error instanceof LocalGuardError) return error.message;
  const code = ['EEXIST', 'ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ECONNREFUSED', 'ERR_ASSERTION'].includes(error?.code) ? error.code : 'UPSTREAM_ERROR';
  const status = Number.isInteger(error?.status) ? `; exit ${error.status}` : '';
  return `Local operation failed (${code}${status}); credential-bearing subprocess/upstream detail withheld.`;
}

export function validateLocalConfig(config, linked) {
  requireLocal(!linked, 'Unlink this checkout before using the disposable local workflow.');
  requireLocal(/^nestscout-enterprise-[a-z0-9-]+$/.test(config.project_id), 'Invalid disposable project ID.');
  requireLocal(config.db.major_version === 17, 'The verified database major version is 17.');
  requireLocal(config.db.migrations.enabled === true && config.db.migrations.schema_paths?.length === 0, 'Migrations are the schema source.');
  requireLocal(config.experimental?.stack === true, 'Use the verified managed stack runtime.');
  requireLocal(JSON.stringify(config.api.schemas) === JSON.stringify(['public', 'graphql_public']), 'Review SQL security coverage before changing exposed schemas.');
  for (const section of [config.api, config.db, config.studio, config.db.pooler, config.local_smtp]) {
    requireLocal(section?.port === undefined, 'Managed stacks allocate isolated loopback ports.');
  }
  requireLocal(config.db.shadow_port === undefined, 'Managed stacks allocate isolated shadow ports.');
  return config.project_id;
}

export function validateDockerEndpoint(endpoint) {
  requireLocal(/^(unix:\/\/\/[^\s]+|npipe:\/\/\/\/\.\/pipe\/[^\s]+)$/.test(endpoint), 'Only a local Docker socket/pipe is allowed.');
}

export function validateLocalStatus(status, expectedRoot, branch, running = true) {
  requireLocal(/^[a-f0-9]{64}$/.test(status.identity?.id ?? ''), 'Invalid stack identity.');
  requireLocal(status.identity.project_root === expectedRoot, 'Another worktree owns this stack.');
  requireLocal(status.identity.branch_context === branch, 'Another branch owns this stack.');
  if (!running) return;
  requireLocal(status.runtime === 'docker', 'Only the verified Docker runtime is allowed.');
  requireLocal(status.owner === 'reachable', 'Local stack owner is unavailable.');
  requireLocal(status.lifecycle === 'running', 'Start the local stack first.');
  requireLocal(status.endpoints?.['database.sql'], 'Missing local DB endpoint.');
  for (const endpoint of Object.values(status.endpoints)) {
    const url = new URL(endpoint.url);
    requireLocal(endpoint.address === '127.0.0.1' && url.hostname === '127.0.0.1', 'Only loopback endpoints are allowed.');
    requireLocal(['tcp:', 'http:'].includes(url.protocol), 'Unexpected local endpoint protocol.');
    requireLocal(!url.username && !url.password && !url.search && !url.hash && url.pathname === (url.protocol === 'tcp:' ? '' : '/'), 'Status endpoints must not contain credentials or URL overrides.');
    requireLocal(Number.isInteger(endpoint.port) && endpoint.port > 1024 && endpoint.port < 65536 && url.port === String(endpoint.port), 'Invalid local endpoint port.');
  }
  const api = status.endpoints['rest.http'];
  requireLocal(api && api.protocol === 'http', 'Missing local API endpoint.');
  return new URL('/mcp', api.url).href;
}

export function validateContainer(container, stackId) {
  requireLocal(container.Config.Labels['com.supabase.stack'] === stackId, 'Container belongs to another stack.');
  requireLocal(container.State.Running === true, 'Local container is not running.');
  requireLocal(container.HostConfig?.NetworkMode && container.HostConfig.NetworkMode !== 'host', 'Host networking is outside the isolated stack contract.');
  if (container.Config.Labels['com.supabase.service'] === 'database') {
    requireLocal(container.NetworkSettings.Ports['5432/tcp']?.length, 'The database must publish an inspectable loopback binding.');
  }
  for (const bindings of Object.values(container.NetworkSettings.Ports)) {
    requireLocal(!bindings || bindings.every(binding => binding.HostIp === '127.0.0.1'),
      'Local service published a non-loopback port.');
  }
}

export function redactDiagnostic(value) {
  return String(value)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\bBearer\s+[^\s"',;}]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:["']?)(?:[a-z_]*(?:password|passwd|token|secret|api_key|apikey|authorization|service_role_key|publishable_key))["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

export function validateLocalFiles(directory) {
  for (const name of ['supabase/.temp/project-ref', 'supabase/.link.json']) {
    requireLocal(!existsSync(path.join(directory, name)), 'Unlink this checkout before local operations.');
  }
  for (const folder of [directory, path.join(directory, 'supabase')]) {
    requireLocal(!readdirSync(folder).some(name => /^\.env(?:\.|$)/i.test(name) && name !== '.env.example'), 'Remove local dotenv target overrides before local operations.');
  }
}

export function localEnvironment(source) {
  return Object.fromEntries(Object.entries({ ...source, DO_NOT_TRACK: '1' }).filter(([name]) =>
    !/^(PG|SUPABASE_|DATABASE_URL$|OPENAI_API_KEY$|GIT_(?:DIR$|WORK_TREE$|COMMON_DIR$|INDEX_FILE$|CONFIG))/i.test(name))
    .map(([name, value]) => [/^DOCKER_/i.test(name) ? name.toUpperCase() : name, value]));
}

export function safeEndpoints(endpoints) {
  const allowed = ['database.sql', 'rest.http', 'auth.http', 'studio.http', 'pgmeta.http'];
  return Object.fromEntries(Object.entries(endpoints).filter(([name]) => allowed.includes(name)).map(([name, value]) => [name, {
    protocol: value.protocol, address: value.address, port: value.port, url: value.url,
  }]));
}

export function localRuntime() {
  const config = parse(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
  validateLocalConfig(config, existsSync(path.join(root, 'supabase/.temp/project-ref')));
  validateLocalFiles(root);
  const environment = localEnvironment(process.env);
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (environment.DOCKER_HOST) validateDockerEndpoint(environment.DOCKER_HOST);
  validateDockerEndpoint(run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim());
  requireLocal(realpathSync(run('git', ['rev-parse', '--show-toplevel']).trim()) === realpathSync(root), 'Git root does not match this checkout.');
  const branch = run('git', ['symbolic-ref', 'HEAD']).trim();
  const cli = args => {
    validateLocalFiles(root);
    return run(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), '--workdir', root, '--agent', 'no', ...args]);
  };
  const status = () => JSON.parse(cli(['stack', 'status', '--output-format', 'json']));
  const verify = () => {
    const current = status();
    const mcp = validateLocalStatus(current, realpathSync(root), branch);
    const ids = run('docker', ['ps', '--filter', `label=com.supabase.stack=${current.identity.id}`, '--format', '{{.ID}}']).trim();
    requireLocal(ids, 'Missing local containers.');
    const containers = JSON.parse(run('docker', ['inspect', ...ids.split(/\s+/)]));
    for (const container of containers) validateContainer(container, current.identity.id);
    requireLocal(containers.some(container => container.Config.Labels['com.supabase.service'] === 'database'), 'Missing local database container.');
    return { id: current.identity.id, branch, mcp, endpoints: safeEndpoints(current.endpoints) };
  };
  const stop = () => {
    const current = status();
    validateLocalStatus(current, realpathSync(root), branch, false);
    requireLocal(current.runtime === 'docker', 'Only an existing local Docker stack can be stopped.');
    cli(['stack', 'stop', '--stack-id', current.identity.id, '--output-format', 'json']);
    const remaining = run('docker', ['ps', '--filter', `label=com.supabase.stack=${current.identity.id}`, '--format', '{{.ID}}']).trim();
    requireLocal(!remaining, 'Local stack containers remain running after stop.');
    const stopped = status();
    validateLocalStatus(stopped, realpathSync(root), branch, false);
    requireLocal(stopped.identity.id === current.identity.id && stopped.lifecycle !== 'running', 'Local owner still reports a running stack after stop.');
  };
  return { cli, status, verify, branch, stop };
}

export async function withLocalLock(operation, directory = root) {
  const cache = path.join(directory, '.cache');
  mkdirSync(cache, { recursive: true });
  const lock = path.join(cache, 'supabase-local.lock');
  const lease = randomUUID();
  const descriptor = openSync(lock, 'wx', 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), lease }));
  } finally { closeSync(descriptor); }
  try { return await operation(); } finally {
    requireLocal(JSON.parse(readFileSync(lock, 'utf8')).lease === lease, 'Local lock ownership changed; inspect active processes before cleanup.');
    unlinkSync(lock);
  }
}

async function main(action) {
  const actions = ['start', 'status', 'reset', 'test', 'types', 'check-types', 'lint', 'drift', 'history', 'stop'];
  requireLocal(actions.includes(action), `Use one of: ${actions.join(', ')}`);
  const runtime = localRuntime();
  await withLocalLock(() => {
    if (action === 'start') {
      const before = runtime.status();
      validateLocalStatus(before, realpathSync(root), runtime.branch, false);
      runtime.cli(['stack', 'start', '--runtime', 'docker', '--preparation', 'on-demand', '--frozen',
        '--exclude', 'realtime,storage,functions,mail,analytics,pooler', '--output-format', 'json']);
      requireLocal(runtime.verify().id === before.identity.id, 'Stack identity changed during startup.');
      console.log('PASS: current worktree/branch stack started; all Docker ports bind to loopback.');
      return;
    }
    if (action === 'stop') {
      runtime.stop();
      console.log('PASS: stopped only this worktree/branch stack; no task containers running; local data retained.');
      return;
    }
    const before = runtime.verify();
    if (action === 'status') {
      // Never log CLI status.env: it contains local passwords and API keys.
      console.log(JSON.stringify(before));
    } else if (action === 'types' || action === 'check-types') {
      const generated = runtime.cli(['gen', 'types', 'typescript', '--local', '--schema', 'public'])
        .replaceAll('\r\n', '\n').replace(/[\t ]+$/gm, '');
      requireLocal(/export type Database\s*=/.test(generated), 'Invalid generated database types.');
      const typesFile = path.join(root, 'supabase/database.types.ts');
      if (action === 'check-types') requireLocal(generated === readFileSync(typesFile, 'utf8'), 'Regenerate local database types.');
      else {
        const temporary = path.join(root, '.cache/database.types.ts');
        writeFileSync(temporary, generated);
        renameSync(temporary, typesFile);
      }
      console.log(`PASS: local database types ${action === 'types' ? 'generated' : 'match'}.`);
    } else {
      const args = {
        reset: ['db', 'reset', '--local', '--yes'],
        test: ['test', 'db', '--local'],
        lint: ['db', 'lint', '--local', '--schema', 'public', '--fail-on', 'warning'],
        drift: ['db', 'diff', '--local', '--schema', 'public', '--use-pg-delta', '--strict-coverage'],
        history: ['migration', 'list', '--local'],
      }[action];
      const result = runtime.cli(args);
      console.log(redactDiagnostic(result.trim()));
      if (action === 'drift') requireLocal(result.trim() === '', 'Local schema drift detected.');
      console.log(`PASS: local ${action}.`);
    }
    requireLocal(runtime.verify().id === before.id, 'Stack identity changed during operation.');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    requireLocal(process.argv.length === 3, 'Additional flags and target overrides are forbidden.');
    await main(process.argv[2]);
  } catch (error) {
    console.error(safeDiagnostic(error));
    process.exitCode = 1;
  }
}
