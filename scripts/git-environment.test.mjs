import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import { root } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { gitIsolationFixture } from './git-isolation-fixture.mjs';
import { git as repositoryGit, repositoryFiles, checkHookIndex } from './repository-files.mjs';

test('aggregate verification retains Foundation, hygiene and existing checks', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const checks = scripts.check.split(' && ');
  for (const name of ['check:reserved', 'check:hygiene', 'check:comments', 'check:format', 'check:metadata', 'check:test-selection', 'lint:markdown',
    'lint:yaml', 'lint:workflows', 'scan:secrets', 'verify:supabase', 'typecheck:db', 'verify:foundation']) {
    assert.ok(checks.includes(`npm run ${name}`), `Aggregate dropped ${name}.`);
  }
  assert.equal(scripts['verify:foundation'], 'node scripts/run-tests.mjs scripts/backup.test.mjs scripts/agent-evaluation.test.mjs scripts/git-environment.test.mjs scripts/tool-workflows.test.mjs scripts/advisory-workflows.test.mjs scripts/check-skills.test.mjs scripts/test-integrity-reporter.test.mjs scripts/send-sms-hook.test.mjs scripts/kael-core.test.mjs scripts/kael-evaluation.test.mjs scripts/kael-knowledge.test.mjs scripts/kael-live-evaluation.test.mjs scripts/review-diff.test.mjs scripts/dead-code-evaluation.test.mjs');
  assert.equal(scripts['agents:evaluate'], 'node scripts/agent-evaluation.mjs');
  assert.equal(scripts['verify:negative'], 'node scripts/verify-negative.mjs && node scripts/run-tests.mjs scripts/check-hygiene.test.mjs scripts/check-verification.test.mjs scripts/test-lifecycle.test.mjs scripts/check-comments.test.mjs scripts/check-format.test.mjs scripts/check-languages.test.mjs scripts/tool-library.test.mjs');
});

test('hook-inherited Git selectors cannot redirect fixture or recovery operations into a donor repository', () => {
  const { directory, git, poisoned, snapshot, cleanup } = gitIsolationFixture();
  try {
    const before = snapshot();
    assert.ok(!Object.keys(gitEnvironment({ ...poisoned, git_namespace: 'other' })).some(name => /^git_/i.test(name)));
    delete poisoned.NODE_TEST_CONTEXT;
    const runPoisoned = (args, timeout) => {
      const child = spawnSync(process.execPath, args, { cwd: root, env: poisoned, encoding: 'utf8', timeout });
      const command = `node ${args.join(' ')}`;
      assert.ok(!child.error, `${command}: ${child.error?.message}`);
      assert.equal(child.status, 0, `${command}\n${child.stdout}${child.stderr}`);
      return child;
    };
    const result = runPoisoned(['--test', 'scripts/backup.test.mjs', 'scripts/agent-evaluation.test.mjs'], 60000);
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
      runPoisoned(args, 120000);
      assert.deepEqual(snapshot(), withLinked, 'Poisoned hygiene checks or fixtures changed the donor repository.');
    }
  } finally {
    cleanup();
  }
});
