import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { helpCommand, nativeHelp } from './tool-help.mjs';
import { validateArchive, validateBinary, installTool } from './install-tools.mjs';
import { toolPath, tarPath } from './tool-path.mjs';
import { databaseContainer, clientAction, postgresClients } from './postgresql-clients.mjs';
import { workflowEnvironment, assertK6Result } from './tool-workflows.mjs';
import { diagnose } from './tool-doctor.mjs';

test('native help selects fixed executable/argv and rejects malicious or mutating input before execution', () => {
  assert.deepEqual(helpCommand(['docker', 'container', 'exec']), ['docker', ['container', 'exec', '--help']]);
  assert.deepEqual(helpCommand(['trivy', 'image']), [toolPath('trivy'), ['image', '--help']]);
  assert.deepEqual(helpCommand(['k6']), [toolPath('k6'), ['--help']]);
  for (const args of [[], ['__proto__'], ['trivy', '--output', 'outside'], ['k6', 'run', 'script.js'],
    ['docker; echo unsafe'], ['docker', 'context', 'use'], ['compose', '--file', 'outside'], ['trivy', '../image'], ['k6', 'run\n']]) {
    assert.throws(() => nativeHelp(args, () => { assert.fail('invalid args executed'); }));
  }
  assert.equal(nativeHelp(['k6', 'run'], (exe, args) => {
    assert.equal(exe, toolPath('k6')); assert.deepEqual(args, ['run', '--help']); return { status: 0, stdout: 'native help' };
  }), 'native help');
  assert.throws(() => nativeHelp(['k6'], () => ({ status: 1 })), /HELP_UNAVAILABLE/);
  assert.equal(nativeHelp(['actionlint'], () => ({ status: 0, stdout: '', stderr: 'native stderr help' })), 'native stderr help');
});

test('archive safety accepts regular paths and rejects traversal, links, duplicates and Windows paths', () => {
  validateArchive(['LICENSE', 'tool/bin'], '-rw-r--r-- LICENSE\n-rwxr-xr-x tool/bin\n');
  for (const [entries, detail] of [[['../escape'], '-rw'], [['/escape'], '-rw'], [['C:/escape'], '-rw'],
    [['tool\\bin'], '-rw'], [['x', 'x'], '-rw\n-rw'], [['x'], 'lrwxrwxrwx x -> other'], [['x'], 'hrw x link to other'], [['x'], 'prw x']]) {
    assert.throws(() => validateArchive(entries, detail), /Unsafe archive/);
  }
});

test('binary header validation rejects empty, wrong-platform and truncated data before replacement', () => {
  const pe = Buffer.alloc(64); pe.write('MZ');
  const elf = Buffer.alloc(64); Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(elf);
  validateBinary(pe, 'win32'); validateBinary(elf, 'linux');
  assert.throws(() => validateBinary(pe, 'linux'));
  assert.throws(() => validateBinary(elf, 'win32'));
  assert.throws(() => validateBinary(Buffer.from('MZ'), 'win32'));
});

test('Windows archives select the OS executable independently of Git hook PATH; Linux retains native tar', () => {
  assert.equal(tarPath('win32', 'C:\\Windows'), 'C:\\Windows\\System32\\tar.exe');
  assert.equal(tarPath('linux'), 'tar');
  assert.throws(() => tarPath('win32', 'relative'), /absolute Windows system root/);
  assert.throws(() => tarPath('win32', ''), /absolute Windows system root/);
});

test('verified archives install only the exact binary; missing binary never replaces an existing installation', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-install-fixture-'));
  const target = toolPath('jq');
  const before = existsSync(target) ? readFileSync(target) : null;
  try {
    writeFileSync(path.join(directory, 'unexpected'), 'fixture, never executable');
    const archive = path.join(directory, 'fixture.tar');
    const result = spawnSync(tarPath(), ['-cf', 'fixture.tar', 'unexpected'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const bytes = readFileSync(archive);
    const asset = { asset: 'fixture.tar', sha256: createHash('sha256').update(bytes).digest('hex'), binary: 'missing' };
    const tool = { version: 'fixture', repository: 'jqlang/jq', [process.platform]: asset };
    await assert.rejects(() => installTool('jq', tool, async () => ({ ok: true, arrayBuffer: async () => bytes })), /exactly one expected binary/);
    assert.deepEqual(existsSync(target) ? readFileSync(target) : null, before);
  } finally { rmSync(directory, { recursive: true }); }
});

const identity = { id: 'a'.repeat(64), endpoints: { 'database.sql': { port: 15432 } } };
const container = () => ({ Id: 'b'.repeat(64), Config: { Labels: { 'com.supabase.stack': identity.id, 'com.supabase.service': 'database' } },
  State: { Running: true }, HostConfig: { NetworkMode: 'owned-network' }, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '15432' }] } } });

test('PostgreSQL reuses canonical ownership and rejects wrong stack, nonloopback, wrong port and targets', () => {
  assert.equal(databaseContainer([container()], identity), 'b'.repeat(64));
  for (const mutate of [c => { c.Config.Labels['com.supabase.stack'] = 'c'.repeat(64); },
    c => { c.NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0'; },
    c => { c.NetworkSettings.Ports['5432/tcp'][0].HostPort = '25432'; },
    c => { c.HostConfig.NetworkMode = 'host'; }, c => { c.State.Running = false; }, c => { c.Id = '--privileged'; }]) {
    const c = container(); mutate(c); assert.throws(() => databaseContainer([c], identity));
  }
  assert.throws(() => databaseContainer([], identity));
  assert.throws(() => databaseContainer([container(), container()], identity));
  assert.equal(clientAction(['help', 'pg_restore']), 'pg_restore');
  assert.equal(clientAction(['smoke']), 'smoke');
  for (const args of [['smoke', '--db-url', 'postgres://hosted.invalid'], ['help', 'pg_restore;rm'], ['sql', 'DELETE']]) {
    assert.throws(() => clientAction(args));
  }
});

test('PostgreSQL invalid argv fails before runtime operations; missing conditions never use a hosted fallback', async () => {
  const runtime = new Proxy({}, { get() { assert.fail('runtime accessed for invalid argv'); } });
  await assert.rejects(postgresClients(['smoke', '--host', 'external.invalid'], runtime));
  await assert.rejects(postgresClients(['smoke', '--host', 'external.invalid']), /targets and SQL are fixed/);
});

test('workflow child environment removes hosted secrets, proxies, scanner overrides and k6 output/cloud config', () => {
  const env = workflowEnvironment({ PATH: 'safe', PGHOST: 'external.invalid', HTTPS_PROXY: 'external.invalid', K6_OUT: 'cloud',
    K6_CLOUD_TOKEN: 'fixture', TRIVY_SERVER: 'external.invalid', NODE_OPTIONS: '--require unwanted', OPENAI_API_KEY: 'fixture' });
  assert.equal(env.PATH, 'safe'); assert.equal(env.K6_NO_USAGE_REPORT, 'true');
  for (const key of ['PGHOST', 'HTTPS_PROXY', 'K6_OUT', 'K6_CLOUD_TOKEN', 'TRIVY_SERVER', 'NODE_OPTIONS', 'OPENAI_API_KEY']) assert.ok(!(key in env));
  assertK6Result({ code: 0 }, false); assertK6Result({ code: 99 }, true);
  assert.throws(() => assertK6Result({ code: 0 }, true));
  assert.throws(() => assertK6Result({ code: 1 }, false));
});

test('doctor separates Trivy executable and DB/rules/results; k6 uses native version command', () => {
  const trivy = diagnose({ id: 'trivy', tier: 'B' }, () => ({ status: 0, stdout: 'Version: 0.76.1' }));
  assert.equal(trivy.available, true); assert.equal(trivy.verified, false);
  assert.match(trivy.database, /DATABASE_MISSING|PRESENT_NOT_VERIFIED/); assert.match(trivy.rules, /NOT_RUN/); assert.equal(trivy.scan, 'NOT_RUN');
  const k6 = diagnose({ id: 'k6', tier: 'B' }, (_exe, args) => {
    assert.deepEqual(args, ['version']); return { status: 0, stdout: 'k6 v2.3.0' };
  });
  assert.equal(k6.available, true); assert.equal(k6.verified, false);
});
