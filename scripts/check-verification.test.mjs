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
import { checkWorkflows, checkWorkflowPolicy } from './check-tools.mjs';
import { checkTestSelection } from './check-test-selection.mjs';
import { checkMessage } from './check-metadata.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { scanStaged, secretScanOptions, secretScanEnvironment } from './scan-staged.mjs';
import { toolPath } from './tool-path.mjs';

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

test('native Linux optional checks preserve CI identity, triggers, read-only permissions and offline scope', () => {
  const workflow = parseDocument(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')).toJS();
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push']);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review']);
  const job = workflow.jobs['repository-checks'];
  assert.equal(job.name, 'Repository checks');
  assert.equal(job['timeout-minutes'], 10);
  const smoke = job.steps.find(step => step.run === 'npm run tools:linux:smoke');
  assert.ok(smoke);
  assert.equal(smoke.if, undefined);
  assert.equal(smoke['continue-on-error'], undefined);
  for (const step of job.steps) {
    if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
    assert.doesNotMatch(step.run ?? '', /tools:trivy:db|tools:osv:source|pull_request_target/);
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
  const valid = 'name: Fixture\non:\n  push:\n    branches: [main]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n';
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
    for (const file of ['run-tests', 'test-integrity-reporter']) write(`scripts/${file}.mjs`, 'export default async function* () {}\n');
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
  mutate(value => { value['verify:negative'] = 'node scripts/verify-negative.mjs && node scripts/run-tests.mjs scripts/check-hygiene.test.mjs'; }, /unselected persistent test/);
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

// Synthetic credential shape and suppression marker are assembled so this file is not itself a finding or a suppression.
const syntheticToken = () => ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
const suppression = ['gitleaks', ':', 'allow'].join('');
const suppressed = (token, style) => ({
  hash: `token=${token} # ${suppression}\n`,
  html: `Example: token=${token} <!-- ${suppression} -->\n`,
  slash: `export const token = '${token}'; // ${suppression}\n`,
  spaced: `token=${token} #   ${suppression.toUpperCase()}\n`,
}[style]);
const scanHistory = repository => execFileSync(toolPath('gitleaks'), ['git', ...secretScanOptions, '--log-opts=--all', repository], { cwd: repository, env: secretScanEnvironment(), stdio: 'pipe' });
const scanFiles = directory => execFileSync(toolPath('gitleaks'), ['dir', ...secretScanOptions, directory], { cwd: directory, env: secretScanEnvironment(), stdio: 'pipe' });
const detected = scan => { try { scan(); return false; } catch (error) { return error.status === 1 && /leaks found/.test(String(error.stderr) + String(error.stdout)); } };
const commit = (repository, message) => git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', message]);

test('inline Gitleaks suppression cannot hide a staged secret whose working file is clean', () => fixture(({ repository, write, run }) => {
  for (const [file, style] of [['docs/example.md', 'html'], ['scripts/example.mjs', 'slash'], ['scripts/example.json', 'hash'], ['docs/spaced.md', 'spaced']]) {
    write(file, suppressed(syntheticToken(), style));
    run(['add', '--', file]);
    write(file, 'clean\n');
    assert.ok(detected(() => scanStaged(repository, 'pipe')), `${style} suppression hid a staged secret`);
    run(['rm', '--cached', '--force', '--quiet', '--', file]);
  }
  write('docs/example.md', 'Gitleaks reports are redacted; no credential is present.\n');
  run(['add', '--', 'docs/example.md']);
  assert.doesNotThrow(() => scanStaged(repository, 'pipe'));
}));

test('inline Gitleaks suppression cannot hide secrets in history or the working copy', () => fixture(({ repository, write, run }) => {
  write('docs/note.md', suppressed(syntheticToken(), 'html'));
  assert.ok(detected(() => scanFiles(repository)), 'working-copy scan honored a suppression');
  run(['add', '.']);
  commit(repository, 'docs: add note');
  run(['rm', '--quiet', '--force', '--', 'docs/note.md']);
  commit(repository, 'docs: remove note');
  assert.ok(detected(() => scanHistory(repository)), 'history scan honored a suppression');
}));

test('ambient Gitleaks configuration cannot allowlist a staged secret', () => fixture(({ repository, write, run }) => {
  write('docs/example.md', `token=${syntheticToken()}\n`);
  run(['add', '--', 'docs/example.md']);
  const allowlist = "[extend]\nuseDefault = true\n[[allowlists]]\nregexes = ['''ghp_[A-Za-z0-9]{36}''']\n";
  const saved = process.env.GITLEAKS_CONFIG_TOML;
  process.env.GITLEAKS_CONFIG_TOML = allowlist;
  try {
    assert.ok(detected(() => scanStaged(repository, 'pipe')), 'ambient configuration hid a staged secret');
  } finally {
    if (saved === undefined) delete process.env.GITLEAKS_CONFIG_TOML; else process.env.GITLEAKS_CONFIG_TOML = saved;
  }
}));

test('Gitleaks ignore and configuration files remain unapproved repository paths', () => fixture(({ repository, write }) => {
  for (const file of ['.gitleaksignore', '.gitleaks.toml', 'docs/.gitleaksignore']) {
    write(file, 'example\n');
    assert.throws(() => checkHygiene(repository), /No approved naming convention/, file);
    rmSync(path.join(repository, file));
  }
}));

const workflowSource = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
const unsafeWorkflowMutations = {
  'pull_request_target trigger': text => text.replace('  pull_request:', '  pull_request_target:'),
  'workflow_run trigger': text => text.replace('  pull_request:', '  workflow_run:\n    workflows: [Other]\n  pull_request:'),
  'issue_comment trigger': text => text.replace('  pull_request:', '  issue_comment:\n    types: [created]\n  pull_request:'),
  'push to every branch': text => text.replace('branches: [main]', "branches: ['**']"),
  'push without branch filter': text => text.replace('  push:\n    branches: [main]', '  push:'),
  'push of tags': text => text.replace('branches: [main]', 'branches: [main]\n    tags: [v*]'),
  'write-all token': text => text.replace('permissions:\n  contents: read', 'permissions: write-all'),
  'top-level write permission': text => text.replace('contents: read', 'contents: write'),
  'missing top-level permissions': text => text.replace('permissions:\n  contents: read\n\n', ''),
  'job-level write permission': text => text.replace('    timeout-minutes: 10\n', '    timeout-minutes: 10\n    permissions:\n      pull-requests: write\n'),
  'mutable action tag': text => text.replaceAll('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6', 'actions/checkout@v6'),
  'mutable action branch': text => text.replace('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6', 'actions/setup-node@main'),
  'abbreviated action SHA': text => text.replace('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803', 'actions/checkout@d23441a'),
  'unpinned Docker action': text => text.replace('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6', 'docker://alpine:3'),
  'unpinned reusable workflow': text => text.replace('    runs-on: ubuntu-24.04\n', '    uses: owner/repo/.github/workflows/x.yml@v1\n'),
};

test('current hosted workflows satisfy the trust policy in index and working tree', () => {
  assert.doesNotThrow(() => checkWorkflowPolicy(root));
  for (const mutation of Object.values(unsafeWorkflowMutations)) assert.notEqual(mutation(workflowSource), workflowSource);
});

test('unsafe workflow changes fail in each Git state and for additional workflow files', () => fixture(({ repository, write, run }) => {
  for (const [label, mutate] of Object.entries(unsafeWorkflowMutations)) {
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/extra.yml']) {
      write('.github/workflows/ci.yml', workflowSource);
      run(['add', '.']);
      assert.doesNotThrow(() => checkWorkflowPolicy(repository));
      write(file, mutate(workflowSource));
      assert.throws(() => checkWorkflowPolicy(repository), /Unsafe working workflow/, `${label} (working ${file})`);
      run(['add', '.']);
      write(file, workflowSource);
      assert.throws(() => checkWorkflowPolicy(repository), /Unsafe index workflow/, `${label} (index ${file})`);
      run(['rm', '--cached', '--force', '--quiet', '--', file]);
      run(['add', '.']);
      if (file.endsWith('extra.yml')) rmSync(path.join(repository, file));
    }
  }
}));

test('workflow lint rejects policy violations that actionlint accepts', () => fixture(({ repository, write }) => {
  write('.github/workflows/ci.yml', workflowSource.replace('contents: read', 'contents: write'));
  assert.throws(() => checkWorkflows(repository, 'pipe'), /Unsafe working workflow .*read-only/);
}));

test('safe workflow variants remain accepted', () => fixture(({ repository, write }) => {
  const variants = [
    workflowSource.replace('permissions:\n  contents: read', 'permissions: read-all'),
    workflowSource.replace('permissions:\n  contents: read', 'permissions: {}'),
    workflowSource.replace('  pull_request:', '  workflow_dispatch:\n  pull_request:'),
    workflowSource.replace('      - name: Set up Node.js', '      - uses: ./.github/actions/local\n      - name: Set up Node.js'),
    workflowSource.replace('    steps:\n      - name: Check out full history', `    permissions:\n      contents: read\n    steps:\n      - name: Check out full history`),
  ];
  for (const variant of variants) {
    write('.github/workflows/ci.yml', variant);
    assert.doesNotThrow(() => checkWorkflowPolicy(repository));
  }
}));

test('every persistent test runner uses the integrity runner script in each Git state', () => selectionFixture(({ repository, write, run, scripts }) => {
  assert.doesNotThrow(() => checkTestSelection(repository));
  const runner = 'node scripts/run-tests.mjs ';
  for (const name of ['verify:foundation', 'verify:supabase', 'verify:negative', 'db:mcp:test']) {
    assert.ok(scripts[name].includes(runner), `${name} lacks the integrity runner`);
    for (const weaker of ['node --test ', 'node --test --test-reporter=./scripts/test-integrity-reporter.mjs ']) {
      const candidate = { ...scripts, [name]: scripts[name].replace(runner, weaker) };
      write('package.json', JSON.stringify({ scripts: candidate }) + '\n');
      assert.throws(() => checkTestSelection(repository), new RegExp(`working: test runner must execute node scripts/run-tests.mjs: ${name}`));
      run(['add', '--', 'package.json']);
      assert.throws(() => checkTestSelection(repository), new RegExp(`index: test runner must execute node scripts/run-tests.mjs: ${name}`));
      write('package.json', JSON.stringify({ scripts }) + '\n');
      run(['add', '--', 'package.json']);
      assert.doesNotThrow(() => checkTestSelection(repository));
    }
  }
  for (const [file, message] of [['run-tests', 'test runner script'], ['test-integrity-reporter', 'test integrity reporter']]) {
    const target = `scripts/${file}.mjs`;
    rmSync(path.join(repository, target));
    assert.throws(() => checkTestSelection(repository), new RegExp(`working: missing ${message}`));
    run(['rm', '--cached', '--quiet', '--', target]);
    assert.throws(() => checkTestSelection(repository), new RegExp(`(index|working): missing ${message}`));
    write(target, 'export default async function* () {}\n');
    run(['add', '--', target]);
    assert.doesNotThrow(() => checkTestSelection(repository));
  }
}));

test('the runner script used by every runner still fails a skipped test and passes an executed one', () => fixture(({ repository, write }) => {
  const runner = path.join(root, 'scripts/run-tests.mjs');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:NODE_TEST_CONTEXT|NODE_OPTIONS|npm_config_node_options)$/i.test(name)));
  const execute = source => {
    write('probe.test.mjs', `import { test } from 'node:test';\n${source}`);
    return spawnSync(process.execPath, [runner, 'probe.test.mjs'], { cwd: repository, encoding: 'utf8', env }).status;
  };
  assert.equal(execute("test('runs', () => {});\n"), 0);
  assert.equal(execute("test('runs', () => {});\ntest.skip('disabled', () => {});\n"), 1);
  assert.equal(execute("import { describe, it } from 'node:test';\ntest('runs', () => {});\ndescribe.skip('disabled suite', () => { it('inner', () => {}); });\n"), 1);
}));
