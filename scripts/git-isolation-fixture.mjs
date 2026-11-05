import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before } from 'node:test';
import { gitEnvironment } from './git-environment.mjs';
import { root } from './tool-path.mjs';

const selector = /^GIT_/i;

export function gitIsolationFixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-hook-environment-'));
  const repository = path.join(directory, 'donor');
  const git = args => execFileSync('git', args, { cwd: repository, env: gitEnvironment(), encoding: 'utf8', stdio: 'pipe' }).trim();
  const cleanup = () => {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  };
  try {
    mkdirSync(repository);
    git(['init', '--quiet']);
    writeFileSync(path.join(repository, 'keep.txt'), 'unrelated work must survive\n');
    git(['add', '--', 'keep.txt']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'donor baseline']);
    const gitDir = path.join(repository, '.git');
    const selectors = {
      GIT_DIR: gitDir, GIT_WORK_TREE: repository, GIT_INDEX_FILE: path.join(gitDir, 'index'), GIT_COMMON_DIR: gitDir,
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true',
    };
    const snapshot = () => ({
      head: git(['rev-parse', 'HEAD']), refs: git(['show-ref']), index: git(['ls-files', '--stage']),
      config: readFileSync(path.join(gitDir, 'config'), 'utf8'),
      content: readFileSync(path.join(repository, 'keep.txt'), 'utf8'), status: git(['status', '--porcelain']),
    });
    const poisoned = { ...gitEnvironment(), ...selectors };
    assert.equal(realpathSync.native(execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root, env: poisoned, encoding: 'utf8', stdio: 'pipe',
    }).trim()), realpathSync.native(repository), 'An unisolated Git subprocess must be redirected to the donor.');
    return { directory, git, selectors, poisoned, snapshot, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function verifySuiteGitIsolation() {
  let fixture;
  let donorBefore;
  let savedSelectors;
  const clearSelectors = () => {
    for (const name of Object.keys(process.env)) if (selector.test(name)) delete process.env[name];
  };
  before(() => {
    fixture = gitIsolationFixture();
    donorBefore = fixture.snapshot();
    savedSelectors = Object.fromEntries(Object.entries(process.env).filter(([name]) => selector.test(name)));
    clearSelectors();
    Object.assign(process.env, fixture.selectors);
  });
  after(() => {
    if (savedSelectors) {
      clearSelectors();
      Object.assign(process.env, savedSelectors);
    }
    if (fixture) {
      try {
        assert.deepEqual(fixture.snapshot(), donorBefore, 'Poisoned fixture checks changed the donor repository.');
      } finally {
        fixture.cleanup();
      }
    }
  });
}
