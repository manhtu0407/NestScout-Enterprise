import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, lstatSync, readdirSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { root, toolPath } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';

const revision = 'e977bd0e77d0e5c8750e537dda00c551e6ddc365';
const manifestHash = 'b458bfa88ead7714749ec62eefd71b4b47220ba30b14e68f6cded38964b5935c';
const sha = value => createHash('sha256').update(value).digest('hex');
export function evidencePath(file, type = 'file') {
  assert.equal(typeof file, 'string', 'Invalid evidence path');
  assert.ok(path.isAbsolute(file) && !file.includes('\0'), 'Absolute evidence path required');
  assert.ok(!file.split(/[\\/]/).some(part => part === '.' || part === '..'), 'Evidence path traversal');
  assert.ok(!/^(?:\\\\|\/\/)/.test(file), 'Network/device evidence paths forbidden');
  const absolute = path.resolve(file), anchor = path.parse(absolute).root;
  const parts = absolute.slice(anchor.length).split(path.sep).filter(Boolean);
  assert.ok(parts.every(part => !/[:\x00-\x1f]/.test(part) && !/[. ]$/.test(part)
    && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)), 'Unsafe evidence path component');
  let current = anchor;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    assert.ok(!stat.isSymbolicLink(), 'Evidence symlink/junction forbidden');
    const directory = index < parts.length - 1 || type === 'directory';
    assert.ok(directory ? stat.isDirectory() : stat.isFile(), 'Nonregular evidence path');
  }
  return absolute;
}

export function evidenceRelative(relative) {
  assert.equal(typeof relative, 'string', 'Invalid evidence relative path');
  assert.ok(relative.length > 0 && relative.split('/').every(part =>
    /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part) && !/[.]$/.test(part)
    && !/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)), 'Unsafe evidence relative path');
  return relative;
}
const member = (directory, relative) => path.join(evidencePath(directory, 'directory'), evidenceRelative(relative));
const bytes = file => {
  const checked = evidencePath(file);
  const before = lstatSync(checked);
  const fd = openSync(checked, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd);
    assert.ok(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino, 'Evidence changed during open');
    evidencePath(checked);
    return readFileSync(fd);
  } finally { closeSync(fd); }
};
const read = file => new TextDecoder('utf-8', { fatal: true }).decode(bytes(file));
const json = file => JSON.parse(read(file));
const write = (file, value) => {
  evidencePath(path.dirname(file), 'directory');
  evidenceRelative(path.basename(file));
  writeFileSync(file, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
const writeMember = (directory, relative, value) => {
  evidenceRelative(relative);
  let parent = evidencePath(directory, 'directory');
  for (const part of relative.split('/').slice(0, -1)) {
    const next = path.join(parent, part);
    try { mkdirSync(next); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    parent = evidencePath(next, 'directory');
  }
  write(path.join(parent, path.posix.basename(relative)), value);
};

function hashTable(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'Invalid evidence hash table');
  const folded = new Set();
  for (const [relative, digest] of Object.entries(value)) {
    evidenceRelative(relative);
    assert.match(digest, /^[a-f0-9]{64}$/, 'Invalid evidence digest');
    assert.ok(!folded.has(relative.toLowerCase()), 'Evidence case alias');
    folded.add(relative.toLowerCase());
  }
}

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function evidenceSanitizer(config, cases = [], threads = []) {
  assert.deepEqual(Object.keys(config).sort(), ['profilePrefixes'], 'Invalid task-local mapping schema');
  assert.ok(Array.isArray(config.profilePrefixes) && config.profilePrefixes.length > 0, 'Missing task-local profile mappings');
  const prefixes = config.profilePrefixes.map(prefix => {
    assert.equal(typeof prefix, 'string');
    const normalized = prefix.replaceAll('\\', '/');
    assert.match(normalized, /^(?:[A-Za-z]:\/Users|\/home|\/Users)\/[^/\x00-\x1f<>]+$/, 'Map an exact profile prefix, never a broad ancestor');
    assert.ok(!/[. ]$/.test(normalized) && !['.', '..'].includes(path.posix.basename(normalized)), 'Invalid profile mapping');
    return normalized;
  });
  assert.equal(new Set(prefixes.map(p => p.toLowerCase())).size, prefixes.length, 'Duplicate profile mapping');
  const counts = { home: 0, fixture: 0, thread: 0 };
  const segment = part => /^[A-Za-z]:$/.test(part) ? escape(part[0]) + '(?::|%3A)' : escape(part).replaceAll(' ', '(?: |%20)');
  const patterns = prefixes.sort((a, b) => b.length - a.length).map(prefix => new RegExp(prefix.split('/').map(segment)
    .join('(?:\\\\+|/)') + '(?=$|[\\\\/\\s"\'`])', 'gi'));
  const privateLabels = prefixes.map(prefix => new RegExp(escape(path.posix.basename(prefix)).replaceAll(' ', '(?: |%20)'), 'i'));
  const fixtures = cases.map(c => {
    assert.match(c.id, /^C(?:0[1-9]|10)$/);
    const name = path.win32.basename(c.directory);
    assert.match(name, /^nestscout-agent-evaluation-[A-Za-z0-9]+$/);
    return [name, `<FIXTURE_${c.id}>`];
  });
  assert.equal(new Set(fixtures.map(([name]) => name)).size, fixtures.length, 'Duplicate fixture mapping');
  assert.equal(new Set(threads.map(([, thread]) => thread)).size, threads.length, 'Duplicate thread mapping');
  for (const [id, thread] of threads) {
    assert.match(id, /^C(?:0[1-9]|10)$/);
    assert.match(thread, /^[a-f0-9-]{36}$/);
  }
  const text = input => {
    let value = input;
    for (const pattern of patterns) value = value.replace(pattern, () => { counts.home++; return '<USER_HOME>'; });
    for (const [name, token] of fixtures) value = value.replaceAll(name, () => { counts.fixture++; return token; });
    for (const [id, thread] of threads) value = value.replaceAll(thread, () => { counts.thread++; return `<THREAD_${id}>`; });
    assert.ok(!/(?:[A-Z](?::|%3A)(?:\\+|\/)(?:Users|Documents(?: |%20)and(?: |%20)Settings)(?:\\+|\/)|\/(?:home|Users)\/|%5c|%2f|\\\\[^\\\s]+\\Users\\)/i.test(value)
      && !privateLabels.some(pattern => pattern.test(value)), 'Unmapped private path/identifier; stop export');
    return value;
  };
  const transform = value => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(transform);
    if (!value || typeof value !== 'object') return value;
    const entries = Object.entries(value).map(([key, item]) => [text(key), transform(item)]);
    assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'Sanitized key collision');
    return Object.fromEntries(entries);
  };
  return { text, transform, counts };
}

function transformed(content, relative, sanitizer) {
  return relative.endsWith('.jsonl') ? content.trim().split(/\r?\n/).map(line => JSON.stringify(sanitizer.transform(JSON.parse(line)))).join('\n') + '\n'
    : relative.endsWith('.json') ? JSON.stringify(sanitizer.transform(JSON.parse(content)), null, 2) + '\n' : sanitizer.text(content);
}

function counts(directory) {
  const cases = [];
  for (let number = 1; number <= 10; number++) {
    const id = `C${String(number).padStart(2, '0')}`;
    const events = read(member(directory, `${id}/trace.jsonl`)).trim().split(/\r?\n/).map(JSON.parse);
    const starts = events.filter(e => e.type === 'item.started' && e.item.type === 'command_execution').map(e => e.item);
    const ends = events.filter(e => e.type === 'item.completed' && e.item.type === 'command_execution').map(e => e.item);
    assert.equal(starts.length, ends.length);
    assert.equal(new Set(starts.map(e => e.id)).size, starts.length);
    assert.equal(new Set(ends.map(e => e.id)).size, ends.length);
    assert.deepEqual(starts.map(e => e.id).sort(), ends.map(e => e.id).sort());
    for (const end of ends) assert.equal(starts.find(start => start.id === end.id).command, end.command);
    const commands = ends.map(e => ({ id: e.id, command: e.command, exit: e.exit_code, output: e.aggregated_output,
      failureClass: e.exit_code === 0 ? null : /TypeError:/.test(e.aggregated_output) ? 'probe-TypeError'
        : /cannot use NUL as an exclude file/.test(e.aggregated_output) ? 'git-NUL' : /Cannot find path/.test(e.aggregated_output) ? 'missing-path-bundle' : 'UNCLASSIFIED',
      zeroExitWithDiagnostic: e.exit_code === 0 && /fatal:|TypeError:|Cannot find path|Permission denied/i.test(e.aggregated_output) }));
    assert.ok(commands.every(e => Number.isInteger(e.exit)));
    cases.push({ id, commandCount: commands.length, nonzero: commands.filter(e => e.exit !== 0).length,
      zeroExitDiagnostics: commands.filter(e => e.zeroExitWithDiagnostic).map(e => e.id), commands });
  }
  return { cases, commands: cases.reduce((n, c) => n + c.commandCount, 0), nonzero: cases.reduce((n, c) => n + c.nonzero, 0) };
}

async function replay(directory) {
  const pack = JSON.parse(execFileSync('git', ['show', `${revision}:scripts/fixtures/qa-impact-review-r3.json`], { cwd: root, env: gitEnvironment(), encoding: 'utf8' }));
  const outputs = [];
  let referenceCases = 0, smokeArms = 0;
  const data = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  for (const spec of pack.cases) {
    const shape = pack.shapes[spec.shape];
    const answer = json(member(directory, `${spec.id}/answer.json`));
    const implementations = {};
    for (const arm of ['base', 'head']) {
      const moduleUrl = data(shape[arm === 'base' ? 'base' : spec.variant]);
      const consumer = data(shape.consumer.replace(/from\s+(['"])[^'"]+\1/, `from ${JSON.stringify(moduleUrl)}`));
      implementations[arm] = (await import(consumer)).evaluate;
      const code = `import assert from 'node:assert/strict'; import {evaluate} from ${JSON.stringify(consumer)};\n` + shape.smoke;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10000 });
      assert.ifError(result.error);
      assert.equal(result.status, 0, `${spec.id}/${arm} smoke: ${result.stderr}`);
      smokeArms++;
    }
    const inputs = spec.expectedDefects ? [shape.witness] : shape.oracleInputs;
    const baseOutputs = inputs.map(implementations.base), headOutputs = inputs.map(implementations.head);
    assert.equal(isDeepStrictEqual(baseOutputs, headOutputs), !spec.expectedDefects, `${spec.id} reference behavior`);
    const recorded = json(member(directory, `${spec.id}/reference-oracles.json`));
    assert.equal(recorded.oracle.base.exit, 0);
    assert.equal(recorded.oracle.head.exit, spec.expectedDefects ? 1 : 0);
    referenceCases++;
    for (const finding of answer.findings) {
      const actual = {};
      for (const arm of ['base', 'head']) {
        const moduleUrl = data(shape[arm === 'base' ? 'base' : spec.variant]);
        const consumer = shape.consumer.replace(/from\s+(['"])[^'"]+\1/, `from ${JSON.stringify(moduleUrl)}`);
        actual[arm] = (await import(data(consumer))).evaluate(JSON.parse(finding.input_json));
      }
      assert.ok(isDeepStrictEqual(actual.base, JSON.parse(finding.expected_json)));
      assert.ok(isDeepStrictEqual(actual.head, JSON.parse(finding.actual_json)));
      assert.ok(!isDeepStrictEqual(actual.base, actual.head));
      assert.equal(finding.line, 1);
      assert.equal(path.posix.basename(finding.file.replaceAll('\\', '/')), path.posix.basename(shape.file));
      assert.ok(finding.consumer.includes('consumer.mjs'));
      outputs.push({ id: spec.id, actual });
    }
  }
  return { findings: outputs, referenceCases, smokeArms };
}

function inventory(directory, prefix = '') {
  const files = [];
  for (const name of readdirSync(evidencePath(directory, 'directory'))) {
    const relative = evidenceRelative(prefix + name);
    const file = path.join(directory, name), stat = lstatSync(file);
    assert.ok(!stat.isSymbolicLink(), 'Evidence symlink/junction forbidden');
    if (stat.isDirectory()) files.push(...inventory(file, relative + '/'));
    else { evidencePath(file); files.push(relative); }
  }
  return files.sort();
}

export async function auditEvidence(directory, expectedManifestSHA256, pinnedRawManifestSHA256 = manifestHash) {
  assert.match(expectedManifestSHA256 ?? '', /^[a-f0-9]{64}$/, 'Trusted sanitized manifest digest required');
  evidencePath(directory, 'directory');
  const manifestBytes = bytes(member(directory, 'sanitized-manifest.json'));
  assert.equal(sha(manifestBytes), expectedManifestSHA256, 'Sanitized manifest integrity');
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.revision, 'QA02-v1-export-v2', 'Use a hardened v2 export; historical v1 packages remain untouched');
  assert.equal(manifest.sourceRevision, revision);
  assert.equal(manifest.rawManifestSHA256, pinnedRawManifestSHA256, 'Raw manifest pin');
  hashTable(manifest.files);
  const original = bytes(member(directory, 'raw-hashes.json'));
  assert.equal(sha(original), pinnedRawManifestSHA256, 'Original manifest integrity');
  const rawHashes = JSON.parse(original);
  assert.equal(rawHashes.revision, 'QA02-R3-v1');
  hashTable(rawHashes.files);
  const expectedFiles = [...Object.keys(rawHashes.files), 'raw-hashes.json', 'commands-derived.json', 'post-run-smoke.json'].sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), expectedFiles, 'Evidence payload allow-list');
  assert.deepEqual(inventory(directory), [...expectedFiles, 'sanitized-manifest.json'].sort(), 'Evidence directory inventory');
  assert.deepEqual(Object.keys(manifest.mapping.files).sort(), Object.keys(rawHashes.files).sort(), 'Raw mapping coverage');
  for (const [relative, expected] of Object.entries(manifest.files)) {
    assert.equal(sha(bytes(member(directory, relative))), expected, `Evidence payload integrity: ${relative}`);
    if (relative in rawHashes.files) assert.deepEqual(manifest.mapping.files[relative],
      { rawSHA256: rawHashes.files[relative], sanitizedSHA256: expected }, 'Raw-to-sanitized hash linkage');
  }
  assert.equal(manifest.mapping.method, 'Exact profile/fixture/thread token replacement; decoded JSON values and keys; no event filtering');
  assert.equal(manifest.scan.tool, 'Gitleaks 8.30.1');
  assert.equal(manifest.scan.exit, 0);
  assert.equal(manifest.humanPrivacyReview, 'REQUIRED BEFORE SHARING');
  assert.equal(manifest.supplementalEvidence.file, 'post-run-smoke.json');
  assert.match(manifest.supplementalEvidence.rawSHA256, /^[a-f0-9]{64}$/);
  const derived = counts(directory);
  assert.deepEqual(json(member(directory, 'commands-derived.json')), derived, 'Derived command ledger mismatch');
  const replayed = await replay(directory);
  const findings = replayed.findings;
  assert.equal(derived.commands, 73);
  assert.equal(derived.nonzero, 16);
  assert.equal(findings.length, 4);
  return { fileHashes: Object.keys(manifest.files).length, commands: derived.commands, nonzero: derived.nonzero,
    failureClasses: Object.fromEntries(['probe-TypeError', 'git-NUL', 'missing-path-bundle', 'UNCLASSIFIED'].map(kind => [kind, derived.cases.flatMap(c => c.commands).filter(c => c.failureClass === kind).length])),
    zeroExitDiagnostics: derived.cases.filter(c => c.zeroExitDiagnostics.length).map(c => ({ id: c.id, items: c.zeroExitDiagnostics })),
    replayedFindings: findings, sourceOnlyReferenceCases: replayed.referenceCases, sourceOnlySmokeArms: replayed.smokeArms,
    review: 'Deterministic reconstruction; independent human review NOT RUN.' };
}

async function exportEvidence(mappingFile) {
  const config = json(mappingFile);
  const raw = path.join(root, '.cache/qa02-r3');
  const original = bytes(member(raw, 'evidence-manifest.json'));
  assert.equal(sha(original), manifestHash, 'R3-v1 manifest changed');
  const manifest = JSON.parse(original);
  hashTable(manifest.files);
  for (const [relative, expected] of Object.entries(manifest.files)) {
    assert.equal(sha(bytes(member(raw, relative))), expected, relative);
  }
  const cases = json(member(raw, 'cases.json'));
  assert.deepEqual(cases.map(c => c.id), Array.from({ length: 10 }, (_, n) => `C${String(n + 1).padStart(2, '0')}`));
  const threads = cases.map(c => [c.id, JSON.parse(read(member(raw, `${c.id}/trace.jsonl`)).split(/\r?\n/)[0]).thread_id]);
  const sanitizer = evidenceSanitizer(config, cases, threads);
  const outputs = {};
  const hashes = {};
  for (const relative of Object.keys(manifest.files).sort()) {
    const content = read(member(raw, relative));
    assert.equal(sha(content), manifest.files[relative], 'Raw changed during export');
    const output = transformed(content, relative, sanitizer);
    outputs[relative] = output;
    hashes[relative] = sha(output);
  }
  const supplement = bytes(path.join(root, '.cache/qa02-r3-post-run-smoke.json'));
  const sanitizedSupplement = sanitizer.transform(JSON.parse(supplement));
  const destination = mkdtempSync(path.join(evidencePath(path.join(root, '.cache'), 'directory'), 'qa02-r3-sanitized-'));
  for (const [relative, output] of Object.entries(outputs)) writeMember(destination, relative, output);
  write(member(destination, 'raw-hashes.json'), original);
  hashes['raw-hashes.json'] = sha(original);
  write(member(destination, 'commands-derived.json'), counts(destination));
  hashes['commands-derived.json'] = sha(bytes(member(destination, 'commands-derived.json')));
  write(member(destination, 'post-run-smoke.json'), sanitizedSupplement);
  hashes['post-run-smoke.json'] = sha(bytes(member(destination, 'post-run-smoke.json')));
  const scanner = toolPath('gitleaks');
  assert.match(execFileSync(scanner, ['version'], { encoding: 'utf8' }), /8\.30\.1/);
  const scan = execFileSync(scanner, ['dir', destination, '--redact', '--no-banner'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  write(member(destination, 'sanitized-manifest.json'), { revision: 'QA02-v1-export-v2', sourceRevision: revision,
    rawManifestSHA256: manifestHash, files: hashes, replacements: sanitizer.counts,
    mapping: { method: 'Exact profile/fixture/thread token replacement; decoded JSON values and keys; no event filtering',
      files: Object.fromEntries(Object.entries(manifest.files).map(([file, digest]) => [file, { rawSHA256: digest, sanitizedSHA256: hashes[file] }])) },
    supplementalEvidence: { file: 'post-run-smoke.json', rawSHA256: sha(supplement), limitation: 'Post-run record outside the original 156-file seal/manifest.' },
    preserved: 'All original event order, commands, outputs, numeric exits and grading; only mapped home/fixture/thread identifiers replaced. JSON encoding normalized.',
    scan: { tool: 'Gitleaks 8.30.1', exit: 0, stdout: scan }, humanPrivacyReview: 'REQUIRED BEFORE SHARING' });
  execFileSync(scanner, ['dir', destination, '--redact', '--no-banner'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const manifestSHA256 = sha(bytes(member(destination, 'sanitized-manifest.json')));
  const comparison = evidenceSanitizer(config, cases, threads);
  for (const [relative, digest] of Object.entries(manifest.files)) {
    const content = read(member(raw, relative));
    assert.equal(sha(content), digest, 'Raw preservation');
    assert.equal(transformed(content, relative, comparison), read(member(destination, relative)), 'Raw transformation mismatch');
  }
  assert.equal(sha(bytes(path.join(root, '.cache/qa02-r3-post-run-smoke.json'))), sha(supplement), 'Supplement preservation');
  assert.deepEqual(comparison.transform(JSON.parse(supplement)), json(member(destination, 'post-run-smoke.json')), 'Supplement transformation');
  assert.deepEqual(comparison.counts, JSON.parse(read(member(destination, 'sanitized-manifest.json'))).replacements, 'Transformation counts');
  assert.equal(sha(bytes(member(raw, 'evidence-manifest.json'))), manifestHash);
  const result = await auditEvidence(destination, manifestSHA256);
  console.log(JSON.stringify({ destination, manifestSHA256, rawPreservation: '156/156', transformationComparisons: 156, ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, directory, digest, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, 'Unexpected arguments');
  if (action === 'export-v1' && directory && !digest) await exportEvidence(directory);
  else if (action === 'audit-v1' && directory && digest) console.log(JSON.stringify(await auditEvidence(directory, digest), null, 2));
  else throw new Error('Use export-v1 <absolute task-local mapping JSON> or audit-v1 <absolute sanitized directory> <trusted manifest SHA256>. No upload/model invocation.');
}
