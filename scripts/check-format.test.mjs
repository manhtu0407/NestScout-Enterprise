import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { git } from './repository-files.mjs';
import { checkFormat, checkStagedFormat, formatViolations } from './check-format.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-format-'));
after(() => {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  rmSync(directory, { recursive: true });
});

function fixture() {
  const repository = mkdtempSync(path.join(directory, 'repository-'));
  const run = args => git(repository, args);
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), content);
  };
  run(['init', '--quiet', '--initial-branch=main']);
  write('.gitignore', '.cache/\n');
  write('scripts/example.mjs', 'export const valid = true;\n');
  run(['add', '.']);
  return { repository, run, write };
}

const violations = text => formatViolations(Buffer.from(text));

test('the editorconfig contract accepts clean text and rejects each violation with its line', () => {
  assert.deepEqual(violations('export const a = 1;\n  indented();\n\n'), []);
  assert.deepEqual(violations('a\nb'), ['2: missing final newline']);
  assert.deepEqual(violations('a \nb\n'), ['1: trailing whitespace']);
  assert.deepEqual(violations('a\n\t\nb\n'), ['2: trailing whitespace', '2: tab indentation']);
  assert.deepEqual(violations('a\n  \tb\n'), ['2: tab indentation']);
  assert.deepEqual(violations('a\r\nb\r\n'), ['1: carriage return instead of LF', '2: carriage return instead of LF']);
  assert.deepEqual(violations('a\rb\n'), ['1: carriage return instead of LF']);
  assert.deepEqual(violations('﻿a\n'), ['1: byte order mark']);
  assert.deepEqual(formatViolations(Buffer.from([0xff, 0x0a])), ['1: invalid UTF-8']);
  assert.deepEqual(formatViolations(Buffer.from([0x61, 0x00, 0xff])), []);
});

test('staged violations cannot hide behind a clean working file, and working violations are found unstaged', () => {
  const { repository, run, write } = fixture();
  assert.doesNotThrow(() => checkFormat(repository));
  write('scripts/example.mjs', 'export const valid = true; \n');
  assert.throws(() => checkFormat(repository), /working scripts\/example\.mjs:1: trailing whitespace/);
  run(['add', '--', 'scripts/example.mjs']);
  write('scripts/example.mjs', 'export const valid = true;\n');
  assert.throws(() => checkFormat(repository), /index scripts\/example\.mjs:1: trailing whitespace/);
  rmSync(path.join(repository, 'scripts/example.mjs'));
  assert.throws(() => checkFormat(repository), /index scripts\/example\.mjs:1: trailing whitespace/);
  run(['rm', '--cached', '--quiet', '--', 'scripts/example.mjs']);
  assert.doesNotThrow(() => checkFormat(repository));
  write('docs/untracked.md', '# Title\r\n');
  assert.throws(() => checkFormat(repository), /working docs\/untracked\.md:1: carriage return/);
});

test('binary extensions, empty placeholders and the generated database types are exempt; other text is not', () => {
  const { repository, run, write } = fixture();
  write('docs/assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x20]));
  write('docs/artifacts/input.pdf', Buffer.from('%PDF-1.4 \r\n'));
  write('supabase/migrations/.gitkeep', '');
  write('supabase/database.types.ts', 'export type Json = string; \r\n');
  run(['add', '.']);
  assert.doesNotThrow(() => checkFormat(repository));
  write('supabase/other.ts', 'export type Json = string; \n');
  assert.throws(() => checkFormat(repository), /working supabase\/other\.ts:1/);
});

test('failures are capped and name the state, file and line', () => {
  const { repository, write } = fixture();
  for (let index = 0; index < 12; index++) write(`scripts/bad-${index}.mjs`, 'const a = 1; \n');
  assert.throws(() => checkFormat(repository), error => {
    assert.match(error.message, /^\.editorconfig violations \(12\):/);
    assert.equal(error.message.split('\n').length, 11);
    assert.match(error.message, /working scripts\/bad-\d+\.mjs:1: trailing whitespace/);
    return true;
  });
});

test('the staged gate judges only changed staged blobs, never unrelated working-tree or untracked edits', () => {
  const { repository, run, write } = fixture();
  run(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'chore: establish fixture']);
  assert.doesNotThrow(() => checkStagedFormat(repository));
  write('scripts/example.mjs', 'export const valid = true; \n');
  write('docs/untracked.md', '# Title\r\n');
  assert.doesNotThrow(() => checkStagedFormat(repository));
  assert.throws(() => checkFormat(repository), /working scripts\/example\.mjs:1: trailing whitespace/);
  write('scripts/staged.mjs', 'export const staged = true; \n');
  run(['add', '--', 'scripts/staged.mjs']);
  write('scripts/staged.mjs', 'export const staged = true;\n');
  assert.throws(() => checkStagedFormat(repository), /^Error: \.editorconfig violations \(1\):\n {2}index scripts\/staged\.mjs:1: trailing whitespace$/m);
});

test('the staged gate leaves unchanged and deleted index entries alone and rejects a changed one that is bad', () => {
  const { repository, run, write } = fixture();
  write('docs/legacy.md', 'legacy \n');
  run(['add', '.']);
  run(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'chore: establish fixture']);
  assert.doesNotThrow(() => checkStagedFormat(repository));
  write('docs/other.md', '# Other\n');
  run(['add', '--', 'docs/other.md']);
  assert.doesNotThrow(() => checkStagedFormat(repository));
  run(['rm', '--quiet', '--', 'docs/legacy.md']);
  assert.doesNotThrow(() => checkStagedFormat(repository));
  write('docs/crlf.md', '# Title\r\n');
  run(['add', '--', 'docs/crlf.md']);
  assert.throws(() => checkStagedFormat(repository), /index docs\/crlf\.md:1: carriage return/);
});

test('before the first commit every staged file is changed', () => {
  const { repository, write } = fixture();
  assert.doesNotThrow(() => checkStagedFormat(repository));
  write('scripts/bad.mjs', 'const a = 1; \n');
  git(repository, ['add', '--', 'scripts/bad.mjs']);
  assert.throws(() => checkStagedFormat(repository), /index scripts\/bad\.mjs:1: trailing whitespace/);
});
