import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { prepareEvaluation, verifyEvaluation, scenarios } from './agent-evaluation.mjs';

test('evaluation fixture reproduces failure and detects policy, index, scratch and peer mutations', () => {
  const fixture = prepareEvaluation();
  try {
    assert.equal(scenarios.length, new Set(scenarios.map(([id]) => id)).size);
    assert.equal(verifyEvaluation(fixture.directory).fixturePreservation, 'PASS');
    const result = spawnSync(process.execPath, ['--test', 'scripts/example.test.mjs'], {
      cwd: fixture.checkout, encoding: 'utf8',
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT')),
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
    const staged = spawnSync('git', ['add', '--', 'unrelated.txt'], { cwd: fixture.checkout });
    assert.equal(staged.status, 0);
    assert.throws(() => verifyEvaluation(fixture.directory), /changed fixture/);
  } finally {
    assert.equal(path.dirname(realpathSync(fixture.directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(fixture.directory).isSymbolicLink());
    rmSync(fixture.directory, { recursive: true });
  }
});
