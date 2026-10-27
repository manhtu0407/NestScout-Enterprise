import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync, readdirSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
import { root, toolPath } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { git } from './repository-files.mjs';
import { checkHygiene } from './check-hygiene.mjs';
import { checkYaml } from './check-yaml.mjs';
import { checkWorkflows, checkWorkflowPolicy } from './check-tools.mjs';
import { checkTestSelection } from './check-test-selection.mjs';
import { checkMessage } from './check-metadata.mjs';
import { scanStaged, secretScanOptions, secretScanEnvironment } from './scan-staged.mjs';
import { evidencePath, evidenceRelative, evidenceSanitizer, auditEvidence } from './qa-impact-review-evidence.mjs';
import { benchmarkSource, preparationDirectory } from './qa-impact-review-benchmark.mjs';

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
  // Keep the fixture valid for github-pat rather than relying on generic-rule fallback.
  const token = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
  assert.match(token, /^ghp_[A-Za-z0-9]{36}$/);
  const detection = spawnSync(toolPath('gitleaks'), ['stdin', '--no-banner', '--redact', '--report-format', 'json', '--report-path', '-'], {
    cwd: repository, env: gitEnvironment(), input: JSON.stringify({ token }) + '\n', encoding: 'utf8',
  });
  assert.ifError(detection.error);
  assert.equal(detection.status, 1);
  assert.ok(!(detection.stdout + detection.stderr).includes(token), 'Native fixture detection must remain redacted.');
  assert.ok(JSON.parse(detection.stdout).some(finding => finding.RuleID === 'github-pat' && finding.Entropy > 3),
    'The synthetic fixture must exercise the pinned GitHub PAT rule, not a generic-rule fallback.');
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

test('benchmark README comes from the pinned revision without replacing the delivered README', () => {
  const file = path.join(root, 'README.md');
  const before = readFileSync(file);
  const pack = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/qa-impact-review-r3-v2.json'), 'utf8'));
  const historical = benchmarkSource('README.md');
  assert.equal(createHash('sha256').update(historical).digest('hex'), pack.sourceFiles['README.md']);
  assert.equal(historical.toString(), git(root, ['show', `${pack.sourceRevision}:README.md`]));
  assert.deepEqual(readFileSync(file), before);
});

test('benchmark output creates an absent cache parent and preserves other task data', () => fixture(({ repository, write }) => {
  const first = preparationDirectory(repository);
  assert.equal(path.dirname(realpathSync(first)), realpathSync(path.join(repository, '.cache')));
  write('.cache/peer/operation.lock', 'another task\n');
  write('.cache/peer/evidence.json', '{"preserve":true}\n');
  write('.cache/retained.txt', 'retained\n');
  const second = preparationDirectory(repository);
  assert.notEqual(first, second);
  assert.deepEqual(readdirSync(first), []);
  assert.deepEqual(readdirSync(second), []);
  assert.equal(readFileSync(path.join(repository, '.cache/peer/operation.lock'), 'utf8'), 'another task\n');
  assert.equal(readFileSync(path.join(repository, '.cache/peer/evidence.json'), 'utf8'), '{"preserve":true}\n');
  assert.equal(readFileSync(path.join(repository, '.cache/retained.txt'), 'utf8'), 'retained\n');
}));

test('benchmark output refuses linked roots, ancestors, cache parents and non-directory parents', () => {
  fixture(({ repository, write }) => {
    write('outside/nested/marker.txt', 'preserve\n');
    const outside = path.join(repository, 'outside');
    const kind = process.platform === 'win32' ? 'junction' : 'dir';
    symlinkSync(outside, path.join(repository, 'linked'), kind);
    symlinkSync(outside, path.join(repository, '.cache'), kind);
    for (const target of [repository, path.join(repository, 'linked'), path.join(repository, 'linked/nested')]) {
      assert.throws(() => preparationDirectory(target), /symlink\/junction forbidden/);
    }
    assert.deepEqual(readdirSync(outside), ['nested']);
    assert.deepEqual(readdirSync(path.join(outside, 'nested')), ['marker.txt']);
    assert.equal(readFileSync(path.join(outside, 'nested/marker.txt'), 'utf8'), 'preserve\n');
  });
  fixture(({ repository, write }) => {
    write('.cache', 'not a directory\n');
    assert.throws(() => preparationDirectory(repository), /Nonregular evidence path/);
    assert.equal(readFileSync(path.join(repository, '.cache'), 'utf8'), 'not a directory\n');
  });
});

test('benchmark CLI accepts delivered README drift before rejecting an unsafe cache', () => fixture(({ repository, write, run }) => {
  const checkout = path.join(repository, 'delivery');
  run(['clone', '--quiet', '--no-hardlinks', '--no-checkout', root, checkout]);
  git(checkout, ['checkout', '--quiet', '-b', 'benchmark-fixture', git(root, ['rev-parse', 'HEAD']).trim()]);
  for (const file of ['scripts/qa-impact-review-benchmark.mjs', 'scripts/fixtures/qa-impact-review-r3-v2.json', 'AGENTS.md']) {
    writeFileSync(path.join(checkout, file), readFileSync(path.join(root, file)));
  }
  const before = readFileSync(path.join(checkout, 'README.md'));
  const pack = JSON.parse(readFileSync(path.join(checkout, 'scripts/fixtures/qa-impact-review-r3-v2.json'), 'utf8'));
  assert.notEqual(createHash('sha256').update(before).digest('hex'), pack.sourceFiles['README.md']);
  write('outside/marker.txt', 'preserve\n');
  symlinkSync(path.join(repository, 'outside'), path.join(checkout, '.cache'), process.platform === 'win32' ? 'junction' : 'dir');
  const child = spawnSync(process.execPath, ['scripts/qa-impact-review-benchmark.mjs', 'prepare'], {
    cwd: checkout, env: gitEnvironment(), encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /symlink\/junction forbidden/);
  assert.doesNotMatch(child.stderr, /Harness root copy drift|Harness policy drift/);
  assert.deepEqual(readFileSync(path.join(checkout, 'README.md')), before);
  assert.deepEqual(readdirSync(path.join(repository, 'outside')), ['marker.txt']);
  assert.equal(readFileSync(path.join(repository, 'outside/marker.txt'), 'utf8'), 'preserve\n');
}));

test('benchmark CLI stops on delivered policy drift while the delivered and preregistered policy pins stay distinct', () => fixture(({ repository, run }) => {
  const policy = readFileSync(path.join(root, 'AGENTS.md'));
  const pack = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/qa-impact-review-r3-v2.json'), 'utf8'));
  assert.equal(createHash('sha256').update(policy).digest('hex'), pack.deliveredPolicy['AGENTS.md']);
  assert.equal(createHash('sha256').update(benchmarkSource('AGENTS.md')).digest('hex'), pack.sourceFiles['AGENTS.md']);
  const checkout = path.join(repository, 'delivery');
  run(['clone', '--quiet', '--no-hardlinks', '--no-checkout', root, checkout]);
  git(checkout, ['checkout', '--quiet', '-b', 'benchmark-fixture', git(root, ['rev-parse', 'HEAD']).trim()]);
  for (const file of ['scripts/qa-impact-review-benchmark.mjs', 'scripts/fixtures/qa-impact-review-r3-v2.json']) {
    writeFileSync(path.join(checkout, file), readFileSync(path.join(root, file)));
  }
  writeFileSync(path.join(checkout, 'AGENTS.md'), Buffer.concat([policy, Buffer.from('Drift.\n')]));
  const child = spawnSync(process.execPath, ['scripts/qa-impact-review-benchmark.mjs', 'prepare'], {
    cwd: checkout, env: gitEnvironment(), encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Harness policy drift/);
}));

test('evidence paths reject traversal, platform aliases and ambiguous manifest members', () => fixture(({ repository, write }) => {
  write('evidence/data.json', '{}\n');
  assert.equal(evidencePath(path.join(repository, 'evidence/data.json')), path.join(repository, 'evidence/data.json'));
  assert.equal(evidenceRelative('C01/oracle/base/records.mjs'), 'C01/oracle/base/records.mjs');
  for (const relative of ['../data.json', '/data.json', 'C:/data.json', 'C:data.json', 'C01/../../data.json',
    'C01\\data.json', 'C01//data.json', './data.json', 'C01/./data.json', 'C01/data.json:stream',
    '%2e%2e/data.json', 'C01/data.json.', 'C01/data.json ', 'C01/NUL.json', 'C01/CON', 'C01/COM1.txt', 'x\0y']) {
    assert.throws(() => evidenceRelative(relative), /Unsafe evidence relative path/);
  }
  assert.throws(() => evidencePath(repository + '/evidence/../evidence/data.json'), /traversal/);
  assert.throws(() => evidencePath('relative/data.json'), /Absolute evidence path/);
  assert.throws(() => evidencePath(path.join(repository, 'evidence/data.json') + ':stream'), /Unsafe evidence path component/);
}));

test('evidence CLI refuses ancestor junctions, leaf links and linked mapping inputs without writing targets', () => fixture(({ repository, write }) => {
  write('outside/package/sanitized-manifest.json', '{}\n');
  write('outside/mapping.json', '{"profilePrefixes":["C:/Users/Synthetic Reviewer"]}\n');
  write('package/marker.txt', 'preserve\n');
  const outside = path.join(repository, 'outside');
  const link = path.join(repository, 'linked-ancestor');
  const kind = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(outside, link, kind);
  const before = readFileSync(path.join(outside, 'package/sanitized-manifest.json'));
  for (const target of [link, path.join(link, 'package')]) {
    assert.throws(() => evidencePath(target, 'directory'), /symlink\/junction forbidden/);
  }
  // A junction at a manifest leaf must also be refused before JSON parsing.
  symlinkSync(path.join(outside, 'package'), path.join(repository, 'package/sanitized-manifest.json'), kind);
  const cli = (args, expected) => {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/qa-impact-review-evidence.mjs'), ...args],
      { encoding: 'utf8', env: gitEnvironment() });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, expected);
  };
  cli(['audit-v1', path.join(link, 'package'), '0'.repeat(64)], /symlink\/junction forbidden/);
  cli(['audit-v1', path.join(repository, 'package'), '0'.repeat(64)], /symlink\/junction forbidden/);
  cli(['export-v1', path.join(link, 'mapping.json')], /symlink\/junction forbidden/);
  cli(['audit-v1', repository + '/outside/../package', '0'.repeat(64)], /Evidence path traversal/);
  assert.deepEqual(readFileSync(path.join(outside, 'package/sanitized-manifest.json')), before);
  assert.equal(readFileSync(path.join(repository, 'package/marker.txt'), 'utf8'), 'preserve\n');
  assert.deepEqual(readdirSync(outside).sort(), ['mapping.json', 'package']);
}));

test('evidence audit rejects malicious manifest paths, aliases and altered trusted digest before replay', async () => {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'nestscout-evidence-negative-')));
  const file = path.join(directory, 'sanitized-manifest.json');
  const digest = () => createHash('sha256').update(readFileSync(file)).digest('hex');
  const manifest = files => ({ revision: 'QA02-v1-export-v2', sourceRevision: 'e977bd0e77d0e5c8750e537dda00c551e6ddc365',
    rawManifestSHA256: 'b458bfa88ead7714749ec62eefd71b4b47220ba30b14e68f6cded38964b5935c', files });
  try {
    for (const member of ['../outside.json', 'C:/outside.json', 'C01\\trace.jsonl', 'C01/trace.jsonl:private', '%2e%2e/outside']) {
      writeFileSync(file, JSON.stringify(manifest({ [member]: '0'.repeat(64) })));
      await assert.rejects(auditEvidence(directory, digest()), /Unsafe evidence relative path/);
    }
    writeFileSync(file, JSON.stringify(manifest({ 'C01/trace.jsonl': '0'.repeat(64), 'c01/trace.jsonl': '0'.repeat(64) })));
    await assert.rejects(auditEvidence(directory, digest()), /Evidence case alias/);
    await assert.rejects(auditEvidence(directory, '0'.repeat(64)), /Sanitized manifest integrity/);
    await assert.rejects(auditEvidence(directory), /Trusted sanitized manifest digest required/);
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/qa-impact-review-evidence.mjs'), 'audit-v1', directory, digest()],
      { encoding: 'utf8', env: gitEnvironment() });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Evidence case alias/);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true });
  }
});

test('task-local evidence mappings preserve commands, exits, findings and reject unmapped identities', () => {
  const config = { profilePrefixes: ['D:/Users/Synthetic Reviewer', 'D:/Users/SYNTHR~1'] };
  const sanitizer = evidenceSanitizer(config);
  for (const prefix of ['D:\\Users\\Synthetic Reviewer', 'D:/Users/Synthetic%20Reviewer', 'D:/Users/SYNTHR~1',
    'D:\\\\Users\\\\Synthetic Reviewer', 'D%3A/Users/Synthetic%20Reviewer']) {
    const value = { command: `node "${prefix}/project/probe.mjs"`, exit: 7,
      findings: [{ file: 'scripts/records.mjs', line: 1, input_json: '{"value":0}', expected: false, actual: true }] };
    assert.deepEqual(sanitizer.transform(value), { ...value, command: 'node "<USER_HOME>/project/probe.mjs"' });
  }
  assert.equal(sanitizer.counts.home, 5);
  for (const value of ['C:/Users/Unknown Person/repo', '/home/unknown/repo', '/Users/unknown/repo',
    'D:/Users/Synthetic Reviewer2/repo', 'D%3A%5CUsers%5CUnknown/repo', 'Synthetic Reviewer', 'SYNTHR~1']) {
    assert.throws(() => sanitizer.text(value), /Unmapped private path\/identifier/);
  }
  assert.throws(() => sanitizer.transform({ 'D:/Users/Synthetic Reviewer/x': 1, 'D:/Users/SYNTHR~1/x': 2 }), /Sanitized key collision/);
  for (const profilePrefixes of [[], ['C:/Users'], ['C:/'], ['C:/Users/..'], ['C:/Users/Example', 'c:/users/example']]) {
    assert.throws(() => evidenceSanitizer({ profilePrefixes }));
  }
});

test('task-local evidence mappings sanitize Windows, Linux and macOS profiles without matching neighbors', () => {
  const config = { profilePrefixes: ['/home/synthetic', '/Users/Synthetic Reviewer', 'E:/Users/Synthetic Windows'] };
  const sanitizer = evidenceSanitizer(config);
  for (const [value, expected] of [
    ['/home/synthetic/repo/probe.mjs', '<USER_HOME>/repo/probe.mjs'],
    ['\\home\\synthetic\\repo', '<USER_HOME>\\repo'],
    ['"/home/synthetic"', '"<USER_HOME>"'],
    ['/Users/Synthetic Reviewer/repo', '<USER_HOME>/repo'],
    ['/Users/Synthetic%20Reviewer/repo', '<USER_HOME>/repo'],
    ['E:\\Users\\Synthetic Windows\\repo', '<USER_HOME>\\repo'],
    ['E%3A/Users/Synthetic%20Windows/repo', '<USER_HOME>/repo'],
  ]) assert.equal(sanitizer.text(value), expected);
  assert.equal(sanitizer.counts.home, 7);
  for (const value of ['/home/synthetic2/repo', '/home/other/repo', '/Users/Synthetic Reviewer2/repo',
    'E:/Users/Synthetic Windows2/repo', 'E:/Users/Other/repo']) {
    assert.throws(() => sanitizer.text(value), /Unmapped private path\/identifier/);
  }
  // Regex syntax inside a profile name is literal, and a lone POSIX prefix must construct a valid pattern.
  assert.equal(evidenceSanitizer({ profilePrefixes: ['/home/a.b+c'] }).text('/home/a.b+c/x'), '<USER_HOME>/x');
  assert.throws(() => evidenceSanitizer({ profilePrefixes: ['/home/a.b+c'] }).text('/home/aXb+c/x'), /Unmapped private path\/identifier/);
});

test('evidence audit rejects payload tampering, extra or missing files, broken linkage and ledger mismatch', async () => {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'nestscout-evidence-package-')));
  const sha = value => createHash('sha256').update(value).digest('hex');
  const ids = Array.from({ length: 10 }, (_, n) => `C${String(n + 1).padStart(2, '0')}`);
  const trace = [{ thread_id: '00000000-0000-0000-0000-000000000000' },
    { type: 'item.started', item: { type: 'command_execution', id: 'a', command: 'x' } },
    { type: 'item.completed', item: { type: 'command_execution', id: 'a', command: 'x', exit_code: 0, aggregated_output: '' } },
  ].map(event => JSON.stringify(event)).join('\n') + '\n';
  const ledger = { cases: ids.map(id => ({ id, commandCount: 1, nonzero: 0, zeroExitDiagnostics: [],
    commands: [{ id: 'a', command: 'x', exit: 0, output: '', failureClass: null, zeroExitWithDiagnostic: false }] })), commands: 10, nonzero: 0 };
  const put = (relative, value) => {
    mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
    writeFileSync(path.join(directory, relative), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const build = ({ ledgerValue = ledger } = {}) => {
    const raw = { revision: 'QA02-R3-v1', files: Object.fromEntries(ids.map(id => [`${id}/trace.jsonl`, sha(trace)])) };
    const rawText = JSON.stringify(raw);
    put('raw-hashes.json', rawText);
    for (const id of ids) put(`${id}/trace.jsonl`, trace);
    put('commands-derived.json', ledgerValue);
    put('post-run-smoke.json', '{}');
    const files = { ...raw.files };
    for (const relative of ['raw-hashes.json', 'commands-derived.json', 'post-run-smoke.json']) files[relative] = sha(readFileSync(path.join(directory, relative)));
    const manifest = { revision: 'QA02-v1-export-v2', sourceRevision: 'e977bd0e77d0e5c8750e537dda00c551e6ddc365',
      rawManifestSHA256: sha(rawText), files,
      mapping: { method: 'Exact profile/fixture/thread token replacement; decoded JSON values and keys; no event filtering',
        files: Object.fromEntries(Object.entries(raw.files).map(([relative, digest]) => [relative, { rawSHA256: digest, sanitizedSHA256: digest }])) },
      scan: { tool: 'Gitleaks 8.30.1', exit: 0 }, humanPrivacyReview: 'REQUIRED BEFORE SHARING',
      supplementalEvidence: { file: 'post-run-smoke.json', rawSHA256: '0'.repeat(64) } };
    return { manifest, pinned: sha(rawText) };
  };
  const audit = async (manifest, pinned) => {
    put('sanitized-manifest.json', manifest);
    return auditEvidence(directory, sha(readFileSync(path.join(directory, 'sanitized-manifest.json'))), pinned);
  };
  const reset = () => { rmSync(directory, { recursive: true }); mkdirSync(directory); };
  try {
    // Reference: every earlier integrity gate passes, so a wrong ledger is the first rejection.
    let { manifest, pinned } = build({ ledgerValue: {} });
    await assert.rejects(audit(manifest, pinned), /Derived command ledger mismatch/);
    reset();
    // A correct ledger proceeds beyond every static gate into replay, which needs the unavailable raw answers.
    ({ manifest, pinned } = build());
    await assert.rejects(audit(manifest, pinned), error => !/ledger mismatch|integrity|linkage|allow-list|inventory/.test(error.message));
    reset();

    ({ manifest, pinned } = build());
    await assert.rejects(audit(manifest, '1'.repeat(64)), /Raw manifest pin/);
    put('C03/trace.jsonl', trace.replace('"x"', '"y"'));
    await assert.rejects(audit(manifest, pinned), /Evidence payload integrity: C03\/trace\.jsonl/);
    reset();

    ({ manifest, pinned } = build());
    put('extra.json', '{}');
    await assert.rejects(audit(manifest, pinned), /Evidence directory inventory/);
    reset();

    ({ manifest, pinned } = build());
    rmSync(path.join(directory, 'C07/trace.jsonl'));
    await assert.rejects(audit(manifest, pinned), /Evidence directory inventory/);
    reset();

    ({ manifest, pinned } = build());
    manifest.files['C01/extra.jsonl'] = '0'.repeat(64);
    await assert.rejects(audit(manifest, pinned), /Evidence payload allow-list/);
    reset();

    ({ manifest, pinned } = build());
    delete manifest.mapping.files['C10/trace.jsonl'];
    await assert.rejects(audit(manifest, pinned), /Raw mapping coverage/);
    reset();

    ({ manifest, pinned } = build());
    manifest.mapping.files['C02/trace.jsonl'].rawSHA256 = '2'.repeat(64);
    await assert.rejects(audit(manifest, pinned), /Raw-to-sanitized hash linkage/);
    reset();

    ({ manifest, pinned } = build());
    manifest.mapping.files['C02/trace.jsonl'].sanitizedSHA256 = '2'.repeat(64);
    await assert.rejects(audit(manifest, pinned), /Raw-to-sanitized hash linkage/);
    reset();

    // Command text changed between start and completion is rejected by the derived-ledger construction itself.
    ({ manifest, pinned } = build());
    const altered = trace.replace('"command":"x","exit_code"', '"command":"z","exit_code"');
    for (const id of ids) put(`${id}/trace.jsonl`, altered);
    put('raw-hashes.json', JSON.stringify({ revision: 'QA02-R3-v1', files: Object.fromEntries(ids.map(id => [`${id}/trace.jsonl`, sha(altered)])) }));
    manifest.rawManifestSHA256 = pinned = sha(readFileSync(path.join(directory, 'raw-hashes.json')));
    manifest.files['raw-hashes.json'] = pinned;
    for (const id of ids) {
      manifest.files[`${id}/trace.jsonl`] = sha(altered);
      manifest.mapping.files[`${id}/trace.jsonl`] = { rawSHA256: sha(altered), sanitizedSHA256: sha(altered) };
    }
    await assert.rejects(audit(manifest, pinned), assert.AssertionError);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    rmSync(directory, { recursive: true });
  }
});
