import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, realpathSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { root } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { discoverLocalProviders, providerSourceReport } from './kael-local-providers.mjs';

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

export function databaseTestDiagnostic(error, tests) {
  const output = (String(error?.stdout ?? '') + '\n' + String(error?.stderr ?? ''))
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const descriptions = new Set(tests.flatMap(test => [...test.content.matchAll(/'((?:''|[^'])*)'/g)]
    .map(match => match[1].replaceAll("''", "'"))));
  const failures = [...output.matchAll(/not ok\s+(\d+)\s*-\s*([^\r\n]+)/g)].map(match => ({
    assertion: Number(match[1]),
    description: descriptions.has(match[2].trim()) ? match[2].trim() : 'Description withheld; not a static repository test label.',
  }));
  const files = tests.filter(test => output.includes(test.file)).map(test => test.file);
  const categories = [
    ['connection_refused', /connection refused|ECONNREFUSED/i],
    ['timeout', /timed? out|timeout|deadline exceeded/i],
    ['artifact_resolution', /pull access denied|failed to pull|failed to download|failed to fetch|TLS handshake|HTTP 429/i],
    ['missing_dependency', /not found|No such file|does not exist|not installed/i],
    ['permission_denied', /permission denied|access denied/i],
    ['sql_assertion', /not ok\s+\d|Failed\s+\d+.*(?:test|subtest)|Result: FAIL/i],
  ].filter(([, pattern]) => pattern.test(output)).map(([name]) => name);
  return { exit: Number.isInteger(error?.status) ? error.status : null, failures, files, categories };
}

export function isMissingStack(error) {
  if (error?.status !== 1) return false;
  try {
    const response = JSON.parse(String(error.stdout));
    return response._tag === 'Error' && response.error?.code === 'ExperimentalStackStatusError'
      && response.error.message === 'No managed stack exists for the selected project.';
  } catch { return false; }
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

const localKaelPrefix = 'NESTSCOUT_LOCAL_';
const localKaelSettings = [
  'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'KAEL_ANTHROPIC_MODEL', 'KAEL_MODEL_ROUTE',
  'PERPLEXITY_API_KEY', 'KAEL_WEB_SEARCH',
  'KAEL_DEVELOPER_PILOT', 'KAEL_DEVELOPER_PILOT_ID', 'KAEL_PILOT_GENERATION', 'KAEL_PILOT_WORKER_ID',
];

export function scopedKaelEnvironment(config, settings) {
  const { functions: { kael, ...otherFunctions } = {}, ...otherConfig } = config;
  const bindings = kael?.env;
  requireLocal(bindings && Object.keys(kael).length === 1 && Object.keys(bindings).length === localKaelSettings.length
    && localKaelSettings.every(name => bindings[name] === `env(${localKaelPrefix}${name})`),
  'Kael local bindings must target only the default Kael function and its approved settings.');
  requireLocal(!JSON.stringify({ ...otherConfig, functions: otherFunctions }).toUpperCase().includes(localKaelPrefix),
    'Kael local bindings must not appear in shared or other function configuration.');
  return Object.fromEntries(localKaelSettings.flatMap(name =>
    settings[name] ? [[localKaelPrefix + name, settings[name]]] : []));
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
  return Object.fromEntries(Object.entries({ ...gitEnvironment(source), DO_NOT_TRACK: '1' }).filter(([name]) =>
    !/^(PG|SUPABASE_|DATABASE_URL$|OPENAI_API_KEY$|NESTSCOUT_LOCAL_|KAEL_|DEEPSEEK_|ANTHROPIC_|PERPLEXITY_)/i.test(name))
    .map(([name, value]) => [/^DOCKER_/i.test(name) ? name.toUpperCase() : name, value]));
}

export function safeEndpoints(endpoints) {
  const allowed = ['database.sql', 'rest.http', 'auth.http', 'storage.http', 'studio.http', 'pgmeta.http'];
  return Object.fromEntries(Object.entries(endpoints).filter(([name]) => allowed.includes(name)).map(([name, value]) => [name, {
    protocol: value.protocol, address: value.address, port: value.port, url: value.url,
  }]));
}

export function localRuntime() {
  const config = parse(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
  validateLocalConfig(config, existsSync(path.join(root, 'supabase/.temp/project-ref')));
  validateLocalFiles(root);
  const environment = localEnvironment(process.env);
  const run = (command, args, env = environment) => execFileSync(command, args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (environment.DOCKER_HOST) validateDockerEndpoint(environment.DOCKER_HOST);
  validateDockerEndpoint(run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim());
  requireLocal(realpathSync(run('git', ['rev-parse', '--show-toplevel']).trim()) === realpathSync(root), 'Git root does not match this checkout.');
  const branch = run('git', ['symbolic-ref', 'HEAD']).trim();
  const runCli = (args, env) => {
    validateLocalFiles(root);
    return run(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), '--workdir', root, '--agent', 'no', ...args], env);
  };
  const cli = args => runCli(args);
  const status = (allowMissing = false) => {
    try { return JSON.parse(cli(['stack', 'status', '--output-format', 'json'])); }
    catch (error) {
      if (allowMissing && isMissingStack(error)) return null;
      throw error;
    }
  };
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
    const current = status(true);
    if (!current) return false;
    validateLocalStatus(current, realpathSync(root), branch, false);
    requireLocal(current.runtime === 'docker', 'Only an existing local Docker stack can be stopped.');
    cli(['stack', 'stop', '--stack-id', current.identity.id, '--output-format', 'json']);
    const remaining = run('docker', ['ps', '--filter', `label=com.supabase.stack=${current.identity.id}`, '--format', '{{.ID}}']).trim();
    requireLocal(!remaining, 'Local stack containers remain running after stop.');
    const stopped = status();
    validateLocalStatus(stopped, realpathSync(root), branch, false);
    requireLocal(stopped.identity.id === current.identity.id && stopped.lifecycle !== 'running', 'Local owner still reports a running stack after stop.');
    return true;
  };
  const serveKael = (settings = {}, onStart = () => {}) => {
    const current = verify();
    const active = run('docker', ['ps', '--filter', `label=com.supabase.stack=${current.id}`,
      '--filter', 'label=com.supabase.service=functions', '--format', '{{.ID}}']).trim();
    requireLocal(!active, 'The verified stack already has a running Edge worker. Stop that launcher before changing its configuration.');
    for (const directory of ['supabase/functions', 'supabase/functions/kael']) {
      requireLocal(!lstatSync(path.join(root, directory, '.env'), { throwIfNoEntry: false }),
        'Remove the shared or Kael functions dotenv override before starting the isolated Kael runtime.');
    }
    const scoped = scopedKaelEnvironment(parse(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')), settings);
    onStart();
    runCli(['functions', 'serve', 'kael'], { ...environment, ...scoped });
  };
  return { cli, status, verify, branch, stop, serveKael };
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

async function main(action, enableProviders) {
  const actions = ['start', 'status', 'reset', 'test', 'types', 'check-types', 'lint', 'drift', 'history', 'stop', 'serve-kael', 'kael-credentials'];
  requireLocal(actions.includes(action), `Use one of: ${actions.join(', ')}`);
  if (action === 'kael-credentials') {
    console.log(JSON.stringify(providerSourceReport(discoverLocalProviders())));
    return;
  }
  const runtime = localRuntime();
  if (action === 'serve-kael') {
    const source = enableProviders ? discoverLocalProviders() : { status: 'offline', env: {} };
    requireLocal(!enableProviders || source.status === 'source_loaded',
      `Kael credential provisioning: ${source.status}. Check npm run kael:credentials and the private provider source.`);
    runtime.serveKael(source.env, () => console.log(JSON.stringify(providerSourceReport(source))));
    return;
  }
  await withLocalLock(() => {
    if (action === 'start') {
      const before = runtime.status(true);
      if (before) validateLocalStatus(before, realpathSync(root), runtime.branch, false);
      runtime.cli(['stack', 'start', '--runtime', 'docker', '--preparation', 'on-demand', '--frozen',
        '--exclude', 'realtime,functions,mail,analytics,pooler', '--output-format', 'json']);
      const current = runtime.verify();
      requireLocal(!before || current.id === before.identity.id, 'Stack identity changed during startup.');
      console.log('PASS: current worktree/branch stack started; all Docker ports bind to loopback.');
      return;
    }
    if (action === 'stop') {
      console.log(runtime.stop()
        ? 'PASS: stopped only this worktree/branch stack; no task containers running; local data retained.'
        : 'PASS: no managed stack exists for this worktree/branch; no resources targeted.');
      return;
    }
    const before = runtime.verify();
    if (action === 'status') {
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
      let result;
      try {
        result = runtime.cli(args);
      } catch (error) {
        if (action === 'test') {
          const directory = path.join(root, 'supabase/tests/database');
          const tests = readdirSync(directory).filter(file => /^[a-z0-9-]+\.test\.sql$/.test(file))
            .map(file => ({ file, content: readFileSync(path.join(directory, file), 'utf8') }));
          console.error(JSON.stringify(databaseTestDiagnostic(error, tests)));
        }
        throw error;
      }
      console.log(redactDiagnostic(result.trim()));
      if (action === 'drift') requireLocal(result.trim() === '', 'Local schema drift detected.');
      console.log(`PASS: local ${action}.`);
    }
    requireLocal(runtime.verify().id === before.id, 'Stack identity changed during operation.');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, option, ...extra] = process.argv.slice(2);
    const enableProviders = action === 'serve-kael' && option === '--providers';
    requireLocal(!extra.length && (option === undefined || enableProviders), 'Additional flags and target overrides are forbidden.');
    await main(action, enableProviders);
  } catch (error) {
    console.error(safeDiagnostic(error));
    process.exitCode = 1;
  }
}
