import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, unlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { validateLocalConfig, validateContainer, validateLocalStatus, validateDockerEndpoint, redactDiagnostic, withLocalLock, validateLocalFiles, localEnvironment, safeDiagnostic, safeEndpoints, isMissingStack } from './supabase-local.mjs';
import { localTools, safeToolResult } from './supabase-mcp.mjs';

const config = parse(readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8'));
const stackId = 'a'.repeat(64);
const status = {
  identity: { id: stackId, project_root: 'fixture-root', branch_context: 'refs/heads/fixture' },
  runtime: 'docker', owner: 'reachable', lifecycle: 'running',
  endpoints: {
    'database.sql': { address: '127.0.0.1', port: 25001, url: 'tcp://127.0.0.1:25001' },
    'rest.http': { protocol: 'http', address: '127.0.0.1', port: 25002, url: 'http://127.0.0.1:25002' },
  },
};
const validate = value => validateLocalStatus(value, 'fixture-root', 'refs/heads/fixture');

test('only the pinned CLI missing-stack response permits cold start or absent-stack stop', () => {
  const response = { _tag: 'Error', error: { code: 'ExperimentalStackStatusError', message: 'No managed stack exists for the selected project.' } };
  const failure = { status: 1, stdout: JSON.stringify(response) };
  assert.equal(isMissingStack(failure), true);
  for (const other of [{ ...failure, status: 2 }, { ...failure, stdout: '' },
    { ...failure, stdout: JSON.stringify({ ...response, _tag: 'Unknown' }) },
    { ...failure, stdout: JSON.stringify({ error: { ...response.error, code: 'OtherFailure' } }) },
    { ...failure, stdout: JSON.stringify({ error: { ...response.error, message: 'Owner unavailable' } }) }]) {
    assert.equal(isMissingStack(other), false);
  }
});

test('reject target overrides before Docker operations', () => {
  for (const [script, args] of [['supabase-local.mjs', ['reset', '--linked']], ['supabase-mcp.mjs', ['--url=https://example.invalid']]]) {
    const result = spawnSync(process.execPath,
      [fileURLToPath(new URL(script, import.meta.url)), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /overrides are forbidden/);
  }
});

test('accept isolated config and reject linked, legacy, static-port and declarative targets', () => {
  assert.equal(validateLocalConfig(config, false), config.project_id);
  assert.throws(() => validateLocalConfig(config, true));
  assert.throws(() => validateLocalConfig({ ...config, project_id: 'nestscout' }, false));
  assert.throws(() => validateLocalConfig({ ...config, db: { ...config.db, port: 54322 } }, false));
  assert.throws(() => validateLocalConfig({ ...config, experimental: { stack: false } }, false));
  assert.throws(() => validateLocalConfig({ ...config, db: { ...config.db, migrations: { enabled: true, schema_paths: ['schemas/*.sql'] } } }, false));
  assert.throws(() => validateLocalConfig({ ...config, api: { ...config.api, schemas: [...config.api.schemas, 'unreviewed'] } }, false));
});

test('reject wrong container identity, stopped services and public Docker bindings', () => {
  const container = {
    Config: { Labels: { 'com.supabase.stack': stackId, 'com.supabase.service': 'database' } }, State: { Running: true },
    HostConfig: { NetworkMode: 'fixture-bridge' },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '25003' }] } },
  };
  assert.doesNotThrow(() => validateContainer(container, stackId));
  assert.throws(() => validateContainer(container, 'b'.repeat(64)));
  assert.throws(() => validateContainer({ ...container, State: { Running: false } }, stackId));
  assert.throws(() => validateContainer({ ...container, HostConfig: { NetworkMode: 'host' }, NetworkSettings: { Ports: {} } }, stackId));
  assert.throws(() => validateContainer({ ...container, NetworkSettings: { Ports: {} } }, stackId));
  for (const HostIp of ['0.0.0.0', '::']) {
    container.NetworkSettings.Ports['5432/tcp'][0].HostIp = HostIp;
    assert.throws(() => validateContainer(container, stackId));
  }
});

test('derive local MCP only from a running, matching worktree/branch stack', () => {
  assert.equal(validate(status), 'http://127.0.0.1:25002/mcp');
  for (const patch of [{ runtime: 'native' }, { owner: 'unavailable' }, { lifecycle: 'stopped' },
    { identity: { ...status.identity, id: 'unknown' } },
    { identity: { ...status.identity, project_root: 'another-worktree' } },
    { identity: { ...status.identity, branch_context: 'refs/heads/main' } }]) {
    assert.throws(() => validate({ ...status, ...patch }));
  }
  for (const url of ['https://example.supabase.co', 'http://user:dummy@127.0.0.1:25002', 'http://127.0.0.1:54321', 'http://127.0.0.1:25002/?access_token=synthetic', 'http://127.0.0.1:25002/override']) {
    assert.throws(() => validate({ ...status, endpoints: { ...status.endpoints, 'rest.http': { ...status.endpoints['rest.http'], url } } }));
  }
});

test('reject remote Docker daemons', () => {
  assert.doesNotThrow(() => validateDockerEndpoint('npipe:////./pipe/dockerDesktopLinuxEngine'));
  assert.doesNotThrow(() => validateDockerEndpoint('unix:///var/run/docker.sock'));
  assert.throws(() => validateDockerEndpoint('tcp://example.invalid:2376'));
  assert.throws(() => validateDockerEndpoint('ssh://example.invalid'));
  assert.throws(() => validateDockerEndpoint('npipe:////remote-server/pipe/docker_engine'));
});

test('lock remains held across asynchronous MCP calls and releases after failure', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-lock-test-'));
  try {
    await assert.rejects(withLocalLock(async () => {
      await Promise.resolve();
      assert.equal(JSON.parse(readFileSync(path.join(directory, '.cache/supabase-local.lock'))).pid, process.pid);
      await assert.rejects(withLocalLock(() => {}, directory), /EEXIST/);
      throw new Error('synthetic failure');
    }, directory), /synthetic failure/);
    assert.equal(await withLocalLock(() => 'released', directory), 'released');
    const lock = path.join(directory, '.cache/supabase-local.lock');
    await assert.rejects(withLocalLock(() => writeFileSync(lock, JSON.stringify({ lease: 'replacement' })), directory), /ownership changed/);
    assert.equal(JSON.parse(readFileSync(lock)).lease, 'replacement');
    unlinkSync(lock);
    const module = new URL('./supabase-local.mjs', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { withLocalLock } from ${JSON.stringify(module)}; await withLocalLock(() => process.exit(0), ${JSON.stringify(directory)});`]);
    assert.equal(child.status, 0);
    assert.ok(existsSync(lock));
    await assert.rejects(withLocalLock(() => {}, directory), /EEXIST/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('reject every dotenv/link override and scrub case-insensitive ambient target selection', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-target-test-'));
  mkdirSync(path.join(directory, 'supabase/.temp'), { recursive: true });
  try {
    writeFileSync(path.join(directory, '.env.example'), '');
    validateLocalFiles(directory);
    for (const name of ['.env', '.env.development.local', 'supabase/.env.local', 'supabase/.temp/project-ref', 'supabase/.link.json']) {
      const file = path.join(directory, name);
      writeFileSync(file, 'synthetic override');
      assert.throws(() => validateLocalFiles(directory));
      unlinkSync(file);
    }
    assert.deepEqual(localEnvironment({ PATH: 'fixture', supabase_access_token: 'synthetic', PgPaSsWoRd: 'synthetic', database_url: 'synthetic', GIT_WORK_TREE: 'other', GIT_CONFIG_COUNT: '1' }), { PATH: 'fixture', DO_NOT_TRACK: '1' });
    const docker = localEnvironment({ docker_host: 'tcp://example.invalid:2376', docker_context: 'fixture' });
    assert.equal(docker.DOCKER_CONTEXT, 'fixture');
    assert.throws(() => validateDockerEndpoint(docker.DOCKER_HOST));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('retain diagnostic context without connection credentials', () => {
  assert.equal(redactDiagnostic('failed postgres://fixture:dummy@127.0.0.1/db'), 'failed postgres://[REDACTED]@127.0.0.1/db');
  assert.equal(redactDiagnostic('network not found'), 'network not found');
  const secret = ['synthetic', 'private', 'value'].join('-');
  for (const value of [`https://fixture:${secret}@127.0.0.1`, `Authorization: Bearer ${secret}`, `PGPASSWORD=${secret}`, JSON.stringify({ access_token: secret, client_secret: secret }), `http://127.0.0.1/?refresh_token=${secret}`]) {
    assert.ok(!redactDiagnostic(value).includes(secret));
  }
  assert.ok(!safeDiagnostic({ message: secret, code: secret, stdout: secret, stderr: secret }).includes(secret));
  assert.match(safeDiagnostic({ code: 'ENOENT', status: 1, message: secret }), /ENOENT; exit 1/);
  assert.ok(!JSON.stringify(safeToolResult({ isError: true, content: [{ type: 'text', text: secret }], credential: secret })).includes(secret));
  const projected = safeEndpoints({ ...status.endpoints, 'private.value': secret });
  assert.equal(projected['private.value'], undefined);
  assert.deepEqual(Object.keys(safeEndpoints({ 'rest.http': { ...status.endpoints['rest.http'], password: secret } })['rest.http']), ['protocol', 'address', 'port', 'url']);
});

test('service lock retains official image digests and the configured Postgres major', () => {
  const lock = JSON.parse(readFileSync(new URL('../supabase/supabase.lock', import.meta.url)));
  assert.equal(lock.lockfileVersion, 1);
  assert.equal(lock.services.database.majorVersion, config.db.major_version);
  for (const service of Object.values(lock.services)) assert.match(service.resolved.image, /^ghcr\.io\/supabase\/cli\/[^\s]+@sha256:[a-f0-9]{64}$/);
});

test('both clients retain identical project-scoped read-only MCP and safe local bridge', () => {
  const codex = parse(readFileSync(new URL('../.codex/config.toml', import.meta.url), 'utf8'));
  const claude = JSON.parse(readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
  const permissions = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8')).permissions;
  assert.ok(permissions.ask.includes('mcp__supabase_enterprise_readonly__*'));
  for (const tool of ['query_logs', 'apply_migration', 'deploy_edge_function', 'get_publishable_keys']) {
    assert.ok(permissions.deny.includes(`mcp__supabase_enterprise_readonly__${tool}`));
  }
  const remote = codex.mcp_servers.supabase_enterprise_readonly;
  assert.equal(remote.default_tools_approval_mode, 'prompt');
  assert.equal(remote.url, claude.mcpServers.supabase_enterprise_readonly.url);
  assert.equal(claude.mcpServers.supabase_enterprise_readonly.oauth.scopes, 'database:read analytics:read');
  const url = new URL(remote.url);
  assert.equal(url.origin, 'https://mcp.supabase.com');
  assert.equal(url.searchParams.get('project_ref'), 'axpdymbusiwxfzurfclg');
  assert.equal(url.searchParams.get('read_only'), 'true');
  assert.equal(url.searchParams.has('skip_elicitations'), false);
  assert.deepEqual(url.searchParams.get('features').split(','), ['database', 'debugging', 'docs']);
  assert.deepEqual(remote.enabled_tools, localTools);
  const local = codex.mcp_servers.supabase_enterprise_local;
  assert.equal(local.command, 'node');
  assert.deepEqual(local.args, ['scripts/supabase-mcp.mjs']);
  assert.deepEqual(local.enabled_tools, localTools);
  assert.equal(local.default_tools_approval_mode, 'prompt');
  assert.deepEqual(claude.mcpServers.supabase_enterprise_local.args, local.args);
});
