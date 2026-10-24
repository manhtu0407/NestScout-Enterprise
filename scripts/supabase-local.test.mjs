import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { validateLocalConfig, validateContainer, validateLocalStatus, validateDockerEndpoint, redactDiagnostic } from './supabase-local.mjs';

const config = parse(readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8'));
test('CLI wrapper rejects remote target overrides before any Docker operation', () => {
  const result = spawnSync(process.execPath,
    [fileURLToPath(new URL('./supabase-local.mjs', import.meta.url)), 'reset', '--linked'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Additional flags and target overrides are forbidden/);
});
test('accept disposable config and reject linked, shared, or ambiguous targets', () => {
  assert.equal(validateLocalConfig(config, false), config.project_id);
  assert.throws(() => validateLocalConfig(config, true));
  assert.throws(() => validateLocalConfig({ ...config, project_id: 'nestscout' }, false));
  assert.throws(() => validateLocalConfig({ ...config, db: { ...config.db, port: config.api.port } }, false));
  assert.throws(() => validateLocalConfig({ ...config, experimental: { stack: true } }, false));
});
test('reject wrong project, stopped DB, remote binding, and wrong port', () => {
  const container = {
    Config: { Labels: { 'com.supabase.cli.project': config.project_id } },
    State: { Running: true },
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: String(config.db.port) }] } },
  };
  assert.doesNotThrow(() => validateContainer(container, config.project_id, config.db.port));
  assert.throws(() => validateContainer(container, 'another-project', config.db.port));
  assert.throws(() => validateContainer(container, config.project_id, 54322));
  assert.throws(() => validateContainer({ ...container, State: { Running: false } }, config.project_id, config.db.port));
  container.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
  assert.throws(() => validateContainer(container, config.project_id, config.db.port));
});
test('derive MCP from verified status, reject hosted or wrong local endpoint', () => {
  assert.equal(validateLocalStatus({ API_URL: `http://127.0.0.1:${config.api.port}` }, config.api.port), `http://127.0.0.1:${config.api.port}/mcp`);
  assert.throws(() => validateLocalStatus({ API_URL: 'https://example.supabase.co' }, config.api.port));
  assert.throws(() => validateLocalStatus({ API_URL: 'http://127.0.0.1:55321' }, config.api.port));
});
test('reject remote Docker daemons even with apparently local port bindings', () => {
  assert.doesNotThrow(() => validateDockerEndpoint('npipe:////./pipe/dockerDesktopLinuxEngine'));
  assert.doesNotThrow(() => validateDockerEndpoint('unix:///var/run/docker.sock'));
  assert.throws(() => validateDockerEndpoint('tcp://example.invalid:2376'));
  assert.throws(() => validateDockerEndpoint('ssh://example.invalid'));
});
test('retain diagnostic context without connection credentials', () => {
  assert.equal(redactDiagnostic('failed postgres://fixture:dummy@127.0.0.1/db'), 'failed postgres://[REDACTED]@127.0.0.1/db');
  assert.equal(redactDiagnostic('network not found'), 'network not found');
});
test('remote MCP stays project-scoped, read-only, and identical across clients', () => {
  const codex = parse(readFileSync(new URL('../.codex/config.toml', import.meta.url), 'utf8'));
  const claude = JSON.parse(readFileSync(new URL('../.mcp.json', import.meta.url), 'utf8'));
  const remote = codex.mcp_servers.supabase_enterprise_readonly;
  assert.equal(remote.default_tools_approval_mode, 'prompt');
  assert.equal(remote.url, claude.mcpServers.supabase_enterprise_readonly.url);
  const url = new URL(remote.url);
  assert.equal(url.origin, 'https://mcp.supabase.com');
  assert.equal(url.searchParams.get('project_ref'), 'axpdymbusiwxfzurfclg');
  assert.equal(url.searchParams.get('read_only'), 'true');
  assert.equal(url.searchParams.has('skip_elicitations'), false);
  assert.deepEqual(url.searchParams.get('features').split(','), ['database', 'debugging', 'docs']);
  assert.ok(remote.enabled_tools.every(name => !/apply|deploy|create|branch|secret/.test(name)));
  assert.equal(codex.mcp_servers.supabase_enterprise_local.enabled, false);
});
