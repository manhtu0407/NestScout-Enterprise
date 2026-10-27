import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, tools, toolPath } from './tool-path.mjs';
import { workflowEnvironment } from './tool-workflows.mjs';

const origin = 'ghcr.io/aquasecurity/trivy-db:2';
const hash = value => createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const fail = condition => { throw new Error(condition); };

export const dependencyFixture = JSON.stringify({ name: 'advisory-data-only', version: '1.0.0', lockfileVersion: 3,
  packages: { '': { name: 'advisory-data-only', version: '1.0.0', dependencies: { lodash: '4.17.20' } },
    'node_modules/lodash': { version: '4.17.20', resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.20.tgz' } } }, null, 2) + '\n';
export const sbomFixture = JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', version: 1,
  components: [{ type: 'library', name: 'lodash', version: '4.17.20', purl: 'pkg:npm/lodash@4.17.20', 'bom-ref': 'lodash' }] }, null, 2) + '\n';

export function validateMetadata(metadata, now = Date.now()) {
  if (!metadata || metadata.Version !== 2) fail('UNSUPPORTED_DATABASE_SCHEMA');
  const updated = Date.parse(metadata.UpdatedAt);
  const next = Date.parse(metadata.NextUpdate);
  const downloaded = Date.parse(metadata.DownloadedAt);
  if (![updated, next, downloaded].every(Number.isFinite) || next <= updated || downloaded < updated
    || updated > now + 300000 || downloaded > now + 300000) fail('INVALID_DATABASE_METADATA');
  return { schema: metadata.Version, updatedAt: metadata.UpdatedAt, nextUpdate: metadata.NextUpdate,
    downloadedAt: metadata.DownloadedAt, freshness: next < now ? 'STALE_OFFLINE_SNAPSHOT' : 'CURRENT_AT_INSPECTION' };
}

function regular(file) {
  if (!existsSync(file)) fail('DATABASE_MISSING');
  if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || lstatSync(file).nlink !== 1) fail('UNSAFE_DATABASE_FILE');
}

export function ownedDirectory(task, base = root) {
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(task ?? '')) fail('INVALID_TASK_CACHE');
  const canonical = realpathSync(base);
  let directory = canonical;
  for (const part of ['.cache', 'advisories', task]) {
    directory = path.join(directory, part);
    if (!existsSync(directory)) mkdirSync(directory);
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()
      || realpathSync(directory) !== directory) fail('UNSAFE_CACHE_PATH');
  }
  return directory;
}

export async function withCache(task, action, base = root) {
  const directory = ownedDirectory(task, base);
  const owner = { schema: 1, rootSHA256: hash(realpathSync(base)), task };
  const ownerFile = path.join(directory, 'owner.json');
  if (!existsSync(ownerFile)) {
    if (readdirSync(directory).length) fail('CACHE_UNOWNED');
    writeFileSync(ownerFile, JSON.stringify(owner), { flag: 'wx' });
  }
  regular(ownerFile);
  const observedOwner = json(ownerFile);
  if (Object.keys(observedOwner).length !== 3 || observedOwner.schema !== owner.schema
    || observedOwner.rootSHA256 !== owner.rootSHA256 || observedOwner.task !== task) fail('CACHE_OWNER_MISMATCH');
  const lock = path.join(directory, 'operation.lock');
  try { writeFileSync(lock, JSON.stringify({ pid: process.pid }), { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') fail('CACHE_BUSY'); throw error; }
  try {
    for (const relative of ['cache', 'cache/db', 'home', 'empty']) {
      const folder = path.join(directory, relative);
      const stat = lstatSync(folder, { throwIfNoEntry: false });
      if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) fail('UNSAFE_CACHE_PATH');
    }
    for (const name of ['snapshot.json', 'fixture.cdx.json', 'package-lock.json', 'trivy.yaml', 'trivy-output.json', 'trivy-stderr.txt', 'osv-output.json']) {
      const stat = lstatSync(path.join(directory, name), { throwIfNoEntry: false });
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) fail('UNSAFE_CACHE_FILE');
    }
    return await action(directory);
  } finally { rmSync(lock); }
}

export async function boundedProcess(executable, args, options = {}) {
  const { timeout = 180000, limit = 8 * 1024 * 1024, terminationGrace = 1000, ...spawnOptions } = options;
  return await new Promise(resolve => {
    const child = spawn(executable, args, { ...spawnOptions, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', size = 0, condition, forceTimer;
    const timer = setTimeout(() => terminate('TIMEOUT'), timeout);
    function terminate(reason) {
      if (condition) return;
      condition = reason;
      clearTimeout(timer);
      child.kill('SIGTERM');
      forceTimer = setTimeout(() => child.kill('SIGKILL'), terminationGrace);
    }
    function collect(key, data) {
      if (condition) return;
      size += data.length;
      if (size > limit) { terminate('OUTPUT_LIMIT'); return; }
      if (key === 'stdout') stdout += data; else stderr += data;
    }
    child.stdout.on('data', data => collect('stdout', data));
    child.stderr.on('data', data => collect('stderr', data));
    child.once('error', error => { condition ??= error.code === 'ENOENT' ? 'MISSING_BINARY' : ['EACCES', 'EPERM'].includes(error.code) ? 'BLOCKED_HOST_POLICY' : 'PROCESS_ERROR'; });
    child.once('close', (status, signal) => {
      clearTimeout(timer);
      clearTimeout(forceTimer);
      resolve({ status, signal, stdout, stderr, condition });
    });
  });
}

export function operationCondition(result) {
  if (result.condition) return result.condition;
  if (result.signal) return 'CANCELLED';
  if (/blocked by.*policy|application control|virus or potentially unwanted|access is denied/i.test(result.stderr ?? '')) return 'BLOCKED_HOST_POLICY';
  if (/first run cannot skip|database.*(?:missing|not found)/i.test(result.stderr ?? '')) return 'DATABASE_MISSING';
  if (/timeout|deadline exceeded/i.test(result.stderr ?? '')) return 'TIMEOUT';
  if (/connection refused|no such host|network is unreachable|TLS handshake|failed to download|unexpected status code|429 Too Many/i.test(result.stderr ?? '')) return 'BLOCKED_NETWORK';
  return 'SCANNER_ERROR';
}

export function scannerResult(kind, result) {
  const findingExit = kind === 'trivy' ? 7 : 1;
  if (result.condition || result.signal) return { status: operationCondition(result), exit: result.status ?? null };
  if (kind === 'osv' && result.status === 128) return { status: 'NO_PACKAGES', exit: 128 };
  if (![0, findingExit].includes(result.status)) return { status: operationCondition(result), exit: result.status ?? null,
    nativeOutcome: kind !== 'osv' ? 'OPERATIONAL_ERROR' : result.status === 127 ? 'GENERAL_ERROR'
      : result.status >= 2 && result.status <= 126 ? 'RESERVED_RESULT_ERROR' : result.status >= 129 && result.status <= 255 ? 'RESERVED_NON_RESULT_ERROR' : 'UNKNOWN_EXIT' };
  let report;
  try { report = JSON.parse(result.stdout); } catch { return { status: 'INVALID_SCANNER_OUTPUT', exit: result.status }; }
  const results = kind === 'trivy' ? report.Results : report.results;
  if (!Array.isArray(results)) return { status: 'INVALID_SCANNER_OUTPUT', exit: result.status };
  const packages = results.flatMap(item => kind === 'trivy' ? item.Packages ?? [] : item.packages ?? []);
  const vulnerabilities = kind === 'trivy' ? results.flatMap(item => item.Vulnerabilities ?? [])
    : packages.flatMap(item => item.vulnerabilities ?? []);
  if (!packages.length) return { status: 'NO_PACKAGES', exit: result.status };
  if (packages.some(item => kind === 'trivy' ? !item.Name || !item.Version : !item.package?.name || !item.package?.version)) return { status: 'INVALID_PACKAGE_INVENTORY', exit: result.status };
  const ids = [...new Set(vulnerabilities.flatMap(item => kind === 'trivy' ? [item.VulnerabilityID] : [item.id, ...(item.aliases ?? [])]).filter(Boolean))].sort();
  if ((vulnerabilities.length > 0) !== (result.status === findingExit)) return { status: 'EXIT_OUTPUT_MISMATCH', exit: result.status };
  const severity = {};
  for (const finding of vulnerabilities) {
    const label = kind === 'trivy' ? finding.Severity ?? 'UNKNOWN' : finding.database_specific?.severity ?? 'UNKNOWN';
    severity[label] = (severity[label] ?? 0) + 1;
  }
  return { status: vulnerabilities.length ? 'PASS_WITH_FINDINGS' : 'PASS', exit: result.status,
    packages: packages.length, findings: vulnerabilities.length, severity, advisoryIds: ids };
}

async function fileHash(file) {
  const stream = createReadStream(file);
  const digest = createHash('sha256');
  for await (const chunk of stream) digest.update(chunk);
  return digest.digest('hex');
}

export async function inspectDatabase(directory, sealed = true) {
  const folder = path.join(directory, 'cache/db');
  for (const file of ['metadata.json', 'trivy.db']) regular(path.join(folder, file));
  const metadata = validateMetadata(json(path.join(folder, 'metadata.json')));
  const size = lstatSync(path.join(folder, 'trivy.db')).size;
  if (size < 4096 || size > 2 * 1024 ** 3) fail('UNSUITABLE_DATABASE_SIZE');
  const sha256 = await fileHash(path.join(folder, 'trivy.db'));
  if (sealed) {
    regular(path.join(directory, 'snapshot.json'));
    const snapshot = json(path.join(directory, 'snapshot.json'));
    if (snapshot.sha256 !== sha256 || snapshot.origin !== origin || snapshot.scannerVersion !== tools.trivy.version
      || snapshot.metadataSHA256 !== hash(readFileSync(path.join(folder, 'metadata.json')))) fail('DATABASE_SNAPSHOT_MISMATCH');
  }
  return { origin, scannerVersion: tools.trivy.version, sha256, bytes: size, ...metadata,
    metadataSHA256: hash(readFileSync(path.join(folder, 'metadata.json'))) };
}

function invocation(directory) {
  const home = path.join(directory, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(directory, 'trivy.yaml'), '{}\n');
  return { cwd: directory, env: { ...workflowEnvironment(), HOME: home, USERPROFILE: home, XDG_CACHE_HOME: home, XDG_CONFIG_HOME: home, TMPDIR: home, TMP: home, TEMP: home } };
}

const trivyArgs = directory => ['--config', path.join(directory, 'trivy.yaml'), '--cache-dir', path.join(directory, 'cache'), '--timeout', '150s'];
const offline = ['--skip-db-update', '--skip-java-db-update', '--offline-scan', '--skip-version-check', '--disable-telemetry'];

async function toolVersion(tool, options) {
  const version = await boundedProcess(toolPath(tool), ['--version'], { ...options, timeout: 15000 });
  if (version.status !== 0 || version.condition || version.signal) fail(operationCondition(version));
  if (!(`${version.stdout}${version.stderr}`).includes(tools[tool].version)) fail('VERSION_MISMATCH');
  return tools[tool].version;
}

export async function trivyAdvisories(action, task) {
  if (!['prepare', 'scan', 'clean'].includes(action)) fail('INVALID_ACTION');
  const result = await withCache(task, async directory => {
    if (action === 'clean') {
      for (const name of ['cache', 'home', 'empty', 'snapshot.json', 'fixture.cdx.json', 'package-lock.json', 'trivy.yaml', 'trivy-output.json', 'trivy-stderr.txt', 'osv-output.json']) {
        rmSync(path.join(directory, name), { recursive: true, force: true });
      }
      return { status: 'PASS', cleanup: 'PASS: task data removed under lock; ownership record retained' };
    }
    const options = invocation(directory);
    const version = await toolVersion('trivy', options);
    if (action === 'prepare') {
      const result = await boundedProcess(toolPath('trivy'), [...trivyArgs(directory), 'image', '--download-db-only', '--db-repository', origin,
        '--skip-java-db-update', '--skip-check-update', '--skip-version-check', '--disable-telemetry', '--no-progress'], options);
      writeFileSync(path.join(directory, 'trivy-stderr.txt'), result.stderr);
      if (result.status !== 0 || result.condition || result.signal) return { status: operationCondition(result), exit: result.status, cache: `.cache/advisories/${task}`, cleanup: 'RETAINED: owned cache; use clean' };
      const snapshot = await inspectDatabase(directory, false);
      writeJson(path.join(directory, 'snapshot.json'), snapshot);
      return { status: 'PREPARED_NOT_VERIFIED', scannerVersion: version, snapshot, cache: `.cache/advisories/${task}`, cleanup: 'RETAINED: explicit offline replay/clean' };
    }
    const snapshot = await inspectDatabase(directory);
    const target = path.join(directory, 'fixture.cdx.json');
    writeFileSync(target, sbomFixture);
    const scan = await boundedProcess(toolPath('trivy'), [...trivyArgs(directory), 'sbom', ...offline, '--list-all-pkgs', '--exit-code', '7', '--format', 'json', target], options);
    writeFileSync(path.join(directory, 'trivy-output.json'), scan.stdout);
    writeFileSync(path.join(directory, 'trivy-stderr.txt'), scan.stderr);
    const outcome = scannerResult('trivy', scan);
    if (['PASS', 'PASS_WITH_FINDINGS'].includes(outcome.status) && !outcome.advisoryIds.includes('CVE-2021-23337')) fail('KNOWN_ADVISORY_NOT_DETECTED');
    return { ...outcome, scannerVersion: version, scanner: 'vulnerability', targetKind: 'data-only CycloneDX', fixtureSHA256: hash(sbomFixture), snapshot,
      cache: `.cache/advisories/${task}`, network: 'OFFLINE: updates, telemetry and resolution disabled', cleanup: 'RETAINED: owned snapshot/fixture/output for replay; use clean' };
  });
  return result;
}

export async function osvSource(task) {
  if (process.platform !== 'linux' || process.arch !== 'x64') fail('BLOCKED_HOST_POLICY: OSV source workflow requires authorized native Linux x64');
  return await withCache(task, async directory => {
    const options = invocation(directory);
    const version = await toolVersion('osv-scanner', options);
    const target = path.join(directory, 'package-lock.json');
    writeFileSync(target, dependencyFixture);
    const scan = await boundedProcess(toolPath('osv-scanner'), ['scan', 'source', '--format', 'json', '--all-packages', '--no-ignore', '--no-resolve', '--no-call-analysis', 'go', '--no-call-analysis', 'rust', '--lockfile', target], options);
    writeFileSync(path.join(directory, 'osv-output.json'), scan.stdout);
    const outcome = scannerResult('osv', scan);
    if (['PASS', 'PASS_WITH_FINDINGS'].includes(outcome.status) && !outcome.advisoryIds.includes('CVE-2021-23337')) fail('KNOWN_ADVISORY_NOT_DETECTED');
    const empty = path.join(directory, 'empty');
    mkdirSync(empty, { recursive: true });
    const noPackages = await boundedProcess(toolPath('osv-scanner'), ['scan', 'source', '--format', 'json', empty], options);
    const denied = await boundedProcess(toolPath('osv-scanner'), ['scan', 'source', '--format', 'json', '--lockfile', path.join(empty, 'absent.lock')], options);
    assert.equal(noPackages.status, 128, 'OSV no-package native exit contract');
    assert.equal(denied.status, 127, 'OSV operational native exit contract');
    return { ...outcome, scannerVersion: version, scanner: 'source lockfile', fixtureSHA256: hash(dependencyFixture),
      negatives: [{ exit: noPackages.status, status: scannerResult('osv', noPackages).status }, { exit: denied.status, status: scannerResult('osv', denied).status }],
      network: 'api.osv.dev: public lodash version queries; no private graph/config/credentials',
      cache: `.cache/advisories/${task}`, cleanup: 'RETAINED: owned output; use tools:trivy:db clean with the same task ID' };
  });
}

export async function osvOfflineSmoke() {
  if (process.platform !== 'linux' || process.arch !== 'x64') fail('NATIVE_LINUX_REQUIRED');
  const task = `offline-${process.pid}`;
  try {
    return await withCache(task, async directory => {
      const options = invocation(directory);
      const version = await toolVersion('osv-scanner', options);
      const target = path.join(directory, 'package-lock.json');
      writeFileSync(target, dependencyFixture);
      const result = await boundedProcess(toolPath('osv-scanner'), ['scan', 'source', '--offline', '--no-resolve', '--format', 'json', '--all-packages', '--no-ignore', '--lockfile', target], options);
      assert.equal(result.status, 127, 'Absent offline advisory datastore must fail');
      assert.match(result.stderr, /(?:database|db).*(?:not|missing|exist)|(?:not|missing|exist).*(?:database|db)/i, 'Native failure must identify absent offline data');
      assert.ok(!['PASS', 'PASS_WITH_FINDINGS'].includes(scannerResult('osv', result).status));
      return { status: 'PASS', scannerVersion: version, assertion: 'Native source extraction reaches absent offline DB and fails closed',
        advisoryReadiness: 'BLOCKED_DATABASE_MISSING', exit: result.status, fixtureSHA256: hash(dependencyFixture), cleanup: 'PASS: owned offline test data removed' };
    });
  } finally { await trivyAdvisories('clean', task); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [tool, action, task, ...extra] = process.argv.slice(2);
    if (extra.length || !task || !((tool === 'trivy' && ['prepare', 'scan', 'clean'].includes(action)) || (tool === 'osv' && action === 'online'))) fail('Use trivy prepare|scan|clean TASK or osv online TASK; network operations are explicit opt-ins.');
    const result = tool === 'trivy' ? await trivyAdvisories(action, task) : await osvSource(task);
    console.log(JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, ...result }, null, 2));
    process.exitCode = ['PASS', 'PASS_WITH_FINDINGS', 'PREPARED_NOT_VERIFIED'].includes(result.status) ? 0 : 1;
  } catch (error) {
    const condition = /^[A-Z_]+(?:: OSV source workflow requires authorized native Linux x64)?$/.test(error.message) ? error.message : 'CONTRACT_OR_CACHE_ERROR';
    console.log(JSON.stringify({ status: condition.startsWith('BLOCKED_') ? condition.split(':')[0] : condition === 'DATABASE_MISSING' ? 'BLOCKED_DATABASE_MISSING' : 'FAIL', condition, cleanup: 'Owned cache retained; no shared cleanup attempted' }));
    process.exitCode = 1;
  }
}
