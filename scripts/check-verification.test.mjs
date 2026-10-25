import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { checkHygiene } from './check-hygiene.mjs';
import { checkYaml } from './check-yaml.mjs';
import { checkWorkflows } from './check-tools.mjs';
import { checkTestSelection } from './check-test-selection.mjs';
import { checkMessage } from './check-metadata.mjs';
import { scanStaged } from './scan-staged.mjs';

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

test('Supabase hosted job keeps all security and local integration gates unmasked', () => {
  const workflow = parseDocument(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')).toJS();
  const job = workflow.jobs['supabase-local'];
  assert.equal(job.name, 'Supabase local verification');
  assert.equal(job.if, undefined);
  assert.equal(job['continue-on-error'], undefined);
  for (const command of ['npm run db:test', 'npm run db:mcp:test', 'npm run db:drift', 'npm run db:types:check']) {
    const step = job.steps.find(step => step.run === command);
    assert.ok(step, 'Required Supabase verification missing: ' + command);
    assert.equal(step.if, undefined);
    assert.equal(step['continue-on-error'], undefined);
  }
});

function selectionFixture(operation) {
  fixture(({ repository, write, run }) => {
    const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
    const tests = readdirSync(path.join(root, 'scripts')).filter(file => file.endsWith('.test.mjs'));
    write('package.json', JSON.stringify({ scripts }) + '\n');
    for (const testFile of tests) write('scripts/' + testFile, 'import { test } from "node:test"; test("fixture", () => {});\n');
    run(['add', '.']);
    operation({ repository, write, run, scripts });
  });
}

test('persistent test selection covers every test exactly once in both Git states', () => selectionFixture(({ repository, write, run }) => {
  assert.doesNotThrow(() => checkTestSelection(repository));
  write('scripts/unselected.test.mjs', 'test fixture\n');
  assert.throws(() => checkTestSelection(repository), /unselected persistent test/);
  run(['add', '--', 'scripts/unselected.test.mjs']);
  assert.throws(() => checkTestSelection(repository), /unselected persistent test/);
  write('package.json', readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.throws(() => checkTestSelection(repository), /unselected persistent test/);
}));

test('mutated aggregate and weakened test commands are rejected', () => selectionFixture(({ repository, write, run, scripts }) => {
  const mutate = (change, expected) => {
    const candidate = { ...scripts };
    change(candidate);
    write('package.json', JSON.stringify({ scripts: candidate }) + '\n');
    assert.throws(() => checkTestSelection(repository), expected);
    run(['add', '--', 'package.json']);
    assert.throws(() => checkTestSelection(repository), expected);
    write('package.json', JSON.stringify({ scripts }) + '\n');
    run(['add', '--', 'package.json']);
    assert.doesNotThrow(() => checkTestSelection(repository));
  };
  mutate(value => { value.check = value.check.replace('npm run check:test-selection', 'echo optional'); }, /aggregate check/);
  mutate(value => { value['verify:negative'] = 'node scripts/verify-negative.mjs && node --test scripts/check-hygiene.test.mjs'; }, /unselected persistent test/);
  mutate(value => { value['verify:negative'] += ' || true'; }, /invalid or unsafe test target/);
  mutate(value => { value['db:mcp:test'] = 'echo pass'; }, /test runner must execute/);
}));

test('mutation examples reject unapproved delivery metadata while accepting legitimate changes', () => {
  assert.doesNotThrow(() => checkMessage('test: preserve honest test evidence'));
  const mutations = [
    'test: preserve honest test evidence\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
    'test: preserve honest test evidence\n\nAuthor: Codex',
    'test: preserve honest test evidence [skip ci]',
    'test: preserve honest test evidence\n\nCodex - Co-Founder',
  ];
  for (const candidate of mutations) assert.throws(() => checkMessage(candidate));
});

test('staged secret mutations are detected with clean or absent working copies', () => fixture(({ repository, write, run }) => {
  const file = 'scripts/secret-fixture.json';
  const token = 'gh' + 'p_' + randomBytes(28).toString('base64url');
  write(file, JSON.stringify({ token }) + '\n');
  run(['add', '--', file]);
  write(file, '{}\n');
  assert.throws(() => scanStaged(repository, 'pipe'), error =>
    error.status === 1 && !(String(error.stdout) + String(error.stderr)).includes(token));
  rmSync(path.join(repository, file));
  assert.throws(() => scanStaged(repository, 'pipe'), error =>
    error.status === 1 && !(String(error.stdout) + String(error.stderr)).includes(token));
  run(['rm', '--cached', '--', file]);
  assert.doesNotThrow(() => scanStaged(repository, 'pipe'));
}));
