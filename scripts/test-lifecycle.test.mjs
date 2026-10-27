import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { checkTestSelection } from './check-test-selection.mjs';
import { checkHygiene } from './check-hygiene.mjs';
import { scanStaged } from './scan-staged.mjs';
import { checkMetadata } from './check-metadata.mjs';
import { repositoryIdentity } from './verify-repository.mjs';

const testBody = 'import { test } from "node:test"; test("fixture", () => {});\n';

function fixture(operation) {
  const repository = mkdtempSync(path.join(tmpdir(), 'nestscout-test-lifecycle-'));
  const write = (file, content) => {
    const target = path.join(repository, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const run = (args, options) => git(repository, args, options);
  const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const manifest = (value = scripts) => write('package.json', JSON.stringify({ scripts: value }) + '\n');
  try {
    run(['init', '--quiet']);
    for (const file of ['.gitignore', '.codex/config.toml', '.claude/settings.json']) {
      write(file, readFileSync(path.join(root, file)));
    }
    manifest();
    for (const value of Object.values(scripts)) {
      const command = value.split(' && ').find(command => command.startsWith('node scripts/run-tests.mjs '));
      if (command) for (const target of command.split(' ').slice(2)) write(target, testBody);
    }
    for (const file of ['run-tests', 'test-integrity-reporter']) write(`scripts/${file}.mjs`, 'export default async function* () {}\n');
    run(['add', '.']);
    operation({ repository, write, run, scripts, manifest });
  } finally {
    assert.equal(path.dirname(realpathSync(repository)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(repository).isSymbolicLink());
    rmSync(repository, { recursive: true });
  }
}

test('all four persistent suffixes at every depth require registration in each Git state', () => fixture(({ repository, write, run, scripts, manifest }) => {
  assert.doesNotThrow(() => checkTestSelection(repository));
  for (const directory of ['scripts', 'scripts/lifecycle', 'scripts/lifecycle/nested']) {
    for (const suffix of ['test', 'spec', 'integration.test', 'integration.spec']) {
      const target = `${directory}/contract.${suffix}.mjs`;
      write(target, testBody);
      assert.throws(() => checkTestSelection(repository), /working: unselected persistent test/);
      run(['add', '--', target]);
      assert.throws(() => checkTestSelection(repository), /index: unselected persistent test/);
      scripts['verify:foundation'] += ' ' + target;
      manifest();
      assert.throws(() => checkTestSelection(repository), /index: unselected persistent test/);
      run(['add', '--', 'package.json']);
      assert.doesNotThrow(() => checkTestSelection(repository));
    }
  }
  assert.doesNotThrow(() => checkHygiene(repository));
}));

test('test discovery cannot hide a test behind an unsupported name or directory', () => fixture(({ repository, write, run }) => {
  for (const target of ['scripts/contract.extra.spec.mjs', 'scripts/Contract.test.mjs', 'tests/contract.spec.mjs']) {
    write(target, testBody);
    assert.throws(() => checkTestSelection(repository), /working: unselected persistent test/);
    run(['add', '--', target]);
    rmSync(path.join(repository, target));
    assert.throws(() => checkTestSelection(repository), /index: unselected persistent test/);
    run(['rm', '--cached', '--', target]);
    assert.doesNotThrow(() => checkTestSelection(repository));
  }
}));

test('duplicate, missing, disabled, filtered and masked registrations fail in index and working manifests', () => fixture(({ repository, write, run, scripts, manifest }) => {
  const mutate = (change, message) => {
    const candidate = { ...scripts };
    change(candidate);
    manifest(candidate);
    assert.throws(() => checkTestSelection(repository), new RegExp('working: .*' + message));
    run(['add', '--', 'package.json']);
    manifest();
    assert.throws(() => checkTestSelection(repository), new RegExp('index: .*' + message));
    run(['add', '--', 'package.json']);
    assert.doesNotThrow(() => checkTestSelection(repository));
  };
  mutate(value => { value['verify:foundation'] += ' scripts/backup.test.mjs'; }, 'selected more than once');
  mutate(value => { value['verify:foundation'] += ' scripts/supabase-local.test.mjs'; }, 'selected more than once');
  mutate(value => { value['verify:foundation'] = value['verify:foundation'].replace(' scripts/backup.test.mjs', ''); }, 'unselected persistent test');
  mutate(value => { value['verify:foundation'] += ' scripts/absent.spec.mjs'; }, 'missing selected persistent test');
  mutate(value => { delete value['db:mcp:test']; }, 'missing test runner');
  mutate(value => { value['verify:supabase'] = 'echo passed'; }, 'test runner must execute');
  mutate(value => { value['check:test-selection'] = 'echo passed'; }, 'test-selection guard disabled');
  mutate(value => { value.check = value.check.replace(' && npm run check:test-selection', ''); }, 'mandatory check omitted');
  mutate(value => { value.check += ' || true'; }, 'aggregate check');
  mutate(value => { value.check += ' && npm run check:test-selection'; }, 'aggregate check');
  mutate(value => { value['verify:negative'] = value['verify:negative'].replace('node scripts/verify-negative.mjs && ', ''); }, 'negative fixture verification');
  for (const target of ['--test-only', '--test-name-pattern=absent', '--test-skip-pattern=.', 'scripts/*.test.mjs',
    'scripts/../backup.test.mjs', 'scripts/contract.extra.spec.mjs', 'scripts/scratch-probe.test.mjs', '|| true']) {
    mutate(value => { value['verify:foundation'] += ' ' + target; }, 'invalid or unsafe test target');
  }
  write('scripts/new.spec.mjs', testBody);
  run(['add', '--', 'scripts/new.spec.mjs']);
  const candidate = { ...scripts, 'verify:foundation': scripts['verify:foundation'] + ' scripts/new.spec.mjs' };
  manifest(candidate);
  run(['add', '--', 'package.json']);
  assert.doesNotThrow(() => checkTestSelection(repository));
  manifest();
  assert.throws(() => checkTestSelection(repository), /working: unselected persistent test/);
}));

test('a selected test missing on disk or staged for deletion cannot silently pass', () => fixture(({ repository, write, run, scripts, manifest }) => {
  const target = 'scripts/lifecycle/contract.integration.spec.mjs';
  write(target, testBody);
  scripts['verify:foundation'] += ' ' + target;
  manifest();
  run(['add', '.']);
  assert.doesNotThrow(() => checkTestSelection(repository));
  rmSync(path.join(repository, target));
  assert.throws(() => checkTestSelection(repository), /working: missing selected persistent test/);
  run(['rm', '--cached', '--', target]);
  write(target, testBody);
  assert.throws(() => checkTestSelection(repository), /index: missing selected persistent test/);
  run(['add', '--', target]);
  assert.doesNotThrow(() => checkTestSelection(repository));
}));

test('existing guards reject forced scratch, caches, coverage and generated output without banning persistent tests', () => fixture(({ repository, write, run }) => {
  const ignored = ['.cache/agent-tests/probe.test.mjs', '.cache/runner/results.json', 'coverage/lcov.info', 'scripts/probe.log'];
  for (const target of ignored) write(target, '{}\n');
  run(['add', '--all']);
  const staged = run(['ls-files', '-z']).split('\0');
  for (const target of ignored) assert.ok(!staged.includes(target), target);
  assert.doesNotThrow(() => checkTestSelection(repository));
  assert.doesNotThrow(() => checkHygiene(repository));
  for (const target of [...ignored, '.CACHE/agent-tests/probe.spec.mjs', 'scripts/scratch-probe.test.mjs',
    'scripts/debug-probe.mjs', 'test-results/results.json', 'playwright-report/index.html',
    '.nyc_output/results.json', 'scripts/contract.test.mjs.snap']) {
    write(target, '{}\n');
    run(['add', '--force', '--', target]);
    const artifact = /^(?:\.cache|coverage)\//i.test(target);
    if (artifact) assert.throws(() => scanStaged(repository, 'pipe'), /EPHEMERAL artifacts must not be tracked/);
    assert.throws(() => checkHygiene(repository), /EPHEMERAL artifacts|Disposable document\/source name|No approved naming convention/);
    rmSync(path.join(repository, target));
    assert.throws(() => checkHygiene(repository), /EPHEMERAL artifacts|Disposable document\/source name|No approved naming convention/);
    run(['rm', '--cached', '--', target]);
    assert.doesNotThrow(() => checkHygiene(repository));
  }
}));

test('optional pre-commit runs test selection unconditionally before accepting staged source', () => {
  const hook = readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8');
  assert.match(hook, /^#!\/bin\/sh\nset -eu\n/);
  assert.equal(hook.split('\n').filter(line => line === 'node scripts/check-test-selection.mjs').length, 1);
  for (const command of ['npm run check:reserved', 'npm run check:hygiene -- --hook', 'npm run check:metadata', 'npm run scan:secrets',
    'node scripts/check-comments.mjs --staged', 'node scripts/check-format.mjs', 'node scripts/check-yaml.mjs']) {
    assert.ok(hook.split('\n').includes(command), 'Existing hook gate missing or masked: ' + command);
  }
});

test('real pre-commit rejects unregistered tests and a disabled npm guard without creating a commit', () => fixture(({ repository, write, run, scripts, manifest }) => {
  run(['branch', '-m', 'codex/lifecycle-fixture']);
  for (const file of ['AGENTS.md', 'README.md', '.githooks/pre-commit']) write(file, readFileSync(path.join(root, file)));
  chmodSync(path.join(repository, '.githooks/pre-commit'), 0o755);
  const modules = [
    ['check-reserved-files', 'checkReservedFiles'], ['check-hygiene', 'checkHygiene'],
    ['check-test-selection', 'checkTestSelection'], ['check-metadata', 'checkMetadata'],
    ['scan-staged', 'scanStaged'], ['check-comments', 'checkStagedComments'],
    ['check-format', 'checkFormat'], ['check-yaml', 'checkYaml'],
  ];
  for (const [module, callable] of modules) {
    const source = pathToFileURL(path.join(root, 'scripts', module + '.mjs')).href;
    // Fixture commits use local metadata; the outer workflow event belongs to another repository.
    const args = module === 'check-metadata' ? 'process.cwd(), {}' : 'process.cwd()';
    write(`scripts/${module === 'scan-staged' ? 'check-tools' : module}.mjs`,
      `import { ${callable} } from ${JSON.stringify(source)};\n${callable}(${args});\n`);
  }
  run(['add', '.']);
  const commit = ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'test: lifecycle fixture'];
  run(commit);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  const hookCommit = ['-c', 'core.hooksPath=.githooks', ...commit];
  const eventRepository = { id: repositoryIdentity.id, full_name: repositoryIdentity.fullName };
  const eventFile = '.cache/agent-tests/outer-event.json';
  write(eventFile, JSON.stringify({
    repository: eventRepository,
    pull_request: {
      title: 'test: outer repository event', body: 'Closes #25',
      base: { repo: eventRepository, ref: repositoryIdentity.defaultBranch, sha: git(root, ['rev-parse', 'origin/main']).trim() },
      head: { repo: eventRepository, ref: 'codex/outer-fixture', sha: git(root, ['rev-parse', 'HEAD']).trim() },
    },
  }) + '\n');
  const eventEnvironment = { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: path.join(repository, eventFile) };
  assert.throws(() => checkMetadata(repository, eventEnvironment), error => error.status === 128 && /Not a valid commit name/.test(String(error.stderr)));
  const commitWithHook = () => run(hookCommit, { env: eventEnvironment });
  write('scripts/accepted.mjs', 'export const accepted = true;\n');
  run(['add', '--', 'scripts/accepted.mjs']);
  assert.doesNotThrow(commitWithHook);
  const reject = message => {
    const head = run(['rev-parse', 'HEAD']);
    const index = run(['ls-files', '--stage']);
    assert.throws(commitWithHook, error => error.status === 1 && message.test(String(error.stderr) + String(error.stdout)));
    assert.equal(run(['rev-parse', 'HEAD']), head);
    assert.equal(run(['ls-files', '--stage']), index);
  };
  const target = 'scripts/contract.integration.spec.mjs';
  write(target, testBody);
  run(['add', '--', target]);
  rmSync(path.join(repository, target));
  reject(/index: unselected persistent test/);
  write(target, testBody);
  scripts['verify:foundation'] += ' ' + target;
  manifest();
  run(['add', '--', 'package.json']);
  assert.doesNotThrow(commitWithHook);
  manifest({ ...scripts, 'check:test-selection': 'echo disabled' });
  run(['add', '--', 'package.json']);
  reject(/index: test-selection guard disabled/);
  manifest();
  run(['add', '--', 'package.json']);
  const stageThenRestore = (file, staged, clean) => {
    write(file, staged);
    run(['add', '--', file]);
    write(file, clean);
  };
  const unstage = file => run(['rm', '--cached', '--quiet', '--force', '--', file]);
  stageThenRestore('scripts/narrated.mjs', 'export const value = 1;\n// explain the value\n', 'export const value = 1;\n');
  reject(/index scripts\/narrated\.mjs:2 inline: \/\/ explain the value/);
  unstage('scripts/narrated.mjs');
  stageThenRestore('scripts/suppressed.mjs', 'export const value = 1; // eslint-disable-line\n', 'export const value = 1;\n');
  reject(/index scripts\/suppressed\.mjs:1 suppression/);
  unstage('scripts/suppressed.mjs');
  stageThenRestore('scripts/spaced.mjs', 'export const value = 1; \n', 'export const value = 1;\n');
  reject(/index scripts\/spaced\.mjs:1: trailing whitespace/);
  unstage('scripts/spaced.mjs');
  stageThenRestore('.github/workflows/probe.yml', 'name: first\nname: duplicate\n', 'name: clean\n');
  reject(/index \.github\/workflows\/probe\.yml: invalid YAML/);
  unstage('.github/workflows/probe.yml');
  rmSync(path.join(repository, '.github/workflows/probe.yml'));
  write('scripts/tool.mjs', '#!/usr/bin/env node\nexport const tool = 1;\n');
  run(['add', '--', 'scripts/tool.mjs']);
  assert.doesNotThrow(commitWithHook);
}));

test('real pre-push passes the push target and refs to the metadata guard, then runs the aggregate and negative suites', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-pre-push-'));
  const remote = path.join(directory, 'remote.git');
  const repository = path.join(directory, 'work');
  const module = lines => lines.join('\n') + '\n';
  try {
    mkdirSync(remote);
    mkdirSync(repository);
    git(remote, ['init', '--quiet', '--bare']);
    const run = (args, options) => git(repository, args, options);
    const write = (file, content) => {
      mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
      writeFileSync(path.join(repository, file), content);
    };
    run(['init', '--quiet', '--initial-branch=claude/push-fixture']);
    run(['config', 'user.name', 'Fixture']);
    run(['config', 'user.email', 'fixture@example.invalid']);
    write('.gitignore', '.cache/\n');
    write('.githooks/pre-push', readFileSync(path.join(root, '.githooks/pre-push')));
    chmodSync(path.join(repository, '.githooks/pre-push'), 0o755);
    write('package.json', JSON.stringify({ scripts: {
      identity: 'node scripts/record.mjs identity', check: 'node scripts/record.mjs check', 'verify:negative': 'node scripts/record.mjs negative',
    } }) + '\n');
    write('scripts/record.mjs', module([
      "import { appendFileSync, mkdirSync } from 'node:fs';", "mkdirSync('.cache', { recursive: true });",
      "appendFileSync('.cache/calls.log', process.argv.slice(2).join(' ') + '\\n');",
    ]));
    write('scripts/check-metadata.mjs', module([
      "import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';", "mkdirSync('.cache', { recursive: true });",
      "appendFileSync('.cache/calls.log', ['metadata', ...process.argv.slice(2), readFileSync(0, 'utf8').trim()].join(' ') + '\\n');",
      "process.exitCode = process.env.FIXTURE_REJECT ? 1 : 0;",
    ]));
    run(['add', '.']);
    run(['commit', '--quiet', '-m', 'chore: establish fixture']);
    run(['remote', 'add', 'origin', remote]);
    const head = run(['rev-parse', 'HEAD']).trim();
    const push = env => run(['-c', 'core.hooksPath=.githooks', 'push', 'origin', 'claude/push-fixture'], { env: { ...process.env, ...env } });
    const calls = path.join(repository, '.cache/calls.log');
    const ref = 'refs/heads/claude/push-fixture';
    const metadata = `metadata --pre-push origin ${remote} ${ref} ${head} ${ref} ${'0'.repeat(40)}\n`;
    assert.throws(() => push({ FIXTURE_REJECT: '1' }), error => error.status === 1);
    assert.equal(readFileSync(calls, 'utf8'), `identity\n${metadata}`);
    assert.equal(git(remote, ['for-each-ref']).trim(), '');
    rmSync(calls);
    push({});
    assert.equal(readFileSync(calls, 'utf8'), `identity\n${metadata}check\nnegative\n`);
    assert.equal(git(remote, ['rev-parse', ref]).trim(), head);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});
