import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, lstatSync, chmodSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { git as repositoryGit, repositoryFiles, checkHookIndex } from './repository-files.mjs';

test('aggregate verification retains Foundation, hygiene and existing checks', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const checks = scripts.check.split(' && ');
  for (const name of ['check:reserved', 'check:hygiene', 'check:comments', 'check:format', 'check:metadata', 'check:test-selection', 'lint:markdown',
    'lint:yaml', 'lint:workflows', 'scan:secrets', 'verify:supabase', 'typecheck:db', 'verify:foundation']) {
    assert.ok(checks.includes(`npm run ${name}`), `Aggregate dropped ${name}.`);
  }
  assert.equal(scripts['verify:foundation'], 'node scripts/run-tests.mjs scripts/backup.test.mjs scripts/agent-evaluation.test.mjs scripts/git-environment.test.mjs scripts/tool-workflows.test.mjs scripts/advisory-workflows.test.mjs scripts/check-skills.test.mjs scripts/test-integrity-reporter.test.mjs');
  assert.equal(scripts['agents:evaluate'], 'node scripts/agent-evaluation.mjs');
  assert.equal(scripts['verify:negative'], 'node scripts/verify-negative.mjs && node scripts/run-tests.mjs scripts/check-hygiene.test.mjs scripts/check-verification.test.mjs scripts/test-lifecycle.test.mjs scripts/check-comments.test.mjs scripts/check-format.test.mjs scripts/tool-library.test.mjs');
});

test('hook-inherited Git selectors cannot redirect fixture or recovery operations into a donor repository', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-hook-environment-'));
  const repository = path.join(directory, 'donor');
  mkdirSync(repository);
  const git = args => execFileSync('git', args, { cwd: repository, env: gitEnvironment(), encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git(['init', '--quiet']);
    writeFileSync(path.join(repository, 'keep.txt'), 'unrelated work must survive\n');
    git(['add', '--', 'keep.txt']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'donor baseline']);
    const snapshot = () => ({
      head: git(['rev-parse', 'HEAD']), refs: git(['show-ref']), index: git(['ls-files', '--stage']),
      config: readFileSync(path.join(repository, '.git/config'), 'utf8'),
      content: readFileSync(path.join(repository, 'keep.txt'), 'utf8'), status: git(['status', '--porcelain']),
    });
    const before = snapshot();
    const poisoned = {
      ...gitEnvironment(), GIT_DIR: path.join(repository, '.git'), GIT_WORK_TREE: repository,
      GIT_INDEX_FILE: path.join(repository, '.git/index'), GIT_COMMON_DIR: path.join(repository, '.git'),
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true',
    };
    assert.ok(!Object.keys(gitEnvironment({ ...poisoned, git_namespace: 'other' })).some(name => /^git_/i.test(name)));
    delete poisoned.NODE_TEST_CONTEXT;
    assert.equal(realpathSync.native(execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root, env: poisoned, encoding: 'utf8', stdio: 'pipe',
    }).trim()), realpathSync.native(repository), 'An unisolated Git subprocess must be redirected to the donor.');
    const result = spawnSync(process.execPath, ['--test', 'scripts/backup.test.mjs', 'scripts/agent-evaluation.test.mjs'], {
      cwd: root, env: poisoned, encoding: 'utf8', timeout: 60000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests 6\b/);
    assert.deepEqual(snapshot(), before, 'Donor HEAD, refs, index, config or unrelated work changed.');

    const linked = path.join(directory, 'linked');
    git(['worktree', 'add', '--quiet', '-b', 'codex/isolation-fixture', linked]);
    writeFileSync(path.join(linked, 'keep.txt'), 'linked index content\n');
    repositoryGit(linked, ['add', '--', 'keep.txt'], { env: poisoned });
    writeFileSync(path.join(linked, 'keep.txt'), 'linked working content\n');
    assert.equal(repositoryGit(linked, ['branch', '--show-current'], { env: poisoned }).trim(), 'codex/isolation-fixture');
    assert.deepEqual(repositoryGit(linked, ['show', ':keep.txt'], { env: poisoned, encoding: null }), Buffer.from('linked index content\n'));
    const linkedIndex = repositoryGit(linked, ['rev-parse', '--path-format=absolute', '--git-path', 'index']).trim();
    assert.doesNotThrow(() => checkHookIndex(linked, {}));
    assert.doesNotThrow(() => checkHookIndex(linked, { GIT_INDEX_FILE: linkedIndex }));
    assert.throws(() => checkHookIndex(linked, { GIT_INDEX_FILE: linkedIndex + '.alternate' }), /Alternate Git indexes/);
    const cleanEnvironment = { ...process.env };
    try {
      Object.assign(process.env, poisoned);
      const files = repositoryFiles(linked).filter(file => file.file === 'keep.txt');
      assert.deepEqual(files.map(file => [file.state, file.content.toString()]), [
        ['index', 'linked index content\n'], ['working', 'linked working content\n'],
      ]);
    } finally {
      for (const name of Object.keys(process.env)) if (!(name in cleanEnvironment)) delete process.env[name];
      Object.assign(process.env, cleanEnvironment);
    }
    const hooks = path.join(directory, 'hooks');
    mkdirSync(hooks);
    const probe = path.join(directory, 'verify-index.mjs');
    writeFileSync(probe, `import { checkHookIndex } from ${JSON.stringify(pathToFileURL(path.join(root, 'scripts/repository-files.mjs')).href)};\ncheckHookIndex(process.cwd());\n`);
    writeFileSync(path.join(hooks, 'pre-commit'), `#!/bin/sh\nexec "${process.execPath.replaceAll('\\', '/')}" "${probe.replaceAll('\\', '/')}"\n`);
    chmodSync(path.join(hooks, 'pre-commit'), 0o755);
    const hookCommit = ['-c', `core.hooksPath=${hooks}`, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet'];
    repositoryGit(linked, [...hookCommit, '-m', 'chore: ordinary staged fixture']);
    const linkedHead = repositoryGit(linked, ['rev-parse', 'HEAD']);
    const linkedStaging = repositoryGit(linked, ['ls-files', '--stage']);
    for (const mode of ['--only', '--include']) {
      assert.throws(() => repositoryGit(linked, [...hookCommit, mode, '-m', 'chore: alternate index fixture', '--', 'keep.txt']),
        error => error.status === 1 && String(error.stderr).includes('Alternate Git indexes'));
      assert.equal(repositoryGit(linked, ['rev-parse', 'HEAD']), linkedHead);
      assert.equal(repositoryGit(linked, ['ls-files', '--stage']), linkedStaging);
      assert.equal(readFileSync(path.join(linked, 'keep.txt'), 'utf8'), 'linked working content\n');
    }
    const withLinked = snapshot();
    assert.equal(withLinked.head, before.head);
    assert.equal(withLinked.index, before.index);
    assert.equal(withLinked.content, before.content);
    assert.equal(withLinked.config, before.config);
    assert.equal(withLinked.status, before.status);

    for (const args of [
      ['--test', 'scripts/check-hygiene.test.mjs'],
      ['--test', 'scripts/check-verification.test.mjs'],
      ['--test', 'scripts/check-comments.test.mjs'],
      ['--test', 'scripts/check-format.test.mjs'],
      ['scripts/verify-negative.mjs'],
      ['scripts/check-reserved-files.mjs'],
      ['scripts/check-hygiene.mjs'],
      ['scripts/check-comments.mjs'],
      ['scripts/check-format.mjs'],
      ['scripts/check-metadata.mjs'],
      ['scripts/check-yaml.mjs'],
      ['scripts/check-tools.mjs', 'workflows'],
      ['scripts/check-tools.mjs', 'secrets'],
    ]) {
      const child = spawnSync(process.execPath, args, { cwd: root, env: poisoned, encoding: 'utf8', timeout: 120000 });
      assert.ifError(child.error);
      assert.equal(child.status, 0, `${args.join(' ')}\n${child.stdout}${child.stderr}`);
      if (args[0] === '--test') {
        const summary = outcome => Number(new RegExp(`^\\W*${outcome} (\\d+)\\b`, 'm').exec(child.stdout)?.[1]);
        assert.ok(summary('tests') > 0, 'No tests were executed.');
        assert.equal(summary('pass'), summary('tests'), 'Every executed test must pass.');
        for (const outcome of ['fail', 'cancelled', 'skipped', 'todo']) assert.match(child.stdout, new RegExp(`${outcome} 0\\b`));
      }
      assert.deepEqual(snapshot(), withLinked, 'Poisoned hygiene checks or fixtures changed the donor repository.');
    }
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});
