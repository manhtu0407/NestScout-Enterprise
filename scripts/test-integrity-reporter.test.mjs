import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { root } from './tool-path.mjs';

const reporter = path.join(root, 'scripts/test-integrity-reporter.mjs');
const header = "import { test, describe, it } from 'node:test';\n";
const sources = {
  passing: header + "test('passes', () => {});\n",
  skipped: header + "test('runs', () => {});\ntest.skip('disabled', () => {});\n",
  todo: header + "test('runs', () => {});\ntest('later', { todo: true }, () => {});\n",
  conditional: header + "test('runs', () => {});\ntest('platform', { skip: true }, () => {});\n",
  runtime: header + "test('runs', () => {});\ntest('late', t => { t.skip('not today'); });\n",
  nested: header + "describe('suite', () => { it('runs', () => {}); it.skip('hidden', () => {}); });\n",
  allSkipped: header + "test.skip('only', () => {});\n",
  skippedSuite: header + "test('runs', () => {});\ndescribe.skip('disabled suite', () => { it('inner', () => {}); });\n",
  todoSuite: header + "test('runs', () => {});\ndescribe('later suite', { todo: true }, () => { it('inner', () => {}); });\n",
  nestedSkippedSuite: header + "describe('outer', () => { it('runs', () => {}); describe.skip('inner suite', () => { it('deep', () => {}); }); });\n",
  onlySkippedSuite: header + "describe.skip('whole file', () => { it('inner', () => {}); });\n",
  passingSuites: header + "describe('outer', () => { it('runs', () => {}); describe('inner', () => { it('also runs', () => {}); }); });\n",
  empty: "import 'node:test';\n",
  failing: header + "test('fails', () => { throw new Error('expected failure'); });\n",
};

function run(files, manifest = {}, { defaultReporter = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-test-integrity-'));
  try {
    writeFileSync(path.join(directory, 'package.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    for (const [name, source] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
      writeFileSync(path.join(directory, name), source);
    }
    const args = ['--test', ...(defaultReporter ? [] : [`--test-reporter=${reporter}`]), ...Object.keys(files).filter(name => /\.test\.mjs$/.test(name))];
    const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'NODE_TEST_CONTEXT')) });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
}
const exception = (file, name, reason = 'Documented platform limitation.') => ({ repositoryHygiene: { testExceptions: [{ file, name, reason }] } });

test('the default node:test reporter accepts skipped, todo and empty tests, which is the defect being guarded', () => {
  for (const name of ['skipped', 'todo', 'allSkipped', 'empty']) {
    assert.equal(run({ 'a.test.mjs': sources[name] }, {}, { defaultReporter: true }).status, 0, name);
  }
});

test('executed passing tests are accepted with the readable spec output preserved', () => {
  const result = run({ 'a.test.mjs': sources.passing, 'b.test.mjs': sources.passing });
  assert.equal(result.status, 0);
  assert.match(result.output, /✔ passes/);
  assert.match(result.output, /ℹ pass 2/);
});

test('skipped, todo, runtime-skipped, nested and fully disabled tests fail without an exception', () => {
  const expectations = { skipped: /disabled" was skipped/, todo: /later" was marked todo/, conditional: /platform" was skipped/,
    runtime: /late" was skipped/, nested: /hidden" was skipped/, allSkipped: /only" was skipped/ };
  for (const [name, message] of Object.entries(expectations)) {
    const result = run({ 'a.test.mjs': sources[name] });
    assert.equal(result.status, 1, name);
    assert.match(result.output, message, name);
    assert.match(result.output, /Test integrity violations/, name);
  }
});

test('a test file that registers no test fails even though node:test reports a placeholder pass', () => {
  const result = run({ 'a.test.mjs': sources.passing, 'empty.test.mjs': sources.empty });
  assert.equal(result.status, 1);
  assert.match(result.output, /empty\.test\.mjs: no test executed/);
});

test('real failures still fail and are not masked by the reporter', () => {
  const result = run({ 'a.test.mjs': sources.failing });
  assert.equal(result.status, 1);
  assert.match(result.output, /expected failure/);
});

test('a documented exception permits exactly its file and test name', () => {
  assert.equal(run({ 'a.test.mjs': sources.conditional }, exception('a.test.mjs', 'platform')).status, 0);
  assert.equal(run({ 'a.test.mjs': sources.todo }, exception('a.test.mjs', 'later')).status, 0);
  for (const [file, name] of [['a.test.mjs', 'another'], ['b.test.mjs', 'platform']]) {
    const result = run({ 'a.test.mjs': sources.conditional, 'b.test.mjs': sources.passing }, exception(file, name));
    assert.equal(result.status, 1, `${file}:${name}`);
  }
  const duplicate = run({ 'a.test.mjs': sources.conditional.replace("'runs'", "'runs'") + "test('platform2', { skip: true }, () => {});\n" }, exception('a.test.mjs', 'platform'));
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.output, /platform2" was skipped/);
});

test('stale exceptions and malformed exception records fail', () => {
  const stale = run({ 'a.test.mjs': sources.passing }, exception('a.test.mjs', 'platform'));
  assert.equal(stale.status, 1);
  assert.match(stale.output, /no longer matches a skipped test/);
  for (const bad of [exception('a.test.mjs', 'platform', ' '), { repositoryHygiene: { testExceptions: 'all' } }, { repositoryHygiene: { testExceptions: [{ file: 'a.test.mjs', name: 'platform' }] } }]) {
    const result = run({ 'a.test.mjs': sources.conditional }, bad);
    assert.equal(result.status, 1);
    assert.match(result.output, /testExceptions entries need non-empty/);
  }
  assert.equal(run({ 'a.test.mjs': sources.passing }, '{not json').status, 1);
});

test('skipped, todo, nested and whole-file skipped suites fail even though their children never run', () => {
  const expectations = { skippedSuite: /suite "disabled suite" was skipped/, todoSuite: /suite "later suite" was marked todo/,
    nestedSkippedSuite: /suite "inner suite" was skipped/, onlySkippedSuite: /suite "whole file" was skipped/ };
  for (const [name, message] of Object.entries(expectations)) {
    const result = run({ 'a.test.mjs': sources[name] });
    assert.equal(result.status, 1, name);
    assert.match(result.output, message, name);
  }
  assert.equal(run({ 'a.test.mjs': sources.skippedSuite }, {}, { defaultReporter: true }).status, 0, 'default reporter accepts a skipped suite');
});

test('valid passing and nested suites are accepted', () => {
  const result = run({ 'a.test.mjs': sources.passingSuites, 'b.test.mjs': sources.passing });
  assert.equal(result.status, 0);
  assert.match(result.output, /ℹ pass 3/);
});

test('a documented exception covers a skipped suite by exact file and suite name only', () => {
  assert.equal(run({ 'a.test.mjs': sources.skippedSuite }, exception('a.test.mjs', 'disabled suite')).status, 0);
  assert.equal(run({ 'a.test.mjs': sources.nestedSkippedSuite }, exception('a.test.mjs', 'inner suite')).status, 0);
  for (const [file, name] of [['a.test.mjs', 'inner'], ['a.test.mjs', 'other suite'], ['b.test.mjs', 'disabled suite']]) {
    assert.equal(run({ 'a.test.mjs': sources.skippedSuite, 'b.test.mjs': sources.passing }, exception(file, name)).status, 1, `${file}:${name}`);
  }
  assert.equal(run({ 'a.test.mjs': sources.passing }, exception('a.test.mjs', 'disabled suite')).status, 1, 'stale suite exception');
});
