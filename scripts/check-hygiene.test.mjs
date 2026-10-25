import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { checkPath, checkAttribution, checkHygiene } from './check-hygiene.mjs';
import { checkBranch, checkMessage, checkMetadata, checkPullRequest, checkCommitRange, checkPush } from './check-metadata.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-hygiene-'));
after(() => {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  rmSync(directory, { recursive: true });
});
function fixture() {
  const repository = mkdtempSync(path.join(directory, 'repository-'));
  const run = args => git(repository, args);
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), text);
  };
  run(['init', '--quiet', '--initial-branch=main']);
  run(['config', 'user.name', 'Fixture']);
  run(['config', 'user.email', 'fixture@example.invalid']);
  write('.gitignore', '.cache/\ncoverage/\nnode_modules/\n*.log\n');
  write('package.json', '{}\n');
  write('.codex/config.toml', '[mcp_servers.fixture]\ncommand = "node"\n');
  write('.claude/settings.json', '{"attribution":{"commit":"","pr":"","sessionUrl":false}}\n');
  write('scripts/example.mjs', 'export const valid = true;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: establish fixture']);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  run(['switch', '--quiet', '-c', 'codex/hygiene-fixture']);
  return { repository, run, write };
}

test('existing naming categories and exact required/generated/legal filenames pass', () => {
  for (const file of ['AGENTS.md', 'README.md', 'LICENSE', 'AUTHORS', 'CONTRIBUTORS.md',
    '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/feature.yml', '.github/workflows/ci.yml',
    'scripts/check-tools.mjs', 'scripts/check-hygiene.test.mjs', 'scripts/supabase-mcp.integration.test.mjs',
    'scripts/tools.json', 'docs/claude.architecture.md', 'docs/agents.design.md', 'docs/setup-evidence.md',
    'supabase/database.types.ts', 'supabase/config.toml', 'supabase/supabase.lock',
    'supabase/migrations/20261025090000_add_example.sql', 'supabase/tests/database/security.test.sql',
    'module/README.md', '.agents/skills/example/SKILL.md', '.claude/skills/example/SKILL.md']) {
    assert.doesNotThrow(() => checkPath(file), file);
  }
});
test('unknown architecture, case variants, scratch names, archives and unsafe paths fail', () => {
  for (const file of ['Scripts/tool.mjs', 'scripts/CheckTools.mjs', 'scripts/check_tools.mjs', 'docs/New Guide.md',
    '.github/workflows/CI.yml', 'supabase/migrations/001_example.sql', 'scripts/example.js', 'src/App.tsx',
    'docs/REPORT.md', 'docs/plan-feature.md', 'docs/notes.md', 'report.zip', 'docs/design.PDF',
    'scripts/../example.mjs', '/scripts/example.mjs', 'scripts\\example.mjs', 'docs/bad\nname.md',
    'node_modules/example/index.js', 'dist/index.mjs', '.claude/settings.local.json']) {
    assert.throws(() => checkPath(file), undefined, file);
  }
});
test('real technical comments, factual people, API contracts and provenance pass', () => {
  for (const text of ['// Keep the lock until the asynchronous callback settles.',
    '/* The caller must approve this SQL before execution. */', '/** @returns {Promise<void>} */',
    '// Copyright 2026 Example Corporation. All rights reserved.',
    'Co-Authored-By: Claude Shannon <claude@example.invalid>', 'Signed-off-by: Example Contributor <person@example.invalid>',
    'Use Claude Code with attribution disabled.', 'The OpenAI source defines the configuration key.',
    'Do not add AI signatures or fabricated roles.', 'A test verifies that generated attribution is rejected.']) {
    assert.doesNotThrow(() => checkAttribution(text, 'fixture'), text);
  }
});
for (const signature of ['// Generated with Claude Code', '/* Written by Codex */', '# POWERED BY CHATGPT',
  '<!-- Generated with [Claude Code](https://claude.com/claude-code) -->',
  '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
  'Co-Authored-By: Claude <noreply@anthropic.com>', 'co-authored-by: CODEX <noreply@openai.com>',
  'Signed-off-by: Claude Opus 4.6 <noreply@anthropic.com>', 'Claude-Session: https://claude.ai/example',
  'Codex: Founder', 'Claude Code is the Co-Founder', 'Owner: AI assistant', 'Maintainer: Codex',
  'As an AI assistant, I implemented this.', 'G\u200benerated with C\u200blAude Code', 'Ｇｅｎｅｒａｔｅｄ with Codex']) {
  test(`reject explicit attribution signature ${JSON.stringify(signature)}`, () => {
    assert.throws(() => checkAttribution(signature, 'fixture'), /Unapproved AI attribution/);
  });
}
test('working, staged, renamed and committed source comments are checked without scanning string fixtures', () => {
  const { repository, write, run } = fixture();
  write('scripts/example.mjs', 'const fixture = "Generated with Claude Code";\n// Preserve a lock across awaits.\n');
  run(['add', '.']);
  assert.doesNotThrow(() => checkHygiene(repository));
  write('scripts/example.mjs', 'export const valid = true; // Generated with Codex\n');
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  run(['add', '.']);
  write('scripts/example.mjs', 'export const valid = true;\n');
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  run(['mv', 'scripts/example.mjs', 'scripts/renamed.mjs']);
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  run(['commit', '--quiet', '-m', 'test: retain invalid staged fixture']);
  rmSync(path.join(repository, 'scripts/renamed.mjs'));
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  run(['rm', '--cached', 'scripts/renamed.mjs']);
  assert.doesNotThrow(() => checkHygiene(repository));
});
test('untracked documents, comment blocks and post-code comments are checked', () => {
  const { repository, write } = fixture();
  for (const content of ['/*\n * Generated with Claude Code\n */\nexport const x = 1;\n',
    'const x = 1; /* Generated with Codex */\n', '// Generated with Claude Code\n',
    'export function f() { /* Written by Codex */ return 1; }\n']) {
    write('scripts/probe.mjs', content);
    assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  }
  rmSync(path.join(repository, 'scripts/probe.mjs'));
  write('docs/probe.md', '# Probe\n\nGenerated with Claude Code\n');
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
});
test('forced staging cannot add ignored paths or hide bad filenames by deleting their working copy', () => {
  const { repository, run, write } = fixture();
  for (const file of ['.cache/hidden.json', 'coverage/hidden.json', 'node_modules/example/index.mjs', 'docs/REPORT.md']) {
    write(file, '{}\n');
    run(['add', '--force', '--', file]);
    rmSync(path.join(repository, file));
    assert.throws(() => checkHygiene(repository));
    run(['rm', '--cached', '--', file]);
  }
  assert.doesNotThrow(() => checkHygiene(repository));
});
test('case-only working rename, index symlinks and unresolved entries fail', () => {
  const { repository, run } = fixture();
  const source = path.join(repository, 'scripts/example.mjs');
  renameSync(source, `${source}.tmp`);
  renameSync(`${source}.tmp`, path.join(repository, 'scripts/Example.mjs'));
  assert.throws(() => checkHygiene(repository), /case|naming convention/i);
  renameSync(path.join(repository, 'scripts/Example.mjs'), source);
  const blob = run(['rev-parse', ':scripts/example.mjs']).trim();
  run(['update-index', '--cacheinfo', `120000,${blob},scripts/example.mjs`]);
  assert.throws(() => checkHygiene(repository), /regular resolved index/);
  run(['update-index', '--cacheinfo', `100644,${blob},scripts/example.mjs`]);
  run(['update-index', '--force-remove', 'scripts/example.mjs']);
  git(repository, ['update-index', '--index-info'], { input: `100644 ${blob} 1\tscripts/example.mjs\n100644 ${blob} 2\tscripts/example.mjs\n` });
  assert.throws(() => checkHygiene(repository), /regular resolved index/);
});
test('attribution configuration must exist and be disabled in both index and working tree', () => {
  for (const [file, invalid] of [['.codex/config.toml', 'commit_attribution = "Codex"\n'],
    ['.claude/settings.json', '{"attribution":{"commit":"","pr":"promotional text","sessionUrl":false}}\n'],
    ['.claude/settings.json', '{"attribution":{"commit":"","pr":"","sessionUrl":true}}\n']]) {
    const { repository, run, write } = fixture();
    const valid = readFileSync(path.join(repository, file));
    write(file, invalid);
    assert.throws(() => checkHygiene(repository), /attribution/);
    run(['add', file]);
    write(file, valid);
    assert.throws(() => checkHygiene(repository), /attribution/);
    run(['add', file]);
    assert.doesNotThrow(() => checkHygiene(repository));
    run(['rm', '--cached', file]);
    assert.throws(() => checkHygiene(repository), /Missing index attribution/);
  }
});
test('permanent artifacts require matching index and working manifests, hash and provenance', () => {
  const { repository, run, write } = fixture();
  const content = Buffer.from('%PDF-1.7\nfixture\n');
  const item = { path: 'docs/artifacts/interface-contract.pdf', purpose: 'Reviewable interface contract', source: 'Owner supplied specification', sha256: createHash('sha256').update(content).digest('hex') };
  write(item.path, content);
  assert.throws(() => checkHygiene(repository), /Unregistered permanent artifact/);
  write('package.json', JSON.stringify({ repositoryHygiene: { artifacts: [item] } }));
  assert.doesNotThrow(() => checkHygiene(repository));
  run(['add', '.']);
  assert.doesNotThrow(() => checkHygiene(repository));
  write(item.path, 'modified\n');
  assert.throws(() => checkHygiene(repository), /mismatched working artifact/);
  write(item.path, content);
  write('package.json', JSON.stringify({ repositoryHygiene: { artifacts: [{ ...item, purpose: '' }] } }));
  assert.throws(() => checkHygiene(repository), /purpose and source/);
  write('package.json', JSON.stringify({ repositoryHygiene: { artifacts: [item, item] } }));
  assert.throws(() => checkHygiene(repository), /unique path/);
  write('package.json', JSON.stringify({ repositoryHygiene: { artifacts: [item] } }));
  write(item.path, 'staged corruption\n');
  run(['add', item.path]);
  write(item.path, content);
  assert.throws(() => checkHygiene(repository), /mismatched index artifact/);
});
test('registered ZIPs, supported legacy empty Codex setting and useful comments pass', () => {
  const { repository, run, write } = fixture();
  const content = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)]);
  const item = { path: 'docs/artifacts/reference-input.zip', purpose: 'Durable reference input', source: 'Owner supplied fixture', sha256: createHash('sha256').update(content).digest('hex') };
  write(item.path, content);
  write('package.json', JSON.stringify({ repositoryHygiene: { artifacts: [item] } }));
  write('.codex/config.toml', 'commit_attribution = ""\n[mcp_servers.fixture]\ncommand = "node"\n');
  write('scripts/example.mjs', '/** @returns {boolean} Whether the caller holds the lock. */\nexport const valid = true;\n// Preserve the lock across awaits to avoid a race.\n');
  run(['add', '.']);
  assert.doesNotThrow(() => checkHygiene(repository));
  write('.claude/settings.json', '{"attribution":false}\n');
  run(['add', '.claude/settings.json']);
  assert.doesNotThrow(() => checkHygiene(repository));
});
test('invalid UTF-8, NUL content and malformed JavaScript fail transparently', () => {
  const { repository, write } = fixture();
  for (const content of [Buffer.from([0xff]), Buffer.from('export const a = "\0";'), 'export const = ;\n']) {
    write('scripts/example.mjs', content);
    assert.throws(() => checkHygiene(repository));
  }
});
test('branch rules accept declared conventions and isolate the authenticated automation exception', () => {
  for (const branch of ['feat/12-add-guard', 'fix/1-index', 'docs/2-guide', 'chore/3-tools', 'codex/hygiene', 'claude/hygiene']) assert.doesNotThrow(() => checkBranch(branch));
  assert.doesNotThrow(() => checkBranch('main', { allowMain: true }));
  for (const branch of ['', 'main', 'Codex/hygiene', 'codex/Bad_Name', 'feat/no-issue', 'dependabot/github_actions/actions/checkout-7.0.1']) assert.throws(() => checkBranch(branch));
  assert.doesNotThrow(() => checkBranch('dependabot/github_actions/actions/checkout-7.0.1', { automation: true }));
});
test('commit messages retain human trailers, reverts, merges and technical discussion', () => {
  for (const message of ['fix: validate staged content\n\nCo-Authored-By: Example Contributor <person@example.invalid>\nSigned-off-by: Person <person@example.invalid>',
    'docs: explain Claude Code attribution settings', 'ci(checks): validate metadata', 'feat!: change contract',
    `Revert "chore: add a guard"\n\nThis reverts commit ${'a'.repeat(40)}.`]) assert.doesNotThrow(() => checkMessage(message));
  assert.doesNotThrow(() => checkMessage("Merge branch 'main' into codex/hygiene", { merge: true }));
  assert.doesNotThrow(() => checkMessage('Bump actions/checkout from 6 to 7', { automation: true }));
  for (const message of ['update stuff', 'chore: good\n\nCo-authored-by: Codex <noreply@openai.com>',
    'chore: good [skip ci]', 'chore: good [CI SKIP]', 'chore: good\n\nskip-checks: true',
    'chore: good\n\nMaintainer: Claude Code', 'chore: good\n\nCo-Authored-By:\n Codex <noreply@openai.com>',
    'chore: hidden\u200btext', 'chore: Generated with Codex CLI', 'Bump actions/checkout from 6 to 7',
    "Merge branch 'main' into codex/hygiene"]) assert.throws(() => checkMessage(message));
});

function pullRequest(base = 'a'.repeat(40), head = 'b'.repeat(40)) {
  const repo = { id: 1432052547, full_name: 'manhtu0407/NestScout-Enterprise' };
  return { repository: repo, pull_request: { title: 'chore: enforce hygiene', body: 'Closes #12\n\nChecks pass.',
    user: { login: 'example', type: 'User' }, base: { repo, ref: 'main', sha: base },
    head: { repo, ref: 'codex/hygiene', sha: head } } };
}
test('PR metadata rejects signatures, wrong targets, missing Issues and spoofed bot exemptions', () => {
  assert.doesNotThrow(() => checkPullRequest(pullRequest()));
  for (const mutate of [event => { event.repository.id = 1; }, event => { event.pull_request.base.ref = 'other'; },
    event => { event.pull_request.title = 'update'; }, event => { event.pull_request.body = 'Closes #<!-- issue -->'; },
    event => { event.pull_request.body += '\nGenerated with Claude Code'; },
    event => { event.pull_request.head.ref = 'Codex/Bad'; }, event => { event.pull_request.head.sha = 'invalid'; },
    event => { event.pull_request.head.ref = 'dependabot/github_actions/actions/checkout-7.0.1'; }]) {
    const event = pullRequest();
    mutate(event);
    assert.throws(() => checkPullRequest(event));
  }
  const bot = pullRequest();
  bot.pull_request.user = { login: 'dependabot[bot]', type: 'Bot' };
  bot.pull_request.head.ref = 'dependabot/github_actions/actions/checkout-7.0.1';
  bot.pull_request.title = 'Bump actions/checkout from 6 to 7';
  bot.pull_request.body = 'Dependency update';
  assert.doesNotThrow(() => checkPullRequest(bot));
  bot.pull_request.head.repo = { id: 1 };
  assert.throws(() => checkPullRequest(bot));
});
test('all new commits are inspected, including a hidden intermediate signature', () => {
  const { repository, run } = fixture();
  run(['commit', '--quiet', '--allow-empty', '-m', 'chore: invalid intermediate', '-m', 'Co-Authored-By: Codex <noreply@openai.com>']);
  run(['commit', '--quiet', '--allow-empty', '-m', 'chore: clean tip']);
  assert.throws(() => checkCommitRange(repository, 'origin/main', 'HEAD'), /Unapproved AI attribution/);
  assert.throws(() => checkMetadata(repository, {}), /Unapproved AI attribution/);
});
test('exact historical Dependabot author metadata permits dependency titles without exempting signatures', () => {
  const { repository, run } = fixture();
  const author = 'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>';
  run(['commit', '--quiet', '--allow-empty', '--author', author, '-m', 'Bump actions/checkout from 6 to 7']);
  assert.doesNotThrow(() => checkCommitRange(repository, 'origin/main', 'HEAD'));
  run(['commit', '--quiet', '--allow-empty', '--author', author, '-m', 'Bump actions/checkout from 7 to 8', '-m', 'Generated with Claude Code']);
  assert.throws(() => checkCommitRange(repository, 'origin/main', 'HEAD'), /Unapproved AI attribution/);
});
test('real Git event ranges, metadata edits, wrong revisions and pre-push ref targets are validated', () => {
  const { repository, run, write } = fixture();
  const base = run(['rev-parse', 'HEAD']).trim();
  run(['commit', '--quiet', '--allow-empty', '-m', 'chore: valid candidate']);
  const head = run(['rev-parse', 'HEAD']).trim();
  assert.doesNotThrow(() => checkMetadata(repository, {}));
  const file = path.join(directory, 'event.json');
  const event = pullRequest(base, head);
  writeFileSync(file, JSON.stringify(event));
  const environment = { GITHUB_EVENT_PATH: file, GITHUB_EVENT_NAME: 'pull_request' };
  assert.doesNotThrow(() => checkMetadata(repository, environment));
  event.pull_request.body += '\nCo-Authored-By: Claude <noreply@anthropic.com>';
  writeFileSync(file, JSON.stringify(event));
  assert.throws(() => checkMetadata(repository, environment), /Unapproved AI attribution/);
  writeFileSync(file, JSON.stringify({ repository: event.repository, ref: 'refs/heads/main', before: base, after: head }));
  assert.doesNotThrow(() => checkMetadata(repository, { ...environment, GITHUB_EVENT_NAME: 'push' }));
  writeFileSync(file, JSON.stringify({ repository: event.repository, ref: 'refs/heads/main', before: base, after: 'a'.repeat(40) }));
  assert.throws(() => checkMetadata(repository, { ...environment, GITHUB_EVENT_NAME: 'push' }));
  const ref = 'refs/heads/codex/hygiene-fixture';
  assert.doesNotThrow(() => checkPush(repository, `${ref} ${head} ${ref} ${'0'.repeat(40)}\n`));
  for (const line of [`${ref} ${head} refs/heads/main ${base}`, `${ref} ${base} ${ref} ${base}`,
    `refs/heads/other ${head} refs/heads/other ${base}`, `${ref} ${head} refs/heads/Codex/bad ${base}`]) assert.throws(() => checkPush(repository, line));
  write('scripts/example.mjs', 'export const valid = true;\n');
});
test('actual optional commit-msg hook accepts human metadata and rejects an AI trailer', () => {
  const message = path.join(directory, 'commit-message');
  for (const [text, expected] of [['chore: verify hook\n', 0], ['chore: verify hook\n\nCo-Authored-By: Codex <noreply@openai.com>\n', 1]]) {
    writeFileSync(message, text);
    const result = spawnSync('git', ['-c', 'core.hooksPath=.githooks', 'hook', 'run', 'commit-msg', '--', message], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
  }
});
