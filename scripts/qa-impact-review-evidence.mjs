import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { root, toolPath } from './tool-path.mjs';

const revision = 'e977bd0e77d0e5c8750e537dda00c551e6ddc365';
const manifestHash = 'b458bfa88ead7714749ec62eefd71b4b47220ba30b14e68f6cded38964b5935c';
const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const write = (file, value) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
};
const safe = relative => {
  assert.ok(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.split('/').some(part => !part || part === '..' || part === '.'));
  return relative;
};

function counts(directory) {
  const cases = [];
  for (let number = 1; number <= 10; number++) {
    const id = `C${String(number).padStart(2, '0')}`;
    const events = read(path.join(directory, id, 'trace.jsonl')).trim().split(/\r?\n/).map(JSON.parse);
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
      // A diagnostic flag is not a parser of nested PowerShell process status.
      zeroExitWithDiagnostic: e.exit_code === 0 && /fatal:|TypeError:|Cannot find path|Permission denied/i.test(e.aggregated_output) }));
    assert.ok(commands.every(e => Number.isInteger(e.exit)));
    cases.push({ id, commandCount: commands.length, nonzero: commands.filter(e => e.exit !== 0).length,
      zeroExitDiagnostics: commands.filter(e => e.zeroExitWithDiagnostic).map(e => e.id), commands });
  }
  return { cases, commands: cases.reduce((n, c) => n + c.commandCount, 0), nonzero: cases.reduce((n, c) => n + c.nonzero, 0) };
}

async function replay(directory) {
  const pack = JSON.parse(execFileSync('git', ['show', `${revision}:scripts/fixtures/qa-impact-review-r3.json`], { cwd: root, encoding: 'utf8' }));
  const outputs = [];
  let referenceCases = 0, smokeArms = 0;
  const data = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  for (const spec of pack.cases) {
    const shape = pack.shapes[spec.shape];
    const answer = json(path.join(directory, spec.id, 'answer.json'));
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
    const recorded = json(path.join(directory, spec.id, 'reference-oracles.json'));
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

async function audit(directory) {
  const manifest = json(path.join(directory, 'sanitized-manifest.json'));
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.join(directory, safe(relative));
    assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
    assert.equal(sha(readFileSync(file)), expected, relative);
  }
  const derived = counts(directory);
  const replayed = await replay(directory);
  const findings = replayed.findings;
  const rawHashes = json(path.join(directory, 'raw-hashes.json'));
  assert.equal(manifest.rawManifestSHA256, manifestHash);
  assert.equal(sha(readFileSync(path.join(directory, 'raw-hashes.json'))), manifestHash);
  assert.equal(rawHashes.revision, 'QA02-R3-v1');
  assert.deepEqual(Object.keys(manifest.files).sort(), [...Object.keys(rawHashes.files), 'raw-hashes.json', 'commands-derived.json', 'post-run-smoke.json'].sort());
  assert.equal(derived.commands, 73);
  assert.equal(derived.nonzero, 16);
  assert.equal(findings.length, 4);
  return { fileHashes: Object.keys(manifest.files).length, commands: derived.commands, nonzero: derived.nonzero,
    failureClasses: Object.fromEntries(['probe-TypeError', 'git-NUL', 'missing-path-bundle', 'UNCLASSIFIED'].map(kind => [kind, derived.cases.flatMap(c => c.commands).filter(c => c.failureClass === kind).length])),
    zeroExitDiagnostics: derived.cases.filter(c => c.zeroExitDiagnostics.length).map(c => ({ id: c.id, items: c.zeroExitDiagnostics })),
    replayedFindings: findings, sourceOnlyReferenceCases: replayed.referenceCases, sourceOnlySmokeArms: replayed.smokeArms,
    review: 'Deterministic reconstruction; independent human review NOT RUN.' };
}

async function exportEvidence() {
  const raw = path.join(root, '.cache/qa02-r3');
  const original = readFileSync(path.join(raw, 'evidence-manifest.json'));
  assert.equal(sha(original), manifestHash, 'R3-v1 manifest changed');
  const manifest = JSON.parse(original);
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.join(raw, safe(relative));
    assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink());
    assert.equal(sha(readFileSync(file)), expected, relative);
  }
  const cases = json(path.join(raw, 'cases.json'));
  const threads = cases.map(c => [json(path.join(c.out, 'execution.json')).id,
    JSON.parse(read(path.join(c.out, 'trace.jsonl')).split(/\r?\n/)[0]).thread_id]);
  const replacementCounts = { home: 0, fixture: 0, thread: 0 };
  const sanitizeText = text => {
    let value = text.replace(/C:(?:\\+|\/)Users(?:\\+|\/)(?:Phan(?:%20| )Manh(?:%20| )Tu|PHANMA~1)/gi, () => { replacementCounts.home++; return '<USER_HOME>'; });
    for (const c of cases) {
      value = value.replaceAll(path.basename(c.directory), () => { replacementCounts.fixture++; return `<FIXTURE_${c.id}>`; });
    }
    for (const [id, thread] of threads) value = value.replaceAll(thread, () => { replacementCounts.thread++; return `<THREAD_${id}>`; });
    assert.ok(!/Phan(?:%20| )Manh(?:%20| )Tu|PHANMA~1|[A-Z]:(?:\\+|\/)Users(?:\\+|\/)/i.test(value), 'Unmapped private path; stop export');
    return value;
  };
  const transform = value => typeof value === 'string' ? sanitizeText(value) : Array.isArray(value) ? value.map(transform)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [sanitizeText(k), transform(v)])) : value;
  const destination = mkdtempSync(path.join(root, '.cache/qa02-r3-sanitized-'));
  const hashes = {};
  for (const relative of Object.keys(manifest.files).sort()) {
    const content = read(path.join(raw, relative));
    const output = relative.endsWith('.jsonl') ? content.trim().split(/\r?\n/).map(line => JSON.stringify(transform(JSON.parse(line)))).join('\n') + '\n'
      : relative.endsWith('.json') ? JSON.stringify(transform(JSON.parse(content)), null, 2) + '\n' : sanitizeText(content);
    write(path.join(destination, relative), output);
    hashes[relative] = sha(output);
  }
  write(path.join(destination, 'raw-hashes.json'), manifest);
  hashes['raw-hashes.json'] = sha(readFileSync(path.join(destination, 'raw-hashes.json')));
  write(path.join(destination, 'commands-derived.json'), counts(destination));
  hashes['commands-derived.json'] = sha(readFileSync(path.join(destination, 'commands-derived.json')));
  const supplement = readFileSync(path.join(root, '.cache/qa02-r3-post-run-smoke.json'));
  write(path.join(destination, 'post-run-smoke.json'), transform(JSON.parse(supplement)));
  hashes['post-run-smoke.json'] = sha(readFileSync(path.join(destination, 'post-run-smoke.json')));
  const scanner = toolPath('gitleaks');
  assert.match(execFileSync(scanner, ['version'], { encoding: 'utf8' }), /8\.30\.1/);
  const scan = execFileSync(scanner, ['dir', destination, '--redact', '--no-banner'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  write(path.join(destination, 'sanitized-manifest.json'), { revision: 'QA02-v1-export-v1', sourceRevision: revision,
    rawManifestSHA256: manifestHash, files: hashes, replacements: replacementCounts,
    supplementalEvidence: { file: 'post-run-smoke.json', rawSHA256: sha(supplement), limitation: 'Post-run record outside the original 156-file seal/manifest.' },
    preserved: 'All original event order, commands, outputs, numeric exits and grading; only mapped home/fixture/thread identifiers replaced. JSON encoding normalized.',
    scan: { tool: 'Gitleaks 8.30.1', exit: 0, stdout: scan }, humanPrivacyReview: 'REQUIRED BEFORE SHARING' });
  const result = await audit(destination);
  console.log(JSON.stringify({ destination, manifestSHA256: sha(readFileSync(path.join(destination, 'sanitized-manifest.json'))), ...result }, null, 2));
}

const [action, directory] = process.argv.slice(2);
if (action === 'export-v1' && !directory) await exportEvidence();
else if (action === 'audit-v1' && directory && path.isAbsolute(directory)) console.log(JSON.stringify(await audit(directory), null, 2));
else throw new Error('Use export-v1 or audit-v1 <absolute sanitized directory>. Never modifies R3-v1 evidence; no upload or model invocation.');
