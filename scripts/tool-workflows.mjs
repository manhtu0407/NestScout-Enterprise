import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolPath, tarPath } from './tool-path.mjs';

export function workflowEnvironment(source = process.env) {
  const allowed = /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|PATHEXT)$/i;
  return { ...Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key))),
    DO_NOT_TRACK: '1', K6_NO_USAGE_REPORT: 'true', K6_AUTO_EXTENSION_RESOLUTION: 'false' };
}

export function assertK6Result(result, negative) {
  assert.equal(result.code, negative ? 99 : 0, 'k6 must preserve the expected threshold exit code');
}

function removeOwnedTemp(directory) {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  assert.ok(!lstatSync(directory).isSymbolicLink());
  assert.match(path.basename(directory), /^nestscout-(?:k6|trivy)-/);
  rmSync(directory, { recursive: true });
}

export async function k6Smoke() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-k6-'));
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    response.writeHead(requests > 20 ? 429 : request.url === '/good' ? 200 : 503);
    response.end('owned synthetic k6 fixture');
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    writeFileSync(path.join(directory, 'config.json'), '{}\n');
    const script = path.join(directory, 'smoke.js');
    const results = [];
    for (const negative of [false, true]) {
      writeFileSync(script, `import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 1, iterations: 5, maxRedirects: 0, thresholds: { checks: ['rate==1'] } };
export default function () { const r = http.get('http://127.0.0.1:${server.address().port}/${negative ? 'bad' : 'good'}', { timeout: '2s', redirects: 0 }); check(r, { 'expected 200': r => r.status === 200 }); }
`);
      const args = ['run', '--config', path.join(directory, 'config.json'), '--no-usage-report', '--vus', '1', '--iterations', '5', '--duration', '10s', script];
      const result = await new Promise((resolve, reject) => {
        const child = spawn(toolPath('k6'), args, { cwd: directory, env: workflowEnvironment(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const timer = setTimeout(() => child.kill(), 20000);
        child.stdout.on('data', data => { output = (output + data).slice(-65536); });
        child.stderr.on('data', data => { output = (output + data).slice(-65536); });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, output }); });
      });
      assertK6Result(result, negative);
      assert.equal(result.signal, null);
      results.push({ command: ['k6', ...args], exit: result.code, assertion: negative ? 'threshold rejected 503' : 'five checks passed' });
    }
    assert.equal(requests, 10);
    return { status: 'PASS', results, requests, ceiling: 20, cleanup: 'PASS: server closed and task files removed', scope: 'Synthetic loopback only; no product performance claim' };
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    removeOwnedTemp(directory);
  }
}

export function trivySmoke() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-trivy-'));
  const run = (args, expected = 0) => {
    const result = spawnSync(toolPath('trivy'), ['--config', path.join(directory, 'trivy.yaml'), '--cache-dir', path.join(directory, 'cache'), '--timeout', '30s', ...args], {
      cwd: directory, env: workflowEnvironment(), encoding: 'utf8', timeout: 45000, maxBuffer: 4 * 1024 * 1024, shell: false, windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, expected, `Trivy expected exit ${expected}: ${result.stderr}`);
    if (expected === 1) assert.match(result.stderr, /first run cannot skip downloading DB/i);
    return result.stdout;
  };
  try {
    writeFileSync(path.join(directory, 'trivy.yaml'), '{}\n');
    const results = [];
    for (const negative of [false, true]) {
      const fixture = path.join(directory, negative ? 'invalid' : 'valid');
      mkdirSync(fixture);
      writeFileSync(path.join(fixture, 'Dockerfile'), `FROM scratch\nUSER ${negative ? 'root' : '65532'}\nHEALTHCHECK CMD ["/health"]\n`);
      const args = ['config', '--skip-check-update', '--skip-version-check', '--misconfig-scanners', 'dockerfile', '--severity', 'HIGH,CRITICAL', '--exit-code', '7', '--format', 'json', fixture];
      const report = JSON.parse(run(args, negative ? 7 : 0));
      const findings = (report.Results ?? []).flatMap(item => item.Misconfigurations ?? []);
      assert.equal(findings.length > 0, negative);
      results.push({ command: ['trivy', ...args], exit: negative ? 7 : 0, findings: findings.length });
    }
    // A disposable Docker archive exercises the image parser without a registry or daemon.
    const archiveRoot = path.join(directory, 'image');
    mkdirSync(archiveRoot);
    writeFileSync(path.join(archiveRoot, 'config.json'), JSON.stringify({ architecture: 'amd64', os: 'linux', config: { User: '65532' }, rootfs: { type: 'layers', diff_ids: [] } }));
    writeFileSync(path.join(archiveRoot, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: ['nestscout-synthetic:local'], Layers: [] }]));
    const archive = path.join(directory, 'image.tar');
    const tar = spawnSync(tarPath(), ['-cf', '../image.tar', 'config.json', 'manifest.json'], { cwd: archiveRoot, timeout: 10000 });
    assert.equal(tar.status, 0);
    const output = path.join(directory, 'sbom.json');
    const args = ['image', '--input', archive, '--skip-db-update', '--skip-java-db-update', '--skip-check-update', '--offline-scan', '--skip-version-check', '--format', 'cyclonedx', '--output', output];
    run(args);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).bomFormat, 'CycloneDX');
    results.push({ command: ['trivy', ...args], exit: 0, assertion: 'synthetic image parsed and CycloneDX generated' });
    run(['image', '--input', archive, '--scanners', 'vuln', '--skip-db-update', '--skip-java-db-update', '--offline-scan', '--skip-version-check'], 1);
    results.push({ exit: 1, assertion: 'missing advisory DB rejects vulnerability scan; no clean-scan claim' });
    return { status: 'PASS', results, rules: 'embedded; no update', vulnerabilityScan: 'BLOCKED: isolated advisory DATABASE_MISSING', cleanup: 'PASS: task files/cache removed' };
  } finally { removeOwnedTemp(directory); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['k6', 'trivy'].includes(args[0])) throw new Error('Use k6 or trivy; no target overrides.');
  console.log(JSON.stringify(args[0] === 'k6' ? await k6Smoke() : trivySmoke(), null, 2));
}
