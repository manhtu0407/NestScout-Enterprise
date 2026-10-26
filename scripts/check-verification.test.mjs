import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync, readdirSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
import { root, toolPath } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { git } from './repository-files.mjs';
import { checkHygiene } from './check-hygiene.mjs';
import { checkYaml } from './check-yaml.mjs';
import { checkWorkflows } from './check-tools.mjs';
import { checkTestSelection } from './check-test-selection.mjs';
import { checkMessage } from './check-metadata.mjs';
import { scanStaged } from './scan-staged.mjs';
import { evidencePath, evidenceRelative, evidenceSanitizer, auditEvidence } from './qa-impact-review-evidence.mjs';

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
