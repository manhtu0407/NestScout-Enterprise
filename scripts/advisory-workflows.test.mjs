import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, linkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boundedProcess, dependencyFixture, sbomFixture, operationCondition, ownedDirectory, scannerResult, validateMetadata, withCache, osvSource, inspectDatabase } from './advisory-workflows.mjs';
import { createHash } from 'node:crypto';
import { tools } from './tool-path.mjs';

test('snapshot fitness rejects missing, incompatible, invalid and future metadata; stale replay is explicit', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const valid = { Version: 2, UpdatedAt: '2026-10-25T01:00:00Z', NextUpdate: '2026-10-25T07:00:00Z', DownloadedAt: '2026-10-25T02:00:00Z' };
  assert.equal(validateMetadata(valid, now).freshness, 'STALE_OFFLINE_SNAPSHOT');
  assert.equal(validateMetadata({ ...valid, NextUpdate: '2026-10-26T01:00:00Z' }, now).freshness, 'CURRENT_AT_INSPECTION');
  for (const value of [null, {}, { ...valid, Version: 3 }, { ...valid, UpdatedAt: 'invalid' },
    { ...valid, DownloadedAt: '2026-10-24T00:00:00Z' }, { ...valid, NextUpdate: valid.UpdatedAt },
    { ...valid, DownloadedAt: '2026-10-26T00:00:00Z' }]) assert.throws(() => validateMetadata(value, now));
});

test('scanner output and native exits must agree; empty packages/errors never mean clean', () => {
  const result = (status, object) => ({ status, stdout: JSON.stringify(object), stderr: '' });
  const pkg = { Name: 'lodash', Version: '4.17.20' };
  const clean = { Results: [{ Packages: [pkg] }] };
  const findings = { Results: [{ Packages: [pkg], Vulnerabilities: [{ VulnerabilityID: 'CVE-2021-23337', Severity: 'HIGH' }] }] };
  assert.equal(scannerResult('trivy', result(0, clean)).status, 'PASS');
  assert.equal(scannerResult('trivy', result(7, findings)).status, 'PASS_WITH_FINDINGS');
  assert.equal(scannerResult('trivy', result(0, findings)).status, 'EXIT_OUTPUT_MISMATCH');
  assert.equal(scannerResult('trivy', result(7, clean)).status, 'EXIT_OUTPUT_MISMATCH');
  assert.equal(scannerResult('trivy', result(0, { Results: [] })).status, 'NO_PACKAGES');
  assert.equal(scannerResult('trivy', result(0, {})).status, 'INVALID_SCANNER_OUTPUT');
  assert.equal(scannerResult('trivy', { status: 0, stdout: 'broken' }).status, 'INVALID_SCANNER_OUTPUT');
  assert.equal(scannerResult('trivy', { status: 1, stderr: 'first run cannot skip downloading DB' }).status, 'DATABASE_MISSING');
  for (const status of [127, 2, 126, 129, 255]) assert.equal(scannerResult('osv', result(status, {})).status, 'SCANNER_ERROR');
  assert.equal(scannerResult('osv', result(127, {})).nativeOutcome, 'GENERAL_ERROR');
  assert.equal(scannerResult('osv', result(2, {})).nativeOutcome, 'RESERVED_RESULT_ERROR');
  assert.equal(scannerResult('osv', result(129, {})).nativeOutcome, 'RESERVED_NON_RESULT_ERROR');
  assert.equal(scannerResult('osv', result(128, {})).status, 'NO_PACKAGES');
  const osv = { results: [{ packages: [{ package: { name: 'lodash', version: '4.17.20' }, vulnerabilities: [{ id: 'GHSA-id', aliases: ['CVE-2021-23337'] }] }] }] };
  const outcome = scannerResult('osv', result(1, osv));
  assert.equal(outcome.status, 'PASS_WITH_FINDINGS'); assert.equal(outcome.packages, 1);
  assert.ok(outcome.advisoryIds.includes('CVE-2021-23337'));
  assert.equal(scannerResult('osv', result(0, osv)).status, 'EXIT_OUTPUT_MISMATCH');
  assert.equal(scannerResult('osv', result(0, { results: [{ packages: [{ package: { name: 'example', version: '1' } }] }] })).status, 'PASS');
  assert.equal(scannerResult('osv', result(0, { results: [{ packages: [{}] }] })).status, 'INVALID_PACKAGE_INVENTORY');
  for (const [input, expected] of [[{ condition: 'TIMEOUT' }, 'TIMEOUT'], [{ signal: 'SIGTERM' }, 'CANCELLED'],
    [{ stderr: 'failed to download: connection refused' }, 'BLOCKED_NETWORK'], [{ stderr: 'blocked by application control policy' }, 'BLOCKED_HOST_POLICY']]) {
    assert.equal(operationCondition(input), expected);
  }
});

test('snapshot seal rejects corrupt bytes, changed metadata and a different scanner; presence is not behavioral verification', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'nestscout-db-test-'));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  try {
    await assert.rejects(() => inspectDatabase(base), /DATABASE_MISSING/);
    mkdirSync(path.join(base, 'cache/db'), { recursive: true });
    const metadata = JSON.stringify({ Version: 2, UpdatedAt: '2026-10-24T01:00:00Z', NextUpdate: '2026-10-25T01:00:00Z', DownloadedAt: '2026-10-24T02:00:00Z' });
    const bytes = Buffer.alloc(4096, 1);
    const db = path.join(base, 'cache/db/trivy.db');
    const seal = { origin: 'ghcr.io/aquasecurity/trivy-db:2', scannerVersion: tools.trivy.version, sha256: digest(bytes), metadataSHA256: digest(metadata) };
    writeFileSync(path.join(base, 'cache/db/metadata.json'), metadata);
    writeFileSync(db, bytes);
    const writeSeal = value => writeFileSync(path.join(base, 'snapshot.json'), JSON.stringify(value));
    writeSeal(seal);
    assert.equal((await inspectDatabase(base)).sha256, seal.sha256);
    writeFileSync(db, Buffer.alloc(4096, 2));
    await assert.rejects(() => inspectDatabase(base), /SNAPSHOT_MISMATCH/);
    writeFileSync(db, bytes);
    for (const override of [{ origin: 'untrusted.invalid/db' }, { scannerVersion: 'different' }, { metadataSHA256: '0'.repeat(64) }]) {
      writeSeal({ ...seal, ...override });
      await assert.rejects(() => inspectDatabase(base), /SNAPSHOT_MISMATCH/);
    }
    writeFileSync(db, 'corrupt');
    await assert.rejects(() => inspectDatabase(base, false), /UNSUITABLE_DATABASE_SIZE/);
  } finally { rmSync(base, { recursive: true }); }
});

test('cache paths, ownership, peer lock and symlink guards fail before scanner execution', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'nestscout-cache-test-'));
  try {
    for (const task of ['', '../peer', '/root', 'C:\\outside', 'x/y', 'a'.repeat(49)]) assert.throws(() => ownedDirectory(task, base));
    const peer = ownedDirectory('peer', base);
    await withCache('peer', () => {}, base);
    writeFileSync(path.join(peer, 'operation.lock'), 'peer lock');
    await assert.rejects(() => withCache('peer', () => assert.fail('busy cache used'), base), /CACHE_BUSY/);
    assert.equal(readFileSync(path.join(peer, 'operation.lock'), 'utf8'), 'peer lock');
    await withCache('owned', async directory => {
      await assert.rejects(() => withCache('owned', () => assert.fail('concurrent writer'), base), /CACHE_BUSY/);
      assert.ok(existsSync(path.join(directory, 'operation.lock')));
    }, base);
    const owned = ownedDirectory('owned', base);
    assert.equal(existsSync(path.join(owned, 'operation.lock')), false);
    await assert.rejects(() => withCache('owned', () => { throw new Error('operation failed'); }, base), /operation failed/);
    assert.equal(existsSync(path.join(owned, 'operation.lock')), false);
    writeFileSync(path.join(owned, 'owner.json'), '{}');
    await assert.rejects(() => withCache('owned', () => assert.fail('wrong owner'), base), /CACHE_OWNER_MISMATCH/);
    const linked = ownedDirectory('linked', base);
    await withCache('linked', () => {}, base);
    symlinkSync(peer, path.join(linked, 'cache'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(() => withCache('linked', () => assert.fail('linked descendant used'), base), /UNSAFE_CACHE_PATH/);
    const escaped = path.join(base, '.cache/advisories/escaped');
    symlinkSync(peer, escaped, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => ownedDirectory('escaped', base), /UNSAFE_CACHE_PATH/);
    const unowned = ownedDirectory('unowned', base);
    writeFileSync(path.join(unowned, 'peer.txt'), 'unowned work');
    await assert.rejects(() => withCache('unowned', () => assert.fail('unowned cache claimed'), base), /CACHE_UNOWNED/);
    const unsafe = ownedDirectory('unsafe', base);
    await withCache('unsafe', () => {}, base);
    linkSync(path.join(peer, 'operation.lock'), path.join(unsafe, 'trivy.yaml'));
    await assert.rejects(() => withCache('unsafe', () => assert.fail('symlink overwritten'), base), /UNSAFE_CACHE_FILE/);
    if (process.platform === 'linux') {
      rmSync(path.join(unsafe, 'trivy.yaml'));
      symlinkSync(path.join(base, 'absent-target'), path.join(unsafe, 'trivy.yaml'));
      await assert.rejects(() => withCache('unsafe', () => assert.fail('broken symlink followed'), base), /UNSAFE_CACHE_FILE/);
    }
    assert.equal(readFileSync(path.join(peer, 'operation.lock'), 'utf8'), 'peer lock');
  } finally { rmSync(base, { recursive: true }); }
});

test('bounded real processes preserve timeout, error, cancellation and output overflow', async () => {
  assert.equal((await boundedProcess(process.execPath, ['-e', 'console.log("ok")'], { timeout: 5000 })).status, 0);
  const timeout = await boundedProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeout: 100 });
  assert.equal(timeout.condition, 'TIMEOUT');
  assert.equal(scannerResult('osv', timeout).status, 'TIMEOUT');
  const overflow = await boundedProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { limit: 10 });
  assert.equal(overflow.condition, 'OUTPUT_LIMIT');
  assert.equal((await boundedProcess(path.join(tmpdir(), 'nestscout-no-such-binary'), [])).condition, 'MISSING_BINARY');
});

test('fixtures contain immutable non-executable package evidence; Windows source workflow never launches OSV', async () => {
  assert.equal(JSON.parse(dependencyFixture).packages['node_modules/lodash'].version, '4.17.20');
  assert.equal(JSON.parse(sbomFixture).components[0].purl, 'pkg:npm/lodash@4.17.20');
  if (process.platform !== 'linux') await assert.rejects(() => osvSource('denied'), /BLOCKED_HOST_POLICY/);
});
