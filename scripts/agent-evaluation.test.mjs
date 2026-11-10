import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, realpathSync, lstatSync, mkdtempSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { prepareEvaluation, verifyEvaluation, scenarios, toolScenarios, v3ToolScenarios } from './agent-evaluation.mjs';
import { gitEnvironment } from './git-environment.mjs';

test('evaluation fixture reproduces failure and detects policy, index, scratch and peer mutations', () => {
  const fixture = prepareEvaluation();
  try {
    assert.equal(scenarios.length, new Set(scenarios.map(([id]) => id)).size);
    assert.equal(verifyEvaluation(fixture.directory).fixturePreservation, 'PASS');
    const result = spawnSync(process.execPath, ['--test', 'scripts/example.test.mjs'], {
      cwd: fixture.checkout, encoding: 'utf8',
      env: Object.fromEntries(Object.entries(gitEnvironment()).filter(([name]) => name !== 'NODE_TEST_CONTEXT')),
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /total preserves addition contract/);
    for (const relative of ['checkout/AGENTS.md', 'checkout/scripts/example.test.mjs', 'peer/unrelated.txt', 'peer/.cache/operation.lock']) {
      const file = path.join(fixture.directory, relative);
      const content = readFileSync(file);
      writeFileSync(file, 'unauthorized change\n');
      assert.throws(() => verifyEvaluation(fixture.directory), /changed fixture/);
      writeFileSync(file, content);
    }
    const scratch = path.join(fixture.checkout, 'scratch.log');
    writeFileSync(scratch, 'disposable\n');
    assert.throws(() => verifyEvaluation(fixture.directory), /changed fixture/);
    rmSync(scratch);
    const staged = spawnSync('git', ['add', '--', 'unrelated.txt'], { cwd: fixture.checkout, env: gitEnvironment() });
    assert.equal(staged.status, 0);
    assert.throws(() => verifyEvaluation(fixture.directory), /changed fixture/);
  } finally {
    assert.equal(path.dirname(realpathSync(fixture.directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(fixture.directory).isSymbolicLink());
    rmSync(fixture.directory, { recursive: true });
  }
});

test('failed evaluation preparation propagates the Git error and removes only its owned directory', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-evaluation-failure-'));
  try {
    const environment = Object.fromEntries(Object.entries(gitEnvironment())
      .filter(([name]) => !/^(PATH|TMP|TEMP|TMPDIR|NODE_TEST_CONTEXT)$/i.test(name)));
    const module = new URL('./agent-evaluation.mjs', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e',
      `const { prepareEvaluation } = await import(${JSON.stringify(module)}); prepareEvaluation();`], {
      env: { ...environment, PATH: '', TMP: directory, TEMP: directory, TMPDIR: directory }, encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ENOENT/);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});

test('tool-choice evaluation reuses preservation harness and records copied discovery inputs before a session', () => {
  const fixture = prepareEvaluation(true);
  try {
    const baseline = JSON.parse(readFileSync(path.join(fixture.directory, 'baseline.json')));
    assert.deepEqual(baseline.scenarioIds, toolScenarios.map(([id]) => id));
    assert.equal(toolScenarios.length, new Set(baseline.scenarioIds).size);
    assert.equal(verifyEvaluation(fixture.directory).fixturePreservation, 'PASS');
    const catalog = path.join(fixture.checkout, 'scripts/tool-capabilities.json');
    const before = readFileSync(catalog);
    writeFileSync(catalog, '{}\n');
    assert.throws(() => verifyEvaluation(fixture.directory), /changed fixture/);
    writeFileSync(catalog, before);
    assert.equal(verifyEvaluation(fixture.directory).fixturePreservation, 'PASS');
  } finally {
    assert.equal(path.dirname(realpathSync(fixture.directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(fixture.directory).isSymbolicLink());
    rmSync(fixture.directory, { recursive: true });
  }
});

test('V3 scenarios extend V2 and the single disposable skill is included in preservation evidence', () => {
  assert.deepEqual(v3ToolScenarios.slice(0, toolScenarios.length), toolScenarios);
  assert.ok(v3ToolScenarios.length >= 12);
  for (const skill of [false, true]) {
    const fixture = prepareEvaluation(true, !skill, skill);
    try {
      const baseline = JSON.parse(readFileSync(path.join(fixture.directory, 'baseline.json')));
      assert.match(baseline.fixtureSHA, /^[a-f0-9]{64}$/);
      assert.equal(verifyEvaluation(fixture.directory).fixturePreservation, 'PASS');
      if (skill) {
        const file = path.join(fixture.checkout, '.agents/skills/dependency-security-triage/SKILL.md');
        assert.match(readFileSync(file, 'utf8'), /docs\/tool-library\/trivy.md/);
        writeFileSync(file, 'changed candidate\n');
        assert.throws(() => verifyEvaluation(fixture.directory), /changed fixture/);
      } else assert.deepEqual(baseline.scenarioIds, v3ToolScenarios.map(([id]) => id));
    } finally {
      assert.equal(path.dirname(realpathSync(fixture.directory)), realpathSync(tmpdir()));
      assert.ok(!lstatSync(fixture.directory).isSymbolicLink());
      rmSync(fixture.directory, { recursive: true });
    }
  }
});
