import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { root } from './tool-path.mjs';

export function validateLocalConfig(config, linked) {
  assert.equal(linked, false, 'Unlink this checkout before using the disposable local workflow.');
  assert.match(config.project_id, /^nestscout-enterprise-[a-z0-9-]+$/);
  assert.equal(config.db.major_version, 17);
  assert.equal(config.db.migrations.enabled, true);
  assert.deepEqual(config.db.migrations.schema_paths, [], 'Migrations are the schema source.');
  assert.equal(config.experimental?.stack, true, 'Use the verified managed stack runtime.');
  for (const section of [config.api, config.db, config.studio, config.db.pooler, config.local_smtp]) {
    assert.equal(section?.port, undefined, 'Managed stacks allocate isolated loopback ports.');
  }
  assert.equal(config.db.shadow_port, undefined);
  return config.project_id;
}

export function validateDockerEndpoint(endpoint) {
  assert.match(endpoint, /^(unix:\/\/\/[^\s]+|npipe:\/\/\/\/\.\/pipe\/[^\s]+)$/, 'Only a local Docker socket/pipe is allowed.');
}

export function validateLocalStatus(status, expectedRoot, branch, running = true) {
  assert.match(status.identity?.id ?? '', /^[a-f0-9]{64}$/);
  assert.equal(status.identity.project_root, expectedRoot, 'Another worktree owns this stack.');
  assert.equal(status.identity.branch_context, branch, 'Another branch owns this stack.');
  if (!running) return;
  assert.equal(status.runtime, 'docker');
  assert.equal(status.owner, 'reachable', 'Local stack owner is unavailable.');
  assert.equal(status.lifecycle, 'running', 'Start the local stack first.');
  assert.ok(status.endpoints?.['database.sql'], 'Missing local DB endpoint.');
  for (const endpoint of Object.values(status.endpoints)) {
    const url = new URL(endpoint.url);
    assert.equal(endpoint.address, '127.0.0.1');
    assert.equal(url.hostname, '127.0.0.1');
    assert.ok(['tcp:', 'http:'].includes(url.protocol));
    assert.equal(url.username + url.password, '', 'Status endpoints must not contain credentials.');
    assert.ok(Number.isInteger(endpoint.port) && endpoint.port > 1024 && endpoint.port < 65536);
    assert.equal(url.port, String(endpoint.port));
  }
  const api = status.endpoints['rest.http'];
  assert.ok(api && api.protocol === 'http', 'Missing local API endpoint.');
  return new URL('/mcp', api.url).href;
}

export function validateContainer(container, stackId) {
  assert.equal(container.Config.Labels['com.supabase.stack'], stackId);
  assert.equal(container.State.Running, true);
  for (const bindings of Object.values(container.NetworkSettings.Ports)) {
    assert.ok(!bindings || bindings.every(binding => binding.HostIp === '127.0.0.1'),
      'Local service published a non-loopback port.');
  }
}

export function redactDiagnostic(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[REDACTED]@')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

export function localRuntime() {
  const config = parse(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
  validateLocalConfig(config, existsSync(path.join(root, 'supabase/.temp/project-ref')));
  // CLI dotenv files can override the selected runtime, ports, and database target.
  for (const name of ['.env', '.env.local', 'supabase/.env']) {
    assert.equal(existsSync(path.join(root, name)), false, `Remove target overrides from ${name} before local operations.`);
  }
  const environment = { ...process.env, DO_NOT_TRACK: '1' };
  for (const name of Object.keys(environment)) {
    if (/^(PG|SUPABASE_|DATABASE_URL$|OPENAI_API_KEY$)/.test(name)) delete environment[name];
  }
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (environment.DOCKER_HOST) validateDockerEndpoint(environment.DOCKER_HOST);
  validateDockerEndpoint(run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim());
  const branch = run('git', ['symbolic-ref', 'HEAD']).trim();
  const cli = args => run(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'),
    '--workdir', root, '--agent', 'no', ...args]);
  const status = () => JSON.parse(cli(['stack', 'status', '--output-format', 'json']));
  const verify = () => {
    const current = status();
    const mcp = validateLocalStatus(current, realpathSync(root), branch);
    const ids = run('docker', ['ps', '--filter', `label=com.supabase.stack=${current.identity.id}`, '--format', '{{.ID}}']).trim();
    assert.ok(ids, 'Missing local containers.');
    const containers = JSON.parse(run('docker', ['inspect', ...ids.split(/\s+/)]));
    for (const container of containers) validateContainer(container, current.identity.id);
    assert.ok(containers.some(container => container.Config.Labels['com.supabase.service'] === 'database'));
    return { id: current.identity.id, branch, mcp, endpoints: current.endpoints };
  };
  return { cli, status, verify, branch };
}

export async function withLocalLock(operation) {
  const cache = path.join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const lock = path.join(cache, 'supabase-local.lock');
  closeSync(openSync(lock, 'wx'));
  try { return await operation(); } finally { unlinkSync(lock); }
}

async function main(action) {
  const actions = ['start', 'status', 'reset', 'test', 'types', 'check-types', 'lint', 'drift', 'history', 'stop'];
  assert.ok(actions.includes(action), `Use one of: ${actions.join(', ')}`);
  const runtime = localRuntime();
  await withLocalLock(() => {
    if (action === 'start') {
      const before = runtime.status();
      validateLocalStatus(before, realpathSync(root), runtime.branch, false);
      runtime.cli(['stack', 'start', '--runtime', 'docker', '--preparation', 'on-demand', '--frozen',
        '--exclude', 'realtime,storage,functions,mail,analytics,pooler', '--output-format', 'json']);
      assert.equal(runtime.verify().id, before.identity.id);
      console.log('PASS: current worktree/branch stack started; all Docker ports bind to loopback.');
      return;
    }
    const before = runtime.verify();
    if (action === 'status') {
      // Never log CLI status.env: it contains local passwords and API keys.
      console.log(JSON.stringify(before));
    } else if (action === 'types' || action === 'check-types') {
      const generated = runtime.cli(['gen', 'types', 'typescript', '--local', '--schema', 'public'])
        .replaceAll('\r\n', '\n').replace(/[\t ]+$/gm, '');
      assert.match(generated, /export type Database\s*=/);
      const typesFile = path.join(root, 'supabase/database.types.ts');
      if (action === 'check-types') assert.equal(generated, readFileSync(typesFile, 'utf8'), 'Regenerate local database types.');
      else {
        const temporary = path.join(root, '.cache/database.types.ts');
        writeFileSync(temporary, generated);
        renameSync(temporary, typesFile);
      }
      console.log(`PASS: local database types ${action === 'types' ? 'generated' : 'match'}.`);
    } else if (action === 'stop') {
      runtime.cli(['stack', 'stop', '--stack-id', before.id, '--output-format', 'json']);
      console.log('PASS: stopped only this worktree/branch stack; local data retained.');
      return;
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
      if (action === 'drift') assert.equal(result.trim(), '', 'Local schema drift detected.');
      console.log(`PASS: local ${action}.`);
    }
    assert.equal(runtime.verify().id, before.id, 'Stack identity changed during operation.');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Additional flags and target overrides are forbidden.');
    await main(process.argv[2]);
  } catch (error) {
    console.error(error.status === undefined ? error.message
      : `Local command failed (exit ${error.status}): ${redactDiagnostic(error.stderr || 'Inspect CLI/runtime readiness; raw credential-bearing output withheld.')}`);
    process.exitCode = 1;
  }
}
