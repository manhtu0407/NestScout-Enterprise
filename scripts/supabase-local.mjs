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
  const ports = [config.api.port, config.db.port, config.db.shadow_port, config.studio.port];
  assert.ok(ports.every(port => Number.isInteger(port) && port > 1024 && port < 65536));
  assert.equal(new Set(ports).size, ports.length, 'Local ports must be distinct.');
  assert.equal(config.db.major_version, 17);
  assert.equal(config.db.migrations.enabled, true);
  assert.deepEqual(config.db.migrations.schema_paths, [], 'Migrations are the schema source.');
  assert.equal(config.experimental?.stack, undefined, 'Experimental stack isolation is not verified.');
  return config.project_id;
}

export function validateContainer(container, project, port) {
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project);
  assert.equal(container.State.Running, true, 'Local DB is not running.');
  const bindings = container.NetworkSettings.Ports['5432/tcp'];
  assert.ok(bindings?.length, 'Local DB port must be published on loopback.');
  assert.ok(bindings.every(binding => binding.HostIp === '127.0.0.1' && Number(binding.HostPort) === port));
}

export function validateDockerEndpoint(endpoint) {
  assert.match(endpoint, /^(unix:\/\/\/|npipe:\/\/)/, 'Only a local Docker socket/pipe is allowed.');
}

export function validateLocalStatus(status, port) {
  const api = new URL(status.API_URL ?? status.api?.url);
  assert.equal(api.hostname, '127.0.0.1');
  assert.equal(api.port, String(port));
  assert.equal(api.protocol, 'http:');
  return new URL('/mcp', api).href;
}

export function redactDiagnostic(value) {
  return String(value)
    .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[REDACTED]@')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED]');
}

function main(action) {
  const config = parse(readFileSync(path.join(root, 'supabase/config.toml'), 'utf8'));
  const project = validateLocalConfig(config, existsSync(path.join(root, 'supabase/.temp/project-ref')));
  const containerName = `supabase_db_${project}`;
  const cache = path.join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const lock = path.join(cache, 'supabase-local.lock');
  const ownerFile = path.join(cache, 'supabase-local-owner.json');
  const typesFile = path.join(root, 'supabase/database.types.ts');
  const environment = { ...process.env, DO_NOT_TRACK: '1' };
  for (const name of Object.keys(environment)) {
    if (/^(PG|SUPABASE_|DATABASE_URL$|OPENAI_API_KEY$)/.test(name)) delete environment[name];
  }
  const run = (command, args) => execFileSync(command, args, {
    cwd: root, env: environment, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  validateDockerEndpoint(environment.DOCKER_HOST
    || run('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim());
  const cli = args => run(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'),
    '--workdir', root, '--agent', 'no', ...(args[0] === 'gen' ? [] : ['--network-id', project]), ...args]);
  const verifyDefaultBinding = () => {
    // Probe an inert container before CLI start/reset can publish a credentialed DB.
    const id = run('docker', ['run', '--detach', '--network', project,
      '--label', `com.supabase.cli.project=${project}`, '--publish', `${config.db.shadow_port}:1`,
      '--entrypoint', 'sleep', 'public.ecr.aws/supabase/postgres:17.11.0.006', '60']).trim();
    try {
      const probe = JSON.parse(run('docker', ['inspect', id]))[0];
      const bindings = probe.NetworkSettings.Ports['1/tcp'];
      assert.ok(bindings?.length && bindings.every(binding => binding.HostIp === '127.0.0.1'),
        'BLOCKED: Docker ignores loopback network defaults. CLI start/reset would publish credentials on all interfaces. Use a runtime honoring host_binding_ipv4; do not relax this check.');
    } finally {
      run('docker', ['rm', '--force', id]);
    }
  };
  const inspect = () => JSON.parse(run('docker', ['inspect', containerName]))[0];
  const verify = () => {
    const owner = JSON.parse(readFileSync(ownerFile, 'utf8'));
    const container = inspect();
    assert.equal(owner.root, realpathSync(root), 'Another worktree owns this DB.');
    assert.equal(owner.containerId, container.Id, 'DB was recreated outside this workflow; verify ownership.');
    validateContainer(container, project, config.db.port);
    return container;
  };
  const actions = ['start', 'status', 'reset', 'test', 'types', 'check-types', 'lint', 'drift', 'stop'];
  assert.ok(actions.includes(action), `Use one of: ${actions.join(', ')}`);
  const descriptor = openSync(lock, 'wx');
  closeSync(descriptor);
  try {
    if (action === 'start') {
      const existing = run('docker', ['ps', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.ID}}']).trim();
      if (existing) verify();
      const networks = run('docker', ['network', 'ls', '--filter', `name=^${project}$`, '--format', '{{.Name}}']).trim();
      if (!networks) run('docker', ['network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', project]);
      const network = JSON.parse(run('docker', ['network', 'inspect', project]))[0];
      assert.equal(network.Driver, 'bridge');
      assert.equal(network.Options['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1');
      verifyDefaultBinding();
      try {
        cli(['start', '--exclude', 'realtime,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor']);
        const container = inspect();
        validateContainer(container, project, config.db.port);
        const ids = run('docker', ['ps', '--filter', `label=com.supabase.cli.project=${project}`, '--format', '{{.ID}}']).trim().split(/\s+/);
        for (const service of JSON.parse(run('docker', ['inspect', ...ids]))) {
          for (const bindings of Object.values(service.NetworkSettings.Ports)) {
            assert.ok(!bindings || bindings.every(binding => binding.HostIp === '127.0.0.1'), 'Local service published a non-loopback port.');
          }
        }
        writeFileSync(ownerFile, JSON.stringify({ root: realpathSync(root), containerId: container.Id }));
      } catch (error) {
        try {
          cli(['stop', '--project-id', project]);
        } catch (cleanupError) {
          throw new Error(`Local startup failed; targeted cleanup also failed (exit ${cleanupError.status}). Inspect this project's containers before retrying.`, { cause: error });
        }
        if (existsSync(ownerFile)) unlinkSync(ownerFile);
        throw error;
      }
      console.log(`PASS: started isolated local project ${project}.`);
    } else {
      verify();
      if (action === 'status') {
        const status = JSON.parse(cli(['status', '-o', 'json']));
        if (status.API_URL || status.api?.url) {
          const mcp = validateLocalStatus(status, config.api.port);
          console.log(JSON.stringify({ project, api: new URL('/', mcp).href, mcp, dbPort: config.db.port }));
        } else {
          console.log(JSON.stringify({ project, dbPort: config.db.port, mcp: 'NOT AVAILABLE (database only)' }));
        }
      } else if (action === 'reset') {
        verifyDefaultBinding();
        cli(['db', 'reset', '--local', '--yes']);
        const container = inspect();
        validateContainer(container, project, config.db.port);
        writeFileSync(ownerFile, JSON.stringify({ root: realpathSync(root), containerId: container.Id }));
        console.log('PASS: disposable LOCAL database reset and migrations replayed.');
      } else if (action === 'types' || action === 'check-types') {
        const generated = cli(['gen', 'types', 'typescript', '--local', '--schema', 'public'])
          .replaceAll('\r\n', '\n').replace(/[\t ]+$/gm, '');
        assert.match(generated, /export type Database\s*=/);
        if (action === 'check-types') assert.equal(generated, readFileSync(typesFile, 'utf8'), 'Regenerate local database types.');
        else {
          const temporary = path.join(cache, 'database.types.ts');
          writeFileSync(temporary, generated);
          renameSync(temporary, typesFile);
        }
        console.log(`PASS: local database types ${action === 'types' ? 'generated' : 'match'}.`);
      } else if (action === 'stop') {
        cli(['stop', '--project-id', project]);
        unlinkSync(ownerFile);
        console.log(`PASS: stopped only ${project}; local volumes retained.`);
      } else {
        if (action === 'drift') verifyDefaultBinding();
        const args = {
          test: ['test', 'db', '--local'],
          lint: ['db', 'lint', '--local', '--schema', 'public', '--fail-on', 'warning'],
          drift: ['db', 'diff', '--local', '--schema', 'public', '--use-migra'],
        }[action];
        const result = cli(args);
        console.log(result.trim());
        if (action === 'drift') assert.equal(result.trim(), '', 'Local schema drift detected.');
      }
    }
  } finally {
    unlinkSync(lock);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 3, 'Additional flags and target overrides are forbidden.');
    main(process.argv[2]);
  } catch (error) {
    console.error(error.status === undefined ? error.message
      : `Local command failed (exit ${error.status}): ${redactDiagnostic(error.stderr || error.stdout)}`);
    process.exitCode = 1;
  }
}
