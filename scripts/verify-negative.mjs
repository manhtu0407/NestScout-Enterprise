import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync, existsSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { parseDocument } from 'yaml';
import { root, toolPath } from './tool-path.mjs';
import { scanStaged } from './scan-staged.mjs';
import { checkReservedFiles } from './check-reserved-files.mjs';
import { checkTestArtifacts } from './check-test-artifacts.mjs';
import { gitEnvironment } from './git-environment.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-negative-'));
function mustReject(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 1, `${label} should reject its invalid fixture.`);
  console.log(`PASS: ${label} rejected an invalid fixture.`);
  return result;
}
try {
  const artifactRepo = mkdtempSync(path.join(directory, 'test-artifacts-'));
  const artifactGit = args => execFileSync('git', args, { cwd: artifactRepo, env: gitEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const artifactWrite = (file, content = 'fixture\n') => {
    const target = path.join(artifactRepo, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  artifactGit(['init', '--quiet']);
  artifactWrite('.gitignore', readFileSync(path.join(root, '.gitignore')));
  const permanent = ['src/cache.ts', 'src/coverage/index.ts', 'coverage.test.mjs', '.cache-contract.spec.mjs', 'scripts/unit.test.mjs',
    'scripts/contract.spec.mjs', 'scripts/supabase-mcp.integration.test.mjs',
    'supabase/tests/database/security.test.sql', 'tests/fixtures/diagnostic.log',
    'tests/fixtures/.cache/payload.json'];
  for (const file of permanent) artifactWrite(file);
  artifactWrite('.cache/agent-tests/probe.test.mjs');
  artifactWrite('coverage/lcov.info');
  artifactGit(['add', '--all']);
  const ordinarilyStaged = artifactGit(['ls-files', '-z']).split('\0');
  assert.ok(!ordinarilyStaged.includes('.cache/agent-tests/probe.test.mjs'));
  assert.ok(!ordinarilyStaged.includes('coverage/lcov.info'));
  artifactGit(['add', '--force', '--', ...permanent]);
  assert.doesNotThrow(() => checkTestArtifacts(artifactRepo));
  scanStaged(artifactRepo, 'pipe');
  console.log('PASS: normal staging ignores ephemeral artifacts and accepts permanent tests, fixtures and application files.');
  for (const file of ['.cache/agent-tests/probe.test.mjs', '.cache/diagnostic.json',
    'coverage/lcov.info', '.CACHE/agent-tests/case.test.mjs']) {
    artifactWrite(file);
    artifactGit(['add', '--force', '--', file]);
    assert.throws(() => scanStaged(artifactRepo, 'pipe'), /EPHEMERAL artifacts must not be tracked/);
    rmSync(path.join(artifactRepo, file));
    assert.throws(() => checkTestArtifacts(artifactRepo), /EPHEMERAL artifacts must not be tracked/);
    artifactGit(['rm', '--cached', '--force', '--', file]);
    assert.doesNotThrow(() => checkTestArtifacts(artifactRepo));
  }
  console.log('PASS: staging scan rejects forced temporary paths and staged blobs absent from the working tree.');
  artifactWrite('.cache/agent-tests/already-tracked.json');
  artifactGit(['add', '--force', '--', '.cache/agent-tests/already-tracked.json']);
  artifactGit(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'invalid artifact fixture']);
  assert.equal(artifactGit(['diff', '--cached', '--name-only']).trim(), '');
  assert.throws(() => checkTestArtifacts(artifactRepo), /EPHEMERAL artifacts must not be tracked/);
  artifactGit(['rm', '--cached', '--', '.cache/agent-tests/already-tracked.json']);
  assert.doesNotThrow(() => checkTestArtifacts(artifactRepo));
  console.log('PASS: clean-checkout index validation rejects committed artifacts and permits their staged removal.');

  const workspace = path.join(artifactRepo, '.cache/agent-tests');
  const otherAgent = path.join(workspace, 'other-agent/evidence.json');
  mkdirSync(path.dirname(otherAgent), { recursive: true });
  writeFileSync(otherAgent, 'untouched\n');
  for (const expected of [0, 1]) {
    const probe = mkdtempSync(path.join(workspace, 'probe-'));
    const evidence = mkdtempSync(path.join(workspace, 'evidence-'));
    let result;
    try {
      writeFileSync(path.join(probe, 'probe.test.mjs'), `import assert from 'node:assert/strict'; import { test } from 'node:test'; test('exploration', () => assert.equal(1, ${expected === 0 ? 1 : 2}));\n`);
      result = spawnSync(process.execPath, ['--test', 'probe.test.mjs'], { cwd: probe, encoding: 'utf8' });
      if (result.error) throw result.error;
      writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ exitCode: result.status, signal: result.signal }));
    } finally {
      assert.equal(path.dirname(realpathSync(probe)), realpathSync(workspace));
      assert.ok(!lstatSync(probe).isSymbolicLink());
      rmSync(probe, { recursive: true });
    }
    assert.equal(result.status, expected);
    const retained = JSON.parse(readFileSync(path.join(evidence, 'result.json')));
    assert.equal(retained.exitCode, expected);
    assert.deepEqual(Object.keys(retained), ['exitCode', 'signal']);
    assert.equal(existsSync(probe), false);
    assert.equal(readFileSync(otherAgent, 'utf8'), 'untouched\n');
    assert.equal(artifactGit(['check-ignore', '--', path.relative(artifactRepo, evidence)]).trim().length > 0, true);
  }
  console.log('PASS: isolated exploratory tests retain success/failure status and safe evidence after task-owned cleanup; other-agent fixture survives.');

  const originalReadme = readFileSync(path.join(root, 'README.md'));
  function reservedCase(label, change, expectedError) {
    const repository = mkdtempSync(path.join(directory, 'reserved-'));
    const git = args => execFileSync('git', args, { cwd: repository, env: gitEnvironment(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const write = (file, content = '# Fixture\n') => {
      const target = path.join(repository, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    };
    git(['init', '--quiet']);
    write('README.md', originalReadme);
    write('AGENTS.md', '# Fixture policy\n');
    git(['add', 'README.md', 'AGENTS.md']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'valid fixture baseline']);
    change({ repository, git, write });
    if (expectedError) assert.throws(() => checkReservedFiles(repository), expectedError, label);
    else assert.doesNotThrow(() => checkReservedFiles(repository), label);
    console.log(`PASS: reserved files ${label}.`);
  }
  reservedCase('accept canonical policy and unchanged README', () => {});
  reservedCase('accept skills, technical docs, and module READMEs', ({ git, write }) => {
    for (const file of ['.agents/skills/example/SKILL.md', '.claude/skills/example/SKILL.md', 'docs/architecture.md', 'packages/example/README.md', 'docs/readme.md']) write(file);
    git(['add', '.']);
  });
  for (const file of ['docs/claude.architecture.md', 'docs/agents.design.md']) {
    for (const state of ['untracked', 'staged', 'tracked']) {
      reservedCase(`accept ${state} technical documentation ${file}`, ({ git, write }) => {
        write(file);
        if (state !== 'untracked') git(['add', file]);
        if (state === 'tracked') git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'technical documentation fixture']);
      });
    }
  }
  for (const file of ['nested/AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', 'nested/claude.local.md', 'nested/aGeNtS.Md', 'aGeNtS.OVERRIDE.MD', 'cLaUdE.MD', '.github/copilot-instructions.md', 'docs/ai-working-guide.md', '.claude/rules/policy.md', '.GITHUB/INSTRUCTIONS/policy.instructions.md']) {
    reservedCase(`reject untracked ${file}`, ({ write }) => write(file), /Competing agent instruction file/);
  }
  for (const file of ['CLAUDE.local.md', '.claude/CLAUDE.md', 'nested/AgEnTs.OvErRiDe.Md']) {
    reservedCase(`reject untracked ${file}`, ({ write }) => write(file), /Competing agent instruction file/);
  }
  reservedCase('reject staged variant absent from working tree', ({ repository, git, write }) => {
    write('CLAUDE.md');
    git(['add', 'CLAUDE.md']);
    rmSync(path.join(repository, 'CLAUDE.md'));
  }, /Competing agent instruction file/);
  reservedCase('reject tracked variant even after an unstaged deletion', ({ repository, git, write }) => {
    write('nested/AGENTS.md');
    git(['add', '.']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'invalid fixture history']);
    rmSync(path.join(repository, 'nested/AGENTS.md'));
  }, /Competing agent instruction file/);
  reservedCase('reject root policy case rename in index', ({ git }) => git(['mv', 'AGENTS.md', 'agents.md']), /Competing agent instruction file/);
  reservedCase('reject root policy case rename only on disk', ({ repository }) => {
    renameSync(path.join(repository, 'AGENTS.md'), path.join(repository, 'policy.tmp'));
    renameSync(path.join(repository, 'policy.tmp'), path.join(repository, 'agents.md'));
  }, /Competing agent instruction file|Required regular root file/);
  reservedCase('reject modified working README', ({ write }) => write('README.md', '# Changed\n'), /Owner-approved README.md changed/);
  reservedCase('reject obsolete README baseline', ({ write }) => {
    write('README.md', '# NestScout-Enterprise\nPersistency on the tenth times...!\n');
  }, /Owner-approved README.md changed/);
  reservedCase('reject modified staged README with clean working copy', ({ git, write }) => {
    write('README.md', '# Changed\n');
    git(['add', 'README.md']);
    write('README.md', originalReadme);
  }, /Staged README.md differs/);
  reservedCase('reject root README case alias', ({ git }) => git(['mv', 'README.md', 'readme.md']), /Root README filename/);
  reservedCase('reject missing working policy', ({ repository }) => rmSync(path.join(repository, 'AGENTS.md')), /Required regular root file/);
  reservedCase('reject empty working policy', ({ write }) => write('AGENTS.md', ' \n'), /Root AGENTS.md must not be empty/);
  reservedCase('reject empty staged policy with valid working copy', ({ git, write }) => {
    write('AGENTS.md', '');
    git(['add', 'AGENTS.md']);
    write('AGENTS.md', '# Restored working policy\n');
  }, /Staged AGENTS.md must not be empty/);
  reservedCase('reject staged policy deletion with restored working copy', ({ git, write }) => {
    git(['rm', 'AGENTS.md']);
    write('AGENTS.md', '# Restored working policy\n');
  }, /Root AGENTS.md must not be deleted from the index/);
  reservedCase('reject symlink policy in index', ({ git }) => {
    const blob = git(['rev-parse', ':AGENTS.md']).trim();
    git(['update-index', '--cacheinfo', `120000,${blob},AGENTS.md`]);
  }, /regular, resolved index entry/);
  reservedCase('reject policy directory', ({ repository }) => {
    rmSync(path.join(repository, 'AGENTS.md'));
    mkdirSync(path.join(repository, 'AGENTS.md'));
  }, /Required regular root file/);

  const markdown = path.join(directory, 'bad.md');
  writeFileSync(markdown, '# First\n\n# Second\n');
  mustReject(process.execPath, [path.join(root, 'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs'), '--config', path.join(root, '.markdownlint-cli2.jsonc'), markdown], 'Markdown lint');
  const yaml = parseDocument('name: first\nname: duplicate\n', { uniqueKeys: true });
  assert.ok(yaml.errors.length, 'Duplicate YAML keys should fail.');
  console.log('PASS: YAML parser rejected duplicate keys.');
  const workflow = path.join(directory, 'invalid.yml');
  writeFileSync(workflow, 'name: Invalid\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n        unknown-property: invalid\n');
  mustReject(toolPath('actionlint'), ['-shellcheck=', '-pyflakes=', workflow], 'Actionlint');
  const token = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
  assert.match(token, /^ghp_[A-Za-z0-9]{36}$/);
  writeFileSync(path.join(directory, 'synthetic.txt'), `token=${token}\n`);
  const result = mustReject(toolPath('gitleaks'), ['dir', '--redact', '--no-banner', directory], 'Gitleaks');
  assert.ok(!(result.stdout + result.stderr).includes(token), 'Secret output must be redacted.');
  console.log('PASS: scanner output did not disclose the synthetic credential.');
  const stagedRepo = path.join(directory, 'staged-regression');
  mkdirSync(stagedRepo);
  const git = args => execFileSync('git', args, { cwd: stagedRepo, env: gitEnvironment(), stdio: 'pipe' });
  git(['init', '--quiet']);
  writeFileSync(path.join(stagedRepo, 'example.txt'), 'clean\n');
  git(['add', 'example.txt']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'clean baseline']);
  writeFileSync(path.join(stagedRepo, 'example.txt'), `token=${token}\n`);
  git(['add', 'example.txt']);
  writeFileSync(path.join(stagedRepo, 'example.txt'), 'clean again\n');
  assert.throws(() => scanStaged(stagedRepo, 'pipe'), error => error.status === 1 && !(String(error.stdout) + String(error.stderr)).includes(token));
  console.log('PASS: staged secret rejected even when working file is clean.');
} finally {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  assert.ok(!lstatSync(directory).isSymbolicLink());
  rmSync(directory, { recursive: true, force: true });
}
assert.equal(existsSync(directory), false);
