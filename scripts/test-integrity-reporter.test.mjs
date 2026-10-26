import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { root } from './tool-path.mjs';

// An absolute --test-reporter path is imported as a URL, so a Windows drive path is invalid there; a file URL works on both platforms.
const reporter = pathToFileURL(path.join(root, 'scripts/test-integrity-reporter.mjs')).href;
const runnerScript = path.join(root, 'scripts/run-tests.mjs');
const ambientNames = /^(?:NODE_TEST_CONTEXT|NODE_OPTIONS|npm_config_node_options)$/i;
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

function run(files, manifest = {}, { defaultReporter = false, runner = false, env = {} } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-test-integrity-'));
  try {
    writeFileSync(path.join(directory, 'package.json'), typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    for (const [name, source] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
      writeFileSync(path.join(directory, name), source);
    }
    const names = Object.keys(files).filter(name => /\.test\.mjs$/.test(name));
    const args = runner ? [runnerScript, ...names] : ['--test', ...(defaultReporter ? [] : [`--test-reporter=${reporter}`]), ...names];
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !ambientNames.test(name)));
    const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', env: { ...inherited, ...env } });
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

const mixed = header + "test('good', () => {});\ntest('bad', () => { throw new Error('expected failure'); });\n";
const viaRunner = (files, manifest, options = {}) => run(files, manifest, { runner: true, ...options });
const platformSkips = count => header + "test('runs', () => {});\n" + "test('platform', { skip: true }, () => {});\n".repeat(count);

test('the reporter loads from an absolute file URL, including a checkout path with spaces or a drive letter', () => {
  assert.match(reporter, /^file:\/\/\//);
  assert.equal(run({ 'a.test.mjs': sources.passing }).status, 0);
  assert.equal(viaRunner({ 'a.test.mjs': sources.passing }).status, 0);
});

test('without the runner script, ambient Node configuration silently drops a failing test, which is the defect being guarded', () => {
  for (const env of [{ NODE_OPTIONS: '--test-name-pattern=good' }, { NODE_OPTIONS: '--test-skip-pattern=bad' }, { NODE_TEST_CONTEXT: 'child-v8' }]) {
    assert.equal(run({ 'a.test.mjs': mixed }, {}, { env }).status, 0, JSON.stringify(env));
  }
});

test('the runner script rejects ambient options that select or redirect tests before running anything', () => {
  for (const env of [
    { NODE_OPTIONS: '--test-name-pattern=good' }, { NODE_OPTIONS: '--test-skip-pattern=bad' }, { NODE_OPTIONS: '--test_name_pattern=good' },
    { NODE_OPTIONS: '--no-warnings --test-only' }, { NODE_OPTIONS: '--test-shard=1/2' }, { NODE_OPTIONS: '--test-reporter=tap' },
    { NODE_OPTIONS: '--experimental-test-isolation=none' }, { npm_config_node_options: '--test-name-pattern=good' },
    { NPM_CONFIG_NODE_OPTIONS: '--test-name-pattern=good' },
  ]) {
    const result = viaRunner({ 'a.test.mjs': mixed }, {}, { env });
    assert.equal(result.status, 1, JSON.stringify(env));
    assert.match(result.output, /Ambient Node options would change which tests run/, JSON.stringify(env));
    assert.doesNotMatch(result.output, /Test integrity violations|✔/, 'nothing may run under rejected options');
  }
});

test('npm-forwarded node options cannot filter tests run through the runner script', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-test-npm-'));
  try {
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ scripts: { t: `node ${JSON.stringify(runnerScript)} a.test.mjs` } }));
    writeFileSync(path.join(directory, 'a.test.mjs'), mixed);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !ambientNames.test(name)));
    const result = spawnSync(npm, ['run', 't', '--node-options=--test-name-pattern=good'], { cwd: directory, encoding: 'utf8', env, shell: process.platform === 'win32' });
    if (result.error) throw result.error;
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /Ambient Node options would change which tests run/);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});

test('a stale NODE_TEST_CONTEXT cannot make the runner script skip the test files', () => {
  const env = { NODE_TEST_CONTEXT: 'child-v8' };
  const failing = viaRunner({ 'a.test.mjs': mixed }, {}, { env });
  assert.equal(failing.status, 1);
  assert.match(failing.output, /expected failure/);
  const passing = viaRunner({ 'a.test.mjs': sources.passing }, {}, { env });
  assert.equal(passing.status, 0);
  assert.match(passing.output, /ℹ pass 1/);
});

test('legitimate Node options and the normal spec output are preserved by the runner script', () => {
  const result = viaRunner({ 'a.test.mjs': sources.passing, 'b.test.mjs': sources.passing }, {}, { env: { NODE_OPTIONS: '--no-warnings --max-old-space-size=512' } });
  assert.equal(result.status, 0);
  assert.match(result.output, /✔ passes/);
  assert.match(result.output, /ℹ pass 2/);
  assert.equal(viaRunner({ 'a.test.mjs': sources.skipped }).status, 1, 'the integrity reporter still applies');
  assert.equal(viaRunner({ 'a.test.mjs': sources.skipped }, exception('a.test.mjs', 'disabled')).status, 0, 'a documented exception still applies');
});

test('the runner script fails when the reporter leaves incomplete execution evidence, even though node reports success', () => {
  // Stand-in reporters keep the normal spec output and exit status 0 but record nothing, or only part of the run.
  const stubs = {
    none: 'export default async function* (source) { yield* Readable.from(source).compose(new spec()); }\n',
    partial: "import { writeFileSync } from 'node:fs';\nexport default async function* (source) { writeFileSync(process.env.NESTSCOUT_TEST_EVIDENCE, JSON.stringify({ 'a.test.mjs': 1 })); yield* Readable.from(source).compose(new spec()); }\n",
  };
  const expectations = { none: /integrity reporter did not complete/, partial: /b\.test\.mjs has no recorded passing test/ };
  for (const [name, stub] of Object.entries(stubs)) {
    const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-test-evidence-'));
    try {
      mkdirSync(path.join(directory, 'scripts'));
      copyFileSync(runnerScript, path.join(directory, 'scripts/run-tests.mjs'));
      writeFileSync(path.join(directory, 'scripts/test-integrity-reporter.mjs'), "import { Readable } from 'node:stream';\nimport { spec } from 'node:test/reporters';\n" + stub);
      for (const file of ['a.test.mjs', 'b.test.mjs']) writeFileSync(path.join(directory, file), sources.passing);
      const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !ambientNames.test(key)));
      const bare = spawnSync(process.execPath, ['--test', '--test-reporter=./scripts/test-integrity-reporter.mjs', 'a.test.mjs', 'b.test.mjs'], { cwd: directory, encoding: 'utf8', env });
      assert.equal(bare.status, 0, `${name}: node alone reports success`);
      const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', 'a.test.mjs', 'b.test.mjs'], { cwd: directory, encoding: 'utf8', env });
      assert.equal(result.status, 1, name);
      assert.match(result.stderr, expectations[name], name);
    } finally {
      assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
      assert.ok(!lstatSync(directory).isSymbolicLink());
      rmSync(directory, { recursive: true });
    }
  }
});

test('the runner script rejects missing or non-test arguments', () => {
  for (const args of [[], ['a.mjs']]) {
    const result = spawnSync(process.execPath, [runnerScript, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.match(result.stderr, /Pass one or more/);
  }
});

test('one documented exception cannot authorize several skipped tests or suites', () => {
  const several = {
    twoTests: platformSkips(2),
    threeTests: platformSkips(3),
    testAndSuite: header + "test('runs', () => {});\ntest('platform', { skip: true }, () => {});\ndescribe.skip('platform', () => { it('inner', () => {}); });\n",
    twoSuites: header + "test('runs', () => {});\ndescribe.skip('platform', () => { it('a', () => {}); });\ndescribe.skip('platform', () => { it('b', () => {}); });\n",
    nestedHomonyms: header + "describe('first', () => { it('platform', { skip: true }, () => {}); });\ndescribe('second', () => { it('platform', { skip: true }, () => {}); });\n",
  };
  for (const [name, source] of Object.entries(several)) {
    const result = run({ 'a.test.mjs': source }, exception('a.test.mjs', 'platform'));
    assert.equal(result.status, 1, name);
    assert.match(result.output, /documented exception for "platform" is ambiguous; it matches [23] skipped tests/, name);
  }
});

test('repeated exception entries are rejected rather than letting one test consume the other', () => {
  const entry = { file: 'a.test.mjs', name: 'platform', reason: 'Documented platform limitation.' };
  const result = run({ 'a.test.mjs': platformSkips(1) }, { repositoryHygiene: { testExceptions: [entry, { ...entry, reason: 'Another reason.' }] } });
  assert.equal(result.status, 1);
  assert.match(result.output, /must not repeat a file and name pair/);
});

test('narrowly scoped exceptions remain valid: one entry per skipped test, in one or several files', () => {
  const entries = [['a.test.mjs', 'platform'], ['a.test.mjs', 'other'], ['b.test.mjs', 'platform']].map(([file, name]) => ({ file, name, reason: 'Documented platform limitation.' }));
  const files = {
    'a.test.mjs': header + "test('runs', () => {});\ntest('platform', { skip: true }, () => {});\ntest('other', { todo: true }, () => {});\n",
    'b.test.mjs': platformSkips(1),
  };
  assert.equal(run(files, { repositoryHygiene: { testExceptions: entries } }).status, 0);
  assert.equal(run(files, { repositoryHygiene: { testExceptions: entries.slice(0, 2) } }).status, 1, 'the second file lacks its own exception');
  assert.equal(run({ 'a.test.mjs': platformSkips(1) }, exception('a.test.mjs', 'platform')).status, 0);
});
