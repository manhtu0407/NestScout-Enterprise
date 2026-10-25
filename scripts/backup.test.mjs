import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { backupDestination, createGitBackup, exportMetadata } from './backup.mjs';
import { gitEnvironment } from './git-environment.mjs';

test('restore retains every local ref and historical object without modifying the source', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-recovery-'));
  const repository = path.join(directory, 'source');
  mkdirSync(repository);
  const options = { env: gitEnvironment(), stdio: 'pipe' };
  const git = args => execFileSync('git', args, { ...options, cwd: repository, encoding: 'utf8' }).trim();
  try {
    git(['init', '--quiet']);
    writeFileSync(path.join(repository, 'example.txt'), 'baseline\n');
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'baseline']);
    const first = git(['rev-parse', 'HEAD']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'tag', '-a', 'fixture-v1', '-m', 'annotated tag', '--no-sign', first]);
    git(['branch', 'other-task', first]);
    git(['update-ref', 'refs/remotes/origin/archive', first]);
    git(['update-ref', 'refs/notes/fixture', first]);
    writeFileSync(path.join(repository, 'example.txt'), 'second commit\n');
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'second']);
    const before = git(['show-ref']);
    const proof = createGitBackup(repository, path.join(directory, 'backup'));
    const ordinary = path.join(directory, 'ordinary-clone');
    execFileSync('git', ['clone', path.join(proof.directory, 'source.bundle'), ordinary], options);
    assert.notEqual(execFileSync('git', ['show-ref'], { ...options, cwd: ordinary, encoding: 'utf8' }).trim(), before,
      'A normal clone is insufficient to prove exact ref-name preservation.');
    assert.equal(proof.gitRestore, 'PASS');
    assert.equal(proof.sourceHead, git(['rev-parse', 'HEAD']));
    assert.equal(git(['show-ref']), before);
    assert.equal(git(['status', '--porcelain']), '');
    execFileSync('git', ['-C', path.join(proof.directory, 'restore-proof.git'), 'cat-file', '-e', `${first}:example.txt`], options);
    assert.ok(proof.sourceRefs.some(ref => ref.startsWith('refs/notes/fixture ')));
    assert.throws(() => createGitBackup(repository, proof.directory), /EEXIST/);
    assert.throws(() => createGitBackup(repository, path.join(repository, 'nested')), /outside/);
    assert.throws(() => backupDestination(repository, 'relative-backup'), /absolute/);
    const alias = path.join(directory, 'checkout-alias');
    symlinkSync(repository, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => createGitBackup(repository, path.join(alias, 'hidden-backup')), /outside/);
    writeFileSync(path.join(repository, 'uncommitted.txt'), 'must remain untouched\n');
    assert.throws(() => createGitBackup(repository, path.join(directory, 'dirty')), /pending work/);
    assert.equal(readFileSync(path.join(repository, 'uncommitted.txt'), 'utf8'), 'must remain untouched\n');
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});

test('metadata exports classic protection and paginated records while disclosing incomplete access', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-metadata-'));
  const requests = [];
  const sensitive = ['synthetic', 'upstream', 'detail'].join('-');
  try {
    const statuses = exportMetadata(directory, (endpoint, paginated) => {
      assert.ok(endpoint.startsWith('repos/manhtu0407/NestScout-Enterprise'));
      assert.ok(!/\/secrets|\/keys|\/variables/.test(endpoint));
      requests.push({ endpoint, paginated });
      if (endpoint.endsWith('/branches?per_page=100')) return [[{ name: 'main', protected: true }], [{ name: 'feature/a', protected: true }]];
      if (endpoint.includes('/issues?')) return [[{ number: 5, pull_request: {} }], [{ number: 1 }]];
      if (endpoint.endsWith('/rulesets')) throw new Error(sensitive);
      return paginated ? [[]] : {};
    });
    for (const suffix of ['/branches/main/protection', '/branches/feature%2Fa/protection', '/issues/1/comments?per_page=100', '/pulls/5/reviews?per_page=100']) {
      assert.ok(requests.some(request => request.endpoint.endsWith(suffix)), suffix);
    }
    assert.ok(requests.find(request => request.endpoint.endsWith('/branches?per_page=100')).paginated);
    assert.equal(statuses.find(status => status.label === 'rulesets').status, 'UNVERIFIED');
    assert.equal(statuses.find(status => status.label === 'project-views-and-workflows').status, 'UNVERIFIED');
    assert.ok(!JSON.stringify(statuses).includes(sensitive));
    assert.deepEqual(JSON.parse(readFileSync(path.join(directory, 'branch-protection-main.json'), 'utf8')), {});
    assert.throws(() => exportMetadata(path.join(directory, 'missing'), () => ({})), /ENOENT/);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});
