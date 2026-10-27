import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, realpathSync, truncateSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { root } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { git, repositoryFiles, blobByteLimit } from './repository-files.mjs';
import { checkPath, checkAttribution, checkHygiene, sourceComments } from './check-hygiene.mjs';
import { inspectArtifact, artifactLimits } from './inspect-artifact.mjs';
import { scanStaged } from './scan-staged.mjs';
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

function pdfFixture({ info = '/Title (Interface contract) /Author (Example Contributor)', extra = [], trailer = '' } = {}) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [] /Count 0 >>', `<< ${info} >>`, ...extra];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(text, 'latin1'));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(text, 'latin1');
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info 3 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(text, 'latin1');
}

function zipFixture(entries, comment = '') {
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), localName = Buffer.from(entry.localName ?? entry.name);
    const bytes = Buffer.from(entry.body ?? ''), method = entry.method ?? 8, flags = entry.flags ?? 0x800;
    const payload = entry.payload ?? (method === 8 ? deflateRawSync(bytes) : bytes);
    const size = entry.size ?? bytes.length, crc = entry.crc ?? crc32(bytes);
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    const extra = entry.extra ?? Buffer.alloc(0);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!(flags & 8)) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(payload.length, 18); local.writeUInt32LE(size, 22); }
    local.writeUInt16LE(localName.length, 26); local.writeUInt16LE(extra.length, 28);
    const descriptor = flags & 8 ? Buffer.alloc(16) : Buffer.alloc(0);
    if (flags & 8) { descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(payload.length, 8); descriptor.writeUInt32LE(size, 12); }
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(((entry.mode ?? 0x8000) << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    localParts.push(local, localName, extra, payload, descriptor); centralParts.push(central, name, extra);
    offset += local.length + localName.length + extra.length + payload.length + descriptor.length;
  }
  const central = Buffer.concat(centralParts), end = Buffer.alloc(22), note = Buffer.from(comment);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(note.length, 20);
  return Buffer.concat([...localParts, central, end, note]);
}

function checkArtifact(file, content) {
  for (const record of inspectArtifact(file, content)) checkAttribution(record.metadata ? record.text : sourceComments(record.file, record.text), record.file);
}

test('existing naming categories and exact required/generated/legal filenames pass', () => {
  for (const file of ['AGENTS.md', 'README.md', 'LICENSE', 'AUTHORS', 'CONTRIBUTORS.md',
    '.github/PULL_REQUEST_TEMPLATE.md', '.github/ISSUE_TEMPLATE/feature.yml', '.github/workflows/ci.yml',
    'scripts/check-tools.mjs', 'scripts/check-hygiene.test.mjs', 'scripts/supabase-mcp.integration.test.mjs',
    'scripts/tools.json', 'docs/claude.architecture.md', 'docs/agents.design.md', 'docs/setup-evidence.md',
    'supabase/database.types.ts', 'supabase/config.toml', 'supabase/supabase.lock',
    'supabase/migrations/20261025090000_add_example.sql', 'supabase/tests/database/security.test.sql',
    'module/README.md', '.cursor/mcp.json', '.agents/skills/example/SKILL.md', '.claude/skills/example/SKILL.md',
    '.agents/skills/example/references/adoption-review.md', '.claude/skills/example/references/adoption-review.md']) {
    assert.doesNotThrow(() => checkPath(file), file);
  }
});
test('unknown architecture, case variants, scratch names, archives and unsafe paths fail', () => {
  for (const file of ['Scripts/tool.mjs', 'scripts/CheckTools.mjs', 'scripts/check_tools.mjs', 'docs/New Guide.md',
    '.github/workflows/CI.yml', 'supabase/migrations/001_example.sql', 'scripts/example.js', 'src/App.tsx',
    'docs/REPORT.md', 'docs/plan-feature.md', 'docs/notes.md', 'report.zip', 'docs/design.PDF',
    'scripts/../example.mjs', '/scripts/example.mjs', 'scripts\\example.mjs', 'docs/bad\nname.md',
    'node_modules/example/index.js', 'dist/index.mjs', '.claude/settings.local.json', '.cursor/rules/competing.mdc', '.cursor/MCP.json']) {
    assert.throws(() => checkPath(file), undefined, file);
  }
  for (const root of ['.agents', '.claude']) {
    for (const resource of ['references/Guide.md', 'references/guide.txt', 'references/nested/guide.md',
      'references/.env', 'references/AGENTS.md', 'references/CLAUDE.md', 'references/report.md',
      'references/../guide.md', 'scripts/run.mjs', 'scripts/run.test.mjs', 'assets/template.md', 'assets/tool.exe']) {
      assert.throws(() => checkPath(`${root}/skills/example/${resource}`), undefined, resource);
    }
  }
});
test('approved Expo application, Kael boundary and empty process paths pass', () => {
  for (const file of ['apps/mobile/package.json', 'apps/mobile/app.json', 'apps/mobile/tsconfig.json',
    'apps/mobile/eslint.config.mjs', 'apps/mobile/.env.example',
    'apps/mobile/src/app/_layout.tsx', 'apps/mobile/src/app/index.tsx', 'apps/mobile/src/app/(guest)/explore.tsx',
    'apps/mobile/src/app/(auth)/phone.tsx', 'apps/mobile/src/lib/config.ts', 'apps/mobile/src/lib/config.test.ts',
    'apps/mobile/src/theme/palette.ts', 'apps/mobile/src/features/access/index.ts',
    'apps/mobile/src/features/access/state/access-provider.tsx', 'apps/mobile/src/features/access/state/access-provider.test.tsx',
    'apps/mobile/src/testing/navigation.test.tsx', 'services/kael-core/README.md', 'docs/processes/.gitkeep']) {
    assert.doesNotThrow(() => checkPath(file), file);
  }
});
test('unapproved application, native, service and process paths still fail', () => {
  for (const file of ['apps/mobile/src/app/navigation.test.tsx', 'apps/mobile/src/app/helper.ts', 'apps/mobile/src/app/Explore.tsx',
    'apps/mobile/src/app/(guest)/Explore.tsx', 'apps/mobile/src/App.tsx', 'apps/mobile/src/features/Access/index.ts',
    'apps/mobile/src/features/access/Foo.tsx', 'apps/mobile/src/features/access/report.ts', 'apps/mobile/src/features/(group)/x.ts',
    'apps/mobile/src/(guest)/_layout.tsx', 'apps/mobile/src/lib/script.js', 'apps/mobile/src/lib/types.d.ts',
    'apps/mobile/assets/icon.png', 'apps/mobile/babel.config.js', 'apps/mobile/metro.config.js', 'apps/mobile/package-lock.json',
    'apps/mobile/.env', 'apps/mobile/.env.local', 'apps/mobile/ios/Podfile', 'apps/mobile/android/build.gradle',
    'apps/api/index.ts', 'packages/shared/index.ts', 'services/kael-core/server.ts', 'services/kael-core/package.json',
    'services/kael-core/agent.mjs', 'process.bpmn', 'docs/order.bpmn']) {
    assert.throws(() => checkPath(file), /No approved naming convention|Disposable document\/source name/, file);
  }
  for (const file of ['docs/processes/order.bpmn', 'docs/processes/README.md', 'docs/processes/flow.md',
    'docs/processes/booking/.gitkeep', 'docs/processes/.gitkeep.md']) {
    assert.throws(() => checkPath(file), /docs\/processes must contain only an empty \.gitkeep/, file);
  }
});
test('the process folder marker must be empty in working files and staged blobs', () => {
  const { repository, write, run } = fixture();
  write('docs/processes/.gitkeep', '');
  assert.doesNotThrow(() => checkHygiene(repository));
  run(['add', '--', 'docs/processes/.gitkeep']);
  assert.doesNotThrow(() => checkHygiene(repository));
  write('docs/processes/.gitkeep', '\n');
  assert.throws(() => checkHygiene(repository), /exactly 0 bytes: working/);
  run(['add', '--', 'docs/processes/.gitkeep']);
  write('docs/processes/.gitkeep', '');
  assert.throws(() => checkHygiene(repository), /exactly 0 bytes: index/);
  run(['rm', '--cached', '--force', '--', 'docs/processes/.gitkeep']);
  write('docs/processes/order.bpmn', '<definitions/>\n');
  assert.throws(() => checkHygiene(repository), /docs\/processes must contain only/);
});
test('application source comments receive the same attribution checks', () => {
  const { repository, write } = fixture();
  write('apps/mobile/src/lib/example.ts', 'export const text = "Generated with Claude Code";\n// Keep the key public-only.\n');
  assert.doesNotThrow(() => checkHygiene(repository));
  write('apps/mobile/src/lib/example.ts', '// Generated with Claude Code\nexport const value = 1;\n');
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
});

test('only the owner-approved logo path accepts the byte-preserved source image', () => {
  const { repository, write, run } = fixture();
  const file = 'docs/assets/nestscout-horizon-logo-light.png';
  write(file, readFileSync(path.join(root, file)));
  assert.doesNotThrow(() => checkHygiene(repository));
  run(['add', '--', file]);
  assert.doesNotThrow(() => checkHygiene(repository));
  for (const name of ['docs/assets/other.png', 'docs/assets/NestScout-horizon-logo-light.png',
    'docs/assets/nestscout-horizon-logo-light.jpg', 'docs/assets/nestscout-horizon-logo-light.png.exe']) {
    assert.throws(() => checkPath(name), /No approved naming convention/);
  }
});

test('logo tampering is rejected in working files and staged blobs even after deletion', () => {
  const { repository, write, run } = fixture();
  const file = 'docs/assets/nestscout-horizon-logo-light.png';
  const valid = readFileSync(path.join(root, file));
  write(file, valid);
  run(['add', '--', file]);
  const changed = Buffer.from(valid);
  changed[changed.length - 1] ^= 1;
  write(file, changed);
  assert.throws(() => checkHygiene(repository), /logo checksum mismatch: working/);
  run(['add', '--', file]);
  write(file, valid);
  assert.throws(() => checkHygiene(repository), /logo checksum mismatch: index/);
  rmSync(path.join(repository, file));
  assert.throws(() => checkHygiene(repository), /logo checksum mismatch: index/);
  run(['rm', '--cached', '--', file]);
  assert.doesNotThrow(() => checkHygiene(repository));
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
  const content = pdfFixture();
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
test('TypeScript AST comments cover inline, type-only, multiline, declaration and JSX contexts', () => {
  for (const file of ['input.ts', 'input.mts', 'input.cts', 'input.d.ts', 'input.d.mts', 'input.d.cts', 'input.tsx']) {
    for (const text of ['type Value = string; // Generated with Codex\n',
      'type Value = { x: string /* Generated with Claude Code */ };\n',
      'type Value = {\n /*\n * Maintainer: Codex\n */\n x: string;\n};\n',
      'declare function f(value: /* Written by Codex */ string): void;\n']) {
      assert.throws(() => checkAttribution(sourceComments(file, text), file), /Unapproved AI attribution/, `${file}: ${text}`);
    }
    const valid = 'type Value = "Generated with Codex";\n' +
      'declare const value: { field: string /* Retain the old field for wire compatibility. */ };\n' +
      '/** @returns A lock token; release it after the asynchronous callback settles. */\n' +
      'declare function acquire(): string;\n';
    assert.doesNotThrow(() => checkAttribution(sourceComments(file, valid), file));
  }
  for (const text of ['const x: string = `literal // Generated with Codex`;\n',
    'const x = /[/*]Generated with Codex/;\n', 'const x = `prefix ${1 /* Keep ordering across retries. */} // Generated with Codex`;\n',
    'const view = <span>// Generated with Codex</span>;\n']) {
    assert.doesNotThrow(() => checkAttribution(sourceComments('input.tsx', text), 'fixture'));
  }
  assert.throws(() => sourceComments('input.ts', 'type Value = { broken: ; };'), /Invalid TypeScript/);
});
test('TypeScript staged comments cannot hide behind clean working files or renames', () => {
  const { repository, run, write } = fixture();
  write('supabase/database.types.ts', 'export type Value = string; // Generated with Codex\n');
  run(['add', '.']);
  write('supabase/database.types.ts', 'export type Value = string; // Preserve the wire contract.\n');
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  run(['add', '.']);
  assert.doesNotThrow(() => checkHygiene(repository));
  write('supabase/database.types.ts', 'export type Value = { x: string /* Generated with Codex */ };\n');
  assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
});
test('PDF metadata accepts factual authors, escaped strings, Unicode and indirect text without rewriting bytes', () => {
  const unicode = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('Hợp đồng', 'utf16le').swap16()]).toString('hex');
  for (const content of [pdfFixture(), pdfFixture({ info: `/Title <${unicode}> /Author (Claude Shannon)` }),
    pdfFixture({ info: '/Title 4 0 R /Author (Example \\(Contributor\\)) /Creator (Codex) /Producer (Claude Code)', extra: ['(Interface contract)'] }),
    pdfFixture({ extra: [`<< /Length ${Buffer.byteLength('/Author (Codex) in text')} >>\nstream\n/Author (Codex) in text\nendstream`] })]) {
    const original = Buffer.from(content);
    assert.doesNotThrow(() => checkArtifact('input.pdf', content));
    assert.deepEqual(content, original);
  }
});
test('PDF Title/Author signatures cannot hide in escapes, hex, references, alternate case or author lists', () => {
  const unicode = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('Codex', 'utf16le').swap16()]).toString('hex');
  for (const options of [{ info: '/Title (Generated with Codex)' }, { info: '/Author (Claude Code)' },
    { info: '/A#75thor (Co\\144ex)' }, { info: `/Author <${unicode}>` },
    { info: '/Title 4 0 R', extra: ['(Generated with Claude Code)'] },
    { info: '/author (Example Contributor; Codex)' }, { info: '/Author (Claude   Code)' }]) {
    assert.throws(() => checkArtifact('input.pdf', pdfFixture(options)), /Unapproved AI attribution/);
  }
});
test('PDF unsupported metadata features and malformed structures fail closed', () => {
  for (const content of [Buffer.from('%PDF-1.7\nfixture\n'), pdfFixture({ trailer: '/Encrypt 4 0 R' }),
    pdfFixture({ extra: ['<< /Type /Metadata /Subtype /XML /Length 0 >>\nstream\n\nendstream'] }),
    pdfFixture({ extra: ['<< /Type /ObjStm >>'] }), pdfFixture({ info: '/Author 4 0 R', extra: ['4 0 R'] }),
    pdfFixture({ info: '/Author (A) /Author (B)' }), pdfFixture({ info: '/Author <81>' }),
    pdfFixture({ trailer: '/Prev 0' }), pdfFixture({ extra: ['<< /Length 4 0 R >>\nstream\ntext\nendstream'] })]) {
    assert.throws(() => checkArtifact('input.pdf', content), /Artifact inspection blocked/);
  }
  const broken = pdfFixture().toString('latin1').replace(/(xref\n0 4\n0000000000 65535 f \n)\d{10}/, (_, prefix) => `${prefix}0000000001`);
  assert.throws(() => checkArtifact('input.pdf', Buffer.from(broken, 'latin1')), /Artifact inspection blocked/);
});
test('ZIP stored/deflated/data-descriptor entries inspect comments and contents while preserving legitimate strings', () => {
  for (const entry of [{ name: 'reference.md', body: '# Reference\n\nPreserve the wire contract.\n', method: 0 },
    { name: 'module/input.ts', body: 'export type Value = "Generated with Codex"; /* Keep wire compatibility. */\n' },
    { name: 'input.mjs', body: 'const fixture = "Generated with Codex";\n', flags: 0x808 },
    { name: 'contract.pdf', body: pdfFixture() }]) {
    const content = zipFixture([entry]);
    const original = Buffer.from(content);
    assert.doesNotThrow(() => checkArtifact('input.zip', content));
    assert.deepEqual(content, original);
  }
  assert.doesNotThrow(() => checkArtifact('input.zip', zipFixture([{ name: 'module/', mode: 0x4000 }, { name: 'module/input.txt', body: 'Reference\n', extra: Buffer.from([0x55, 0x54, 5, 0, 1, 0, 0, 0, 0]) }])));
  assert.doesNotThrow(() => checkArtifact('input.zip', zipFixture([{ name: 'LICENSE', body: 'Copyright 2026 Example Corporation.\n' },
    { name: 'coverage.test.mjs', body: 'export const value = true;\n' }, { name: 'src/coverage/index.ts', body: 'export type Value = string;\n' }])));
  for (const content of [zipFixture([{ name: 'reference.md', body: 'Generated with Codex\n' }]),
    zipFixture([{ name: 'input.ts', body: 'export type Value = string; // Generated with Codex\n' }]),
    zipFixture([{ name: 'contract.pdf', body: pdfFixture({ info: '/Author (Codex)' }) }]),
    zipFixture([], 'Generated with Claude Code')]) assert.throws(() => checkArtifact('input.zip', content), /Unapproved AI attribution/);
});
test('ZIP traversal, aliases, local header mismatches, symlinks, encryption, CRC and expansion failures reject', () => {
  for (const name of ['../outside.txt', '/outside.txt', 'C:/outside.txt', 'a\\b.txt', 'a/../b.txt', '.git/config.txt',
    'a/NUL.txt', 'a./b.txt', 'a//b.txt', 'a\0b.txt']) assert.throws(() => checkArtifact('input.zip', zipFixture([{ name }])));
  for (const entries of [[{ name: 'A.txt' }, { name: 'a.txt' }], [{ name: 'a.txt' }, { name: 'a.txt/b.txt' }],
    [{ name: 'a.txt/b.txt' }, { name: 'a.txt' }], [{ name: 'a.txt', localName: '../b.txt' }],
    [{ name: 'a.txt', mode: 0xa000 }], [{ name: 'a.txt', mode: 0x4000 }], [{ name: 'a.txt', flags: 0x801 }], [{ name: 'a.txt', method: 99 }],
    [{ name: 'a.txt', body: 'x', crc: 0 }], [{ name: 'a.txt', body: 'x', size: 2 }],
    [{ name: 'a.txt', size: artifactLimits.entryBytes + 1 }], [{ name: 'a.zip', body: zipFixture([]) }],
    [{ name: 'image.png', body: Buffer.from([137, 80, 78, 71]) }], [{ name: 'a.txt', body: Buffer.from([255]) }],
    [{ name: 'a.txt', extra: Buffer.from([0x75, 0x70, 0, 0]) }],
    [{ name: 'a.txt', body: 'x', payload: Buffer.concat([deflateRawSync(Buffer.from('x')), Buffer.from('hidden')]) }]]) {
    assert.throws(() => checkArtifact('input.zip', zipFixture(entries)), /Artifact inspection blocked/);
  }
  assert.throws(() => checkArtifact('input.zip', zipFixture([{ name: 'misleading.txt', body: pdfFixture({ info: '/Author (Codex)' }) }])), /misleading extension/);
  assert.throws(() => inspectArtifact('input.zip', zipFixture(new Array(artifactLimits.entries + 1).fill({ name: 'a.txt' }))), /Artifact inspection blocked/);
  const expansion = zipFixture(Array.from({ length: 5 }, (_, index) => ({ name: `${index}.txt`, body: Buffer.alloc(artifactLimits.entryBytes, 65) })));
  assert.throws(() => inspectArtifact('input.zip', expansion), /expansion limit/);
});
test('PDF/ZIP staged metadata and contents are validated independently of restored working artifacts', () => {
  for (const [file, good, bad] of [['docs/artifacts/input.pdf', pdfFixture(), pdfFixture({ info: '/Author (Codex)' })],
    ['docs/artifacts/input.zip', zipFixture([{ name: 'input.txt', body: 'Technical reference\n' }]), zipFixture([{ name: 'input.txt', body: 'Generated with Codex\n' }])]]) {
    const { repository, run, write } = fixture();
    const manifest = bytes => JSON.stringify({ repositoryHygiene: { artifacts: [{ path: file, purpose: 'Durable reference input', source: 'Owner fixture', sha256: createHash('sha256').update(bytes).digest('hex') }] } });
    write(file, bad); write('package.json', manifest(bad)); run(['add', '.']);
    write(file, good); write('package.json', manifest(good));
    assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
    run(['add', '.']); assert.doesNotThrow(() => checkHygiene(repository));
    write(file, bad); write('package.json', manifest(bad));
    assert.throws(() => checkHygiene(repository), /Unapproved AI attribution/);
  }
});
test('PDF/ZIP signatures cannot be renamed into ordinary repository documentation', () => {
  const { repository, write } = fixture();
  write('docs/contract.md', pdfFixture());
  assert.throws(() => checkHygiene(repository), /requires its registered artifact extension/);
  write('docs/contract.md', zipFixture([]));
  assert.throws(() => checkHygiene(repository), /requires its registered artifact extension/);
});
test('Git batch reads preserve duplicate/binary blobs and reject oversized staged and working files', () => {
  const { repository, run, write } = fixture();
  const content = Buffer.from([10, 0, 255, 13, 10]);
  write('scripts/first.json', content); write('scripts/second.json', content); run(['add', '.']);
  for (const file of ['scripts/first.json', 'scripts/second.json']) {
    const record = repositoryFiles(repository).find(item => item.file === file && item.state === 'index');
    assert.deepEqual(record.content, content);
  }
  truncateSync(path.join(repository, 'scripts/first.json'), blobByteLimit + 1);
  assert.throws(() => repositoryFiles(repository), /exceeds 32 MiB/);
  run(['add', 'scripts/first.json']); write('scripts/first.json', content);
  assert.throws(() => repositoryFiles(repository), /exceeds 32 MiB/);
});
test('the staged secret scanner rejects compressed ZIP contents with a clean working archive and redacted output', () => {
  const { repository, run, write } = fixture();
  const token = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('');
  assert.match(token, /^ghp_[A-Za-z0-9]{36}$/);
  const file = 'docs/artifacts/input.zip';
  write(file, zipFixture([{ name: 'reference.txt', body: `token=${token}\n` }]));
  run(['add', '.']);
  write(file, zipFixture([{ name: 'reference.txt', body: 'Technical reference\n' }]));
  assert.throws(() => scanStaged(repository, 'pipe'), error => error.status === 1 && !(String(error.stdout) + String(error.stderr)).includes(token));
});
test('Git batch inspection rejects aggregate index and working snapshots above 128 MiB', () => {
  const { repository, run, write } = fixture();
  for (let index = 0; index < 5; index++) {
    const file = `scripts/large-${index}.json`;
    write(file, Buffer.from([index]));
    truncateSync(path.join(repository, file), 28 * 1024 * 1024);
  }
  assert.throws(() => repositoryFiles(repository), /working snapshot exceeds 128 MiB/);
  run(['add', '.']);
  for (let index = 0; index < 5; index++) write(`scripts/large-${index}.json`, '{}\n');
  assert.throws(() => repositoryFiles(repository), /index snapshot exceeds 128 MiB/);
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
    const result = spawnSync('git', ['-c', 'core.hooksPath=.githooks', 'hook', 'run', 'commit-msg', '--', message], { cwd: root, env: gitEnvironment(), encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
  }
});
