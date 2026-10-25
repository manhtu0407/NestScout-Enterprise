import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { checkHygiene } from './check-hygiene.mjs';
import { checkYaml } from './check-yaml.mjs';
import { checkWorkflows } from './check-tools.mjs';

test('hosted repository checks retain unconditional aggregate and negative verification', () => {
  const workflow = parseDocument(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')).toJS();
  const job = workflow.jobs['repository-checks'];
  assert.equal(job.name, 'Repository checks');
  assert.equal(job.if, undefined);
  assert.equal(job['continue-on-error'], undefined);
  for (const command of ['npm run check', 'npm run verify:negative']) {
    const step = job.steps.find(step => step.run === command);
    assert.ok(step, `Required CI command missing or masked: ${command}`);
    assert.equal(step.if, undefined, `Required CI command is conditional: ${command}`);
    assert.equal(step['continue-on-error'], undefined, `Required CI command ignores failure: ${command}`);
  }
});

function fixture(operation) {
  const repository = mkdtempSync(path.join(tmpdir(), 'nestscout-verification-'));
  const write = (file, text) => {
    const target = path.join(repository, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const run = args => git(repository, args);
  try {
    run(['init', '--quiet']);
    write('package.json', '{}\n');
    write('.codex/config.toml', '[mcp_servers.fixture]\ncommand = "node"\n');
    write('.claude/settings.json', '{"attribution":false}\n');
    run(['add', '.']);
    operation({ repository, write, run });
  } finally {
    assert.equal(path.dirname(realpathSync(repository)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(repository).isSymbolicLink());
    rmSync(repository, { recursive: true });
  }
}

test('YAML accepts valid index, working, untracked and special-character paths', () => fixture(({ repository, write, run }) => {
  write('settings.yml', 'name: index\n');
  run(['add', '.']);
  write('settings.yml', 'name: working\n');
  write('untracked #%.yaml', 'name: untracked\n');
  write('.github/ISSUE_TEMPLATE/config.yml', 'blank_issues_enabled: false\n');
  write('.github/ISSUE_TEMPLATE/feature.yml', 'name: Feature\ndescription: Propose work\nbody: []\n');
  assert.doesNotThrow(() => checkYaml(repository));
}));

test('YAML rejects invalid staged syntax even with a valid or missing working file', () => fixture(({ repository, write, run }) => {
  write('settings.yml', 'name: first\nname: duplicate\n');
  run(['add', '.']);
  write('settings.yml', 'name: clean\n');
  assert.throws(() => checkYaml(repository), /index settings.yml.*DUPLICATE_KEY/);
  rmSync(path.join(repository, 'settings.yml'));
  assert.throws(() => checkYaml(repository), /index settings.yml.*DUPLICATE_KEY/);
  run(['rm', '--cached', '--', 'settings.yml']);
  assert.doesNotThrow(() => checkYaml(repository));
}));

test('YAML rejects invalid working/untracked syntax and malformed Issue Forms', () => fixture(({ repository, write, run }) => {
  write('settings.yml', 'name: valid\n');
  run(['add', '.']);
  write('settings.yml', 'name: [\n');
  assert.throws(() => checkYaml(repository), /working settings.yml/);
  write('settings.yml', 'name: clean\n');
  write('untracked.yaml', 'name: first\nname: duplicate\n');
  assert.throws(() => checkYaml(repository), /working untracked.yaml.*DUPLICATE_KEY/);
  rmSync(path.join(repository, 'untracked.yaml'));
  for (const form of ['null\n', 'name: Feature\ndescription: Propose work\n', 'name: 1\ndescription: 2\nbody: []\n']) {
    write('.github/ISSUE_TEMPLATE/feature.yml', form);
    assert.throws(() => checkYaml(repository), /Issue Form/);
  }
  write('.github/ISSUE_TEMPLATE/feature.yml', 'name: Feature\n');
  run(['add', '.']);
  write('.github/ISSUE_TEMPLATE/feature.yml', 'name: Feature\ndescription: Propose work\nbody: []\n');
  assert.throws(() => checkYaml(repository), /index .*Issue Form/);
}));

test('JSON syntax is validated in both states while valid string fixtures remain accepted', () => fixture(({ repository, write, run }) => {
  write('scripts/fixture.json', '{"example":"Generated with Claude Code"}\n');
  run(['add', '.']);
  assert.doesNotThrow(() => checkHygiene(repository));
  write('scripts/fixture.json', '{"invalid":}\n');
  assert.throws(() => checkHygiene(repository), /Invalid configuration syntax.*working scripts\/fixture.json/);
  run(['add', '.']);
  write('scripts/fixture.json', '{}\n');
  assert.throws(() => checkHygiene(repository), /Invalid configuration syntax.*index scripts\/fixture.json/);
  rmSync(path.join(repository, 'scripts/fixture.json'));
  assert.throws(() => checkHygiene(repository), /Invalid configuration syntax.*index scripts\/fixture.json/);
  run(['rm', '--cached', '--', 'scripts/fixture.json']);
  assert.doesNotThrow(() => checkHygiene(repository));
}));

test('workflow semantics inspect index, working and untracked content independently', () => fixture(({ repository, write, run }) => {
  const file = '.github/workflows/ci.yml';
  const valid = 'name: Fixture\non: push\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n';
  const invalid = valid + '        unknown-property: invalid\n';
  assert.throws(() => checkWorkflows(repository, 'pipe'), /No repository workflows/);
  write(file, valid);
  run(['add', '.']);
  assert.doesNotThrow(() => checkWorkflows(repository, 'pipe'));
  write(file, invalid);
  assert.throws(() => checkWorkflows(repository, 'pipe'), /Invalid working workflow/);
  run(['add', '.']);
  write(file, valid);
  assert.throws(() => checkWorkflows(repository, 'pipe'), /Invalid index workflow/);
  rmSync(path.join(repository, file));
  assert.throws(() => checkWorkflows(repository, 'pipe'), /Invalid index workflow/);
  run(['rm', '--cached', '--', file]);
  write(file, valid);
  write('.github/workflows/other.yaml', invalid);
  assert.throws(() => checkWorkflows(repository, 'pipe'), /Invalid working workflow .*other.yaml/);
  rmSync(path.join(repository, '.github/workflows/other.yaml'));
  assert.doesNotThrow(() => checkWorkflows(repository, 'pipe'));
}));
