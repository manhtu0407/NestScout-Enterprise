import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { root } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';

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
    const result = spawnSync(process.execPath, ['--test', 'scripts/backup.test.mjs', 'scripts/agent-evaluation.test.mjs'], {
      cwd: root, env: poisoned, encoding: 'utf8', timeout: 60000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /tests 4/);
    assert.deepEqual(snapshot(), before, 'Donor HEAD, refs, index, config or unrelated work changed.');
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});
