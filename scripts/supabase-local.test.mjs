import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { validateLocalConfig, validateContainer, validateLocalStatus, validateDockerEndpoint, redactDiagnostic, withLocalLock } from './supabase-local.mjs';
import { localTools } from './supabase-mcp.mjs';

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
});

test('reject wrong container identity, stopped services and public Docker bindings', () => {
  const container = {
    Config: { Labels: { 'com.supabase.stack': stackId } }, State: { Running: true },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '25003' }] } },
  };
  assert.doesNotThrow(() => validateContainer(container, stackId));
  assert.throws(() => validateContainer(container, 'b'.repeat(64)));
  assert.throws(() => validateContainer({ ...container, State: { Running: false } }, stackId));
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
  for (const url of ['https://example.supabase.co', 'http://user:dummy@127.0.0.1:25002', 'http://127.0.0.1:54321']) {
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
  await assert.rejects(withLocalLock(async () => {
    await Promise.resolve();
    await assert.rejects(withLocalLock(() => {}), /EEXIST/);
    throw new Error('synthetic failure');
  }), /synthetic failure/);
  assert.equal(await withLocalLock(() => 'released'), 'released');
});

test('retain diagnostic context without connection credentials', () => {
  assert.equal(redactDiagnostic('failed postgres://fixture:dummy@127.0.0.1/db'), 'failed postgres://[REDACTED]@127.0.0.1/db');
  assert.equal(redactDiagnostic('network not found'), 'network not found');
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
  assert.equal(local.default_tools_approval_mode, 'prompt');
  assert.deepEqual(claude.mcpServers.supabase_enterprise_local.args, local.args);
});
