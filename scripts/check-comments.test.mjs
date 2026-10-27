import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { parseDocument } from 'yaml';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { commentRecords, sourceComments, hasCommentGrammar } from './check-hygiene.mjs';
import {
  addedComments, approvedExceptions, commentCategory, commentViolations, isMandatoryComment, normalizeComment,
  checkCommentRevision, checkStagedComments, checkWorkingComments, checkComments, trustedBaseline, trustedExceptions,
} from './check-comments.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-comments-'));
after(() => {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  rmSync(directory, { recursive: true });
});

function repositoryFixture(files = {}, { commit = true } = {}) {
  const repository = mkdtempSync(path.join(directory, 'repository-'));
  const run = args => git(repository, args);
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), text);
  };
  run(['init', '--quiet', '--initial-branch=main']);
  run(['config', 'user.name', 'Fixture']);
  run(['config', 'user.email', 'fixture@example.invalid']);
  write('.gitignore', '.cache/\nnode_modules/\n');
  write('package.json', '{}\n');
  for (const [file, text] of Object.entries(files)) write(file, text);
  if (commit) {
    run(['add', '.']);
    run(['commit', '--quiet', '-m', 'chore: establish fixture']);
    run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    run(['switch', '--quiet', '-c', 'claude/comment-fixture']);
  }
  return { repository, run, write };
}

const texts = (file, source) => commentRecords(file, source).map(record => record.text);
const sha = 'a'.repeat(40);
const exception = (file, text) => ({ file, text, reason: 'Required by a reviewed tool contract.' });
const revisionPattern = (file, line, rest = '') => new RegExp(`revision [0-9a-f]{12} ${file.replace(/\./g, '\\.')}:${line}${rest}`);
const range = ['refs/remotes/origin/main', 'HEAD'];
const manifest = (...entries) => JSON.stringify({ repositoryHygiene: { commentExceptions: entries } }) + '\n';

test('strings, URLs, templates, regular expressions and JSX text are not comments in JavaScript or TypeScript', () => {
  const cases = [
    ['input.mjs', 'const a = "// x"; const b = \'/* y */\'; const c = `// ${1} /* z */`; const d = /\\/\\/ not/; const e = "https://example.invalid/a//b";\n', []],
    ['input.mjs', 'const a = 1; // real\nconst b = a / 2; /* also real */\n', ['// real', '/* also real */']],
    ['input.cjs', 'module.exports = 1; // real\n', ['// real']],
    ['input.mjs', '#!/usr/bin/env node\nexport {};\n', ['#!/usr/bin/env node']],
    ['input.ts', 'const view: string = `// ${1 /* inside substitution */} // text`;\n', ['/* inside substitution */']],
    ['input.tsx', 'const view = <a href="//x">// not<b>/* nor */</b></a>; // real\n', ['// real']],
    ['input.d.ts', 'declare const x: string; /** doc */\n', ['/** doc */']],
    ['input.mts', 'type Value = "//" | /* union */ "/*";\n', ['/* union */']],
  ];
  for (const [file, source, expected] of cases) {
    assert.deepEqual(texts(file, source), expected, `${file}: ${source}`);
    for (const record of commentRecords(file, source)) assert.equal(source.slice(record.start, record.start + record.text.length), record.text);
  }
  assert.throws(() => commentRecords('input.mjs', 'export const = ;\n'), /Invalid JavaScript/);
  assert.throws(() => commentRecords('input.ts', 'type Value = { broken: ; };'), /Invalid TypeScript/);
});

test('SQL comments are found around quoted text, nested blocks, escape strings and dollar quotes', () => {
  const cases = [
    ["SELECT '-- not', \"a--b\", 'it''s /* not */';\n", []],
    ['SELECT 1; -- real\n/* a /* nested */ still */ SELECT 2;\n', ['-- real', '/* a /* nested */ still */']],
    ["SELECT E'it\\'s -- not' -- real\n", ['-- real']],
    ['SELECT $1, $a$ -- body comment\n$a$; $$ plain $$ -- after\n', ['-- body comment', '-- after']],
    ['SELECT foo$bar$ -- real\n', ['-- real']],
    ["SELECT 'unterminated -- text\n", []],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(texts('query.sql', source), expected, source);
    for (const record of commentRecords('query.sql', source)) assert.equal(source.slice(record.start, record.start + record.text.length), record.text);
  }
});

test('YAML comments exclude block scalars, quoted text and URL fragments', () => {
  const cases = [
    ['a: "x # y"\nb: \'p # q\'\nc: https://example.invalid/#fragment\nd: |\n  literal # kept\n', []],
    ['# top\na: 1 # trailing\nlist: [1, # in flow\n  2]\n---\n# second\nb: 2\n', ['# top', '# trailing', '# in flow', '# second']],
    [`steps:\n  - uses: a/b@${sha} # v1\n    with: { k: v } # tail\n`, ['# v1', '# tail']],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(texts('input.yml', source), expected, source);
    for (const record of commentRecords('input.yaml', source)) assert.equal(source.slice(record.start, record.start + record.text.length), record.text);
  }
});

test('comments inside workflow run scripts are found; other block scalars and shell parameters are not comments', () => {
  const source = 'jobs:\n  a:\n    steps:\n      - run: |\n          echo "# quoted" $# ${#1}\n          npm ci # trailing\n          # whole line\n'
    + '      - run: | # header note\n          true\n      - name: x\n        description: |\n          # not a run script\n';
  assert.deepEqual(texts('.github/workflows/w.yml', source), ['# trailing', '# whole line', '# header note']);
  for (const record of commentRecords('w.yml', source)) assert.equal(source.slice(record.start, record.start + record.text.length), record.text);
  assert.deepEqual(texts('w.yml', 'steps:\n  - run: npm ci # plain scalar\n'), ['# plain scalar']);
  assert.deepEqual(texts('w.yml', 'a: 1\n---\nsteps:\n  - run: |\n      # second document\n      true\n'), ['# second document']);
});

test('TOML, JSONC and shell comments exclude strings, parameters and word-internal hash signs', () => {
  assert.deepEqual(texts('input.toml', 'a = "x # y"\nb = \'p # q\'\nc = """m # n\nline # o"""\nd = \'\'\'z # w\'\'\'\nu = "https://example.invalid/#f"\n'), []);
  assert.deepEqual(texts('input.toml', '# top\n[table] # after\nk = 1 # trailing\ns = "a\\"# not" # real\n'), ['# top', '# after', '# trailing', '# real']);
  assert.deepEqual(texts('input.jsonc', '{ "a": "// x", /* real */ "b": 1 // tail\n}\n'), ['/* real */', '// tail']);
  assert.deepEqual(texts('.githooks/example', '#!/bin/sh\nset -eu\necho "# x" \'# y\' $# ${#1} a#b\nrun # real\n'), ['#!/bin/sh', '# real']);
});

test('only files with a comment grammar are inspected; JSON keeps its line-leading fallback', () => {
  for (const file of ['README.md', 'package.json', 'docs/guide.md', 'scripts/tools.json']) {
    assert.equal(commentRecords(file, '// text\n'), null, file);
    assert.equal(hasCommentGrammar(file), false, file);
  }
  for (const file of ['a.mjs', 'a.cjs', 'a.ts', 'a.d.ts', 'a.tsx', 'a.sql', 'a.toml', 'a.yml', 'a.yaml', 'a.jsonc', '.githooks/pre-push']) {
    assert.equal(hasCommentGrammar(file), true, file);
  }
  assert.equal(sourceComments('package.json', '{\n// x\n}\n'), '// x');
  assert.equal(sourceComments('docs/guide.md', 'plain prose\n'), 'plain prose\n');
});

test('existing, moved and reindented comments are not additions; edited and duplicated ones are', () => {
  const base = 'const a = 1; // keep\n/**\n * Doc\n */\nfunction f() {}\n';
  assert.deepEqual(addedComments('input.mjs', base, base), []);
  assert.deepEqual(addedComments('input.mjs', base, 'function f() {}\n  /**\n   * Doc\n   */\nconst a = 1; // keep\n'), []);
  assert.deepEqual(addedComments('input.mjs', base, 'const a = 1; // keep\n'), []);
  assert.deepEqual(addedComments('input.mjs', base, ''), []);
  assert.deepEqual(addedComments('input.mjs', base, base.replace('// keep', '// keep!')).map(record => record.text), ['// keep!']);
  assert.deepEqual(addedComments('input.mjs', base, `${base}// keep\n`).map(record => record.text), ['// keep']);
  assert.deepEqual(addedComments('input.mjs', '', base).map(record => record.text), ['// keep', '/**\n * Doc\n */']);
  assert.equal(normalizeComment('  /**\n   * Doc\n   */ '), '/** * Doc */');
});

test('every added comment category is reported with its class', () => {
  for (const [text, category] of [['// TODO: later', 'annotation'], ['/* FIXME */', 'annotation'], ['// HACK around', 'annotation'],
    ['// @ts-ignore', 'suppression'], ['// @ts-expect-error: reason', 'suppression'], ['// @ts-nocheck', 'suppression'],
    ['/* eslint-disable no-console */', 'suppression'], ['// eslint-disable-next-line', 'suppression'],
    ['// istanbul ignore next', 'suppression'], ['// prettier-ignore', 'suppression'], ['# gitleaks:allow', 'suppression'],
    ['/** Returns the value. */', 'documentation'], ['/* block */', 'block'], ['// inline', 'inline']]) {
    assert.equal(commentCategory(text), category, text);
    const file = text.startsWith('#') ? 'config.yml' : 'scripts/example.mjs';
    const found = commentViolations([{ file, text: `export const value = 1;\n${text}\n`, baseText: 'export const value = 1;\n' }], [], 'index');
    assert.equal(found.length, 1, text);
    assert.match(found[0], new RegExp(`^index ${file.replace('.', '\\.')}:2 ${category}: `));
  }
});

test('technically mandatory and legal comments pass narrowly; prose and suppressions never do', () => {
  const verdicts = (file, source) => commentRecords(file, source).map(record => isMandatoryComment(file, record.text, source, record.start));
  const workflow = `steps:\n  - uses: actions/checkout@${sha} `;
  for (const [file, source, expected] of [
    ['tool.mjs', '#!/usr/bin/env node\nexport {};\n', [true]],
    ['.githooks/pre-push', '#!/bin/sh -e\nset -u\n', [true]],
    ['types.ts', '/// <reference types="node" />\nexport {};\n', [true]],
    ['types.ts', '// header\n/// <reference path="a.d.ts" />\n', [false, true]],
    ['view.tsx', '/** @jsxImportSource preact */\nexport {};\n', [true]],
    ['view.tsx', '/** @jsx h @jsxFrag Fragment */\nexport {};\n', [true]],
    ['module.mjs', '// Copyright 2026 Example Corporation. All rights reserved.\n', [true]],
    ['module.mjs', '/* Copyright (c) 2024-2026 Example Corporation */\n', [true]],
    ['module.mjs', '// SPDX-License-Identifier: MIT OR Apache-2.0\n', [true]],
    ['query.sql', '-- Copyright (c) 2026 Example Corporation\n', [true]],
    ['ci.yml', `${workflow}# v7\n`, [true]],
    ['ci.yml', `${workflow}# v7.1.2\n`, [true]],
    ['ci.yml', `${workflow}# v7.0.0-rc.1\n`, [true]],
    ['ci.yml', '  - uses: actions/checkout@v6 # v7\n', [false]],
    ['ci.yml', `${workflow}# because the old one broke\n`, [false]],
    ['ci.yml', `${workflow}# v7 for now\n`, [false]],
    ['ci.yml', '  - run: echo hi # v7\n', [false]],
    ['ci.yml', '#!/usr/bin/env node\nname: x\n', [false]],
    ['.githooks/pre-push', 'echo\n#!/bin/sh\n', [false]],
    ['tool.mjs', '#!/bin/sh and also do TODO things\nexport {};\n', [false]],
    ['types.ts', 'export {};\n/// <reference types="node" />\n', [false]],
    ['types.ts', '/// <reference types="node" /> TODO\nexport {};\n', [false]],
    ['view.tsx', '/** @jsx h TODO */\nexport {};\n', [false]],
    ['module.mjs', '// Copyright Example\n', [false]],
    ['module.mjs', '// Copyright 2026\n', [false]],
    ['module.mjs', '// TODO Copyright 2026 Example Corporation\n', [false]],
    ['module.mjs', '// SPDX-License-Identifier: MIT because we like it very much\n', [false]],
    ['module.mjs', '// Copyright 2026 Example. TODO: fix later\n', [false]],
    ['module.mjs', '// Copyright 2026 Example. eslint-disable next\n', [false]],
    ['module.mjs', `// Copyright 2026 ${'x'.repeat(200)}\n`, [false]],
    ['module.mjs', '/* Copyright 2026 Example\n * All rights reserved. */\n', [false]],
    ['types.ts', '// @ts-ignore\nexport {};\n', [false]],
    ['module.mjs', '/* eslint-disable */\nexport {};\n', [false]],
  ]) assert.deepEqual(verdicts(file, source), expected, `${file}: ${source}`);
});

test('generated database types are the only exact-path generated exception', () => {
  const change = file => [{ file, text: 'export type Json = string; // generated note\n', baseText: '' }];
  assert.deepEqual(commentViolations(change('supabase/database.types.ts'), [], 'index'), []);
  assert.equal(commentViolations(change('supabase/other.types.ts'), [], 'index').length, 1);
  assert.equal(commentViolations(change('src/database.types.ts'), [], 'index').length, 1);
});

test('owner-approved exceptions are validated, exact, per-file and single-use', () => {
  assert.deepEqual(approvedExceptions(null, 'index'), []);
  assert.deepEqual(approvedExceptions('{}\n', 'index'), []);
  assert.throws(() => approvedExceptions('{', 'index'), /Invalid package.json in index/);
  assert.throws(() => approvedExceptions('{"repositoryHygiene":{"commentExceptions":{}}}', 'index'), /must be an array/);
  for (const broken of [{ file: 'scripts/a.mjs', text: '// x' }, { file: 'scripts/a.mjs', text: '// x', reason: ' ' },
    { file: 'scripts/a.mjs', text: ' ', reason: 'r' }, { file: 'scripts/a.mjs', reason: 'r' }, null]) {
    assert.throws(() => approvedExceptions(manifest(broken), 'index'), /file, text and reason/);
  }
  assert.deepEqual(approvedExceptions(manifest({ ...exception('scripts/a.mjs', '// x'), approval: 'self-declared' }), 'index'), [{ file: 'scripts/a.mjs', text: '// x' }]);
  assert.throws(() => approvedExceptions(manifest(exception('Scripts/A.mjs', '// x')), 'index'));
  assert.throws(() => approvedExceptions(manifest(exception('../a.mjs', '// x')), 'index'), /Unsafe repository path/);
  const change = { file: 'scripts/a.mjs', text: 'export const a = 1; // reviewed\n// reviewed\n', baseText: '' };
  const [approved] = approvedExceptions(manifest(exception('scripts/a.mjs', '//   reviewed ')), 'index');
  assert.equal(commentViolations([change], [approved], 'index').length, 1);
  assert.equal(commentViolations([change], [approved, approved], 'index').length, 0);
  assert.equal(commentViolations([change], approvedExceptions(manifest(exception('scripts/b.mjs', '// reviewed')), 'index'), 'index').length, 2);
  assert.equal(commentViolations([change], approvedExceptions(manifest(exception('scripts/a.mjs', '// reviewed later')), 'index'), 'index').length, 2);
});

test('staged additions fail with a clean working file; working additions fail while unstaged', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  assert.doesNotThrow(() => checkComments(repository, {}));
  write('scripts/example.mjs', 'export const value = 1; // narrate\n');
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/example\.mjs:1 inline: \/\/ narrate/);
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.throws(() => checkComments(repository, {}), /working tree scripts\/example\.mjs:1/);
  run(['add', '--', 'scripts/example.mjs']);
  write('scripts/example.mjs', 'export const value = 1;\n');
  assert.throws(() => checkStagedComments(repository), /index scripts\/example\.mjs:1 inline: \/\/ narrate/);
  assert.doesNotThrow(() => checkWorkingComments(repository));
  assert.throws(() => checkComments(repository, {}), /index scripts\/example\.mjs:1/);
  run(['add', '--', 'scripts/example.mjs']);
  assert.doesNotThrow(() => checkComments(repository, {}));
});

test('every commit in the range is inspected, so a comment removed by a later commit is still reported', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/example.mjs', 'export const value = 1;\n// TODO: remove\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: add a note']);
  const introducing = run(['rev-parse', 'HEAD']).trim().slice(0, 12);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 2, ' annotation: // TODO: remove'));
  write('scripts/example.mjs', 'export const value = 1;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fix: remove the note']);
  assert.equal(run(['diff', '--stat', ...range]), '');
  assert.throws(() => checkCommentRevision(repository, ...range), error => error.message.includes(`revision ${introducing} scripts/example.mjs:2`));
  assert.throws(() => checkComments(repository, {}), /Added source comments are prohibited \(1\)/);
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.doesNotThrow(() => checkWorkingComments(repository));
});

test('a range that adds nothing, or whose commits only touch existing comments, passes', () => {
  const body = 'export const value = 1;\n';
  const { repository, run, write } = repositoryFixture({ 'scripts/legacy.mjs': `// legacy note\n${body}`, 'scripts/other.mjs': body });
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  write('scripts/other.mjs', 'export const value = 2;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fix: change the value']);
  write('scripts/legacy.mjs', `  // legacy note\n${body}export const extra = 1;\n`);
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'refactor: touch the legacy file']);
  write('scripts/legacy.mjs', `export const extra = 1;\n${body}// legacy note\n`);
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'refactor: move the legacy note']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  assert.doesNotThrow(() => checkComments(repository, {}));
});

test('merge commits are judged by what no parent already contains', () => {
  const body = 'export const value = 1;\n';
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': body, 'scripts/shared.mjs': body });
  write('scripts/example.mjs', 'export const value = 2;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fix: change the value']);
  run(['switch', '--quiet', 'main']);
  write('scripts/shared.mjs', `// base branch note\n${body}`);
  write('scripts/other.mjs', `// another base note\n${body}`);
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: advance the base']);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  run(['switch', '--quiet', 'claude/comment-fixture']);
  run(['merge', '--no-ff', '--quiet', '-m', 'Merge branch main into claude/comment-fixture', 'refs/remotes/origin/main']);
  assert.equal(run(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(' ').length, 3);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  assert.doesNotThrow(() => checkComments(repository, {}));
  run(['merge', '--no-ff', '--no-commit', '--quiet', 'HEAD~1']);
  write('scripts/example.mjs', 'export const value = 2; // slipped into the merge\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'Merge branch fix into claude/comment-fixture']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 1, ' inline: // slipped into the merge'));
});

test('a merge of a side branch cannot launder a comment that the side branch added', () => {
  const body = 'export const value = 1;\n';
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': body, 'scripts/side.mjs': body });
  run(['switch', '--quiet', '-c', 'claude/side']);
  write('scripts/side.mjs', `${body}// side note\n`);
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: add a side note']);
  run(['switch', '--quiet', 'claude/comment-fixture']);
  write('scripts/example.mjs', 'export const value = 2;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fix: change the value']);
  run(['merge', '--no-ff', '--quiet', '-m', 'Merge branch claude/side into claude/comment-fixture', 'claude/side']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/side.mjs', 2, ' inline: // side note'));
});

test('a root commit in the range is judged against the empty tree', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  run(['switch', '--quiet', '--orphan', 'claude/orphan']);
  write('scripts/orphan.mjs', 'export const orphan = 1;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: start unrelated history']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  write('scripts/orphan.mjs', 'export const orphan = 1; // note\n');
  run(['add', '.']);
  run(['commit', '--quiet', '--amend', '-m', 'chore: start unrelated history']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/orphan.mjs', 1, ' inline'));
  assert.doesNotThrow(() => checkCommentRevision(repository, 'HEAD', 'HEAD'));
});

test('base-branch comment changes after the fork do not alter the verdict on the proposed revision', () => {
  const { repository, run, write } = repositoryFixture({
    'scripts/example.mjs': 'export const value = 1;\n', 'scripts/legacy.mjs': '// legacy note\nexport const legacy = 1;\n',
  });
  run(['switch', '--quiet', 'main']);
  write('scripts/legacy.mjs', 'export const legacy = 1;\n');
  write('scripts/other.mjs', '// base branch note\nexport const other = 2;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: advance the base']);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  run(['switch', '--quiet', 'claude/comment-fixture']);
  write('scripts/example.mjs', 'export const value = 2;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fix: change the value']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  assert.doesNotThrow(() => checkComments(repository, {}));
  write('scripts/example.mjs', 'export const value = 2; // narrate\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: add a note']);
  assert.throws(() => checkCommentRevision(repository, ...range), error => {
    assert.match(error.message, /scripts\/example\.mjs:1/);
    assert.doesNotMatch(error.message, /legacy|other/);
    return true;
  });
});

test('existing comments survive edits and renames; renamed files that gain a comment fail', () => {
  const body = Array.from({ length: 12 }, (_, index) => `export const value${index} = ${index};`).join('\n');
  const { repository, run, write } = repositoryFixture({ 'scripts/old-name.mjs': `// legitimate existing note\n${body}\n` });
  run(['mv', 'scripts/old-name.mjs', 'scripts/new-name.mjs']);
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.doesNotThrow(() => checkWorkingComments(repository));
  write('scripts/new-name.mjs', `// legitimate existing note\n${body}\nexport const extra = 99;\n`);
  run(['add', '.']);
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['commit', '--quiet', '-m', 'refactor: rename and extend']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  write('scripts/new-name.mjs', `// legitimate existing note\n${body}\nexport const extra = 99; // explain\n`);
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/new-name\.mjs:14 inline: \/\/ explain/);
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/new-name\.mjs:14 inline/);
});

test('renames keep comments only inside the same comment grammar, and generated files stay exempt in every commit', () => {
  const body = Array.from({ length: 12 }, (_, index) => `export const value${index} = ${index};`).join('\n');
  const { repository, run, write } = repositoryFixture({
    'scripts/script.mjs': `// legitimate existing note\n${body}\n`, 'config/settings.yml': '# legitimate existing note\nname: x\n',
    'supabase/database.types.ts': 'export type Json = string;\n',
  });
  run(['mv', 'scripts/script.mjs', 'scripts/renamed.js']);
  run(['mv', 'config/settings.yml', 'config/settings.yaml']);
  run(['commit', '--quiet', '-m', 'refactor: rename within the same grammar']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  run(['mv', 'scripts/renamed.js', 'scripts/renamed.ts']);
  run(['commit', '--quiet', '-m', 'refactor: change the grammar']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/renamed.ts', 1, ' inline: // legitimate existing note'));
  run(['reset', '--quiet', '--hard', 'HEAD~1']);
  write('supabase/database.types.ts', 'export type Json = string; // generated\n');
  run(['commit', '--quiet', '-a', '-m', 'chore: regenerate the database types']);
  write('supabase/database.types.ts', 'export type Json = string;\n');
  run(['commit', '--quiet', '-a', '-m', 'chore: regenerate the database types again']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
});

test('new and untracked files are fully inspected, including staged files deleted from the working tree', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/untracked.mjs', 'export const a = "// fine"; /* not fine */\n');
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/untracked\.mjs:1 block: \/\* not fine \*\//);
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['add', '--', 'scripts/untracked.mjs']);
  rmSync(path.join(repository, 'scripts/untracked.mjs'));
  assert.throws(() => checkStagedComments(repository), /index scripts\/untracked\.mjs:1 block/);
  assert.doesNotThrow(() => checkWorkingComments(repository));
  run(['rm', '--cached', '--quiet', '--', 'scripts/untracked.mjs']);
  write('scripts/clean.mjs', 'export const a = "// fine";\n');
  write('docs/guide.md', 'Prose with // slashes and <!-- markup -->.\n');
  write('scripts/data.json', '{"a": "// fine"}\n');
  assert.doesNotThrow(() => checkComments(repository, {}));
});

test('the very first commit is inspected against the empty tree', () => {
  const clean = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' }, { commit: false });
  clean.run(['add', '.']);
  assert.doesNotThrow(() => checkStagedComments(clean.repository));
  const noisy = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1; // note\n' }, { commit: false });
  noisy.run(['add', '.']);
  assert.throws(() => checkStagedComments(noisy.repository), /index scripts\/example\.mjs:1 inline/);
});

test('an exception added in the same changeset never authorizes its own comment', () => {
  const entry = exception('scripts/example.mjs', '// reviewed note');
  const commented = 'export const value = 1; // reviewed note\n';
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/example.mjs', commented);
  write('package.json', manifest(entry));
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/example\.mjs:1 inline: \/\/ reviewed note/);
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/example\.mjs:1 inline: \/\/ reviewed note/);
  run(['commit', '--quiet', '-m', 'chore: add a self-approved note']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 1, ' inline: // reviewed note'));
  assert.throws(() => checkComments(repository, {}), /Added source comments are prohibited \(1\)[^]*trusted baseline \(refs\/remotes\/origin\/main\)/);
});

test('an exception committed earlier on the same branch is still not trusted', () => {
  const entry = exception('scripts/example.mjs', '// reviewed note');
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('package.json', manifest(entry));
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: record an exception']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  write('scripts/example.mjs', 'export const value = 1; // reviewed note\n');
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/example\.mjs:1/);
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/example\.mjs:1/);
  run(['commit', '--quiet', '-m', 'chore: add the reviewed note']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 1));
});

test('an exception in the trusted baseline authorizes one exact occurrence across the whole range', () => {
  const { repository, run, write } = repositoryFixture({
    'scripts/example.mjs': 'export const value = 1;\n', 'scripts/other.mjs': 'export const other = 1;\n',
    'package.json': manifest(exception('scripts/example.mjs', '// reviewed note')),
  });
  assert.deepEqual(trustedExceptions(repository, trustedBaseline(repository)), [{ file: 'scripts/example.mjs', text: '// reviewed note' }]);
  write('scripts/example.mjs', 'export const value = 1; // reviewed note\n');
  assert.doesNotThrow(() => checkWorkingComments(repository));
  run(['add', '.']);
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['commit', '--quiet', '-m', 'chore: add the reviewed note']);
  assert.doesNotThrow(() => checkCommentRevision(repository, ...range));
  assert.doesNotThrow(() => checkComments(repository, {}));
  write('scripts/other.mjs', 'export const other = 1; // reviewed note\n');
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/other\.mjs:1/);
  write('scripts/other.mjs', 'export const other = 1;\n');
  write('scripts/example.mjs', 'export const value = 1; // reviewed note\n// reviewed note\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: repeat the note']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 2));
  run(['reset', '--quiet', '--hard', 'HEAD~1']);
  write('scripts/example.mjs', 'export const value = 1;\n');
  run(['commit', '--quiet', '-a', '-m', 'fix: drop the note']);
  write('scripts/example.mjs', 'export const value = 1; // reviewed note\n');
  run(['commit', '--quiet', '-a', '-m', 'chore: add the note again']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 1));
});

test('a changeset cannot swap the trusted exception for a different comment', () => {
  const { repository, run, write } = repositoryFixture({
    'scripts/example.mjs': 'export const value = 1;\n', 'package.json': manifest(exception('scripts/example.mjs', '// reviewed note')),
  });
  write('package.json', manifest(exception('scripts/example.mjs', '// different note')));
  write('scripts/example.mjs', 'export const value = 1; // different note\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: swap the exception']);
  assert.throws(() => checkCommentRevision(repository, ...range), revisionPattern('scripts/example.mjs', 1, ' inline: // different note'));
  write('package.json', '{}\n');
  write('scripts/example.mjs', 'export const value = 1; // reviewed note\n');
  run(['commit', '--quiet', '-a', '-m', 'chore: remove the exception list']);
  assert.throws(() => checkCommentRevision(repository, ...range), /revision [0-9a-f]{12} scripts\/example\.mjs:1 inline: \/\/ different note/);
});

test('without a trusted baseline no exception applies, and a malformed baseline manifest fails loudly', () => {
  const entry = exception('scripts/example.mjs', '// reviewed note');
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n', 'package.json': manifest(entry) });
  assert.equal(trustedBaseline(repository), run(['rev-parse', 'refs/remotes/origin/main']).trim());
  run(['update-ref', '-d', 'refs/remotes/origin/main']);
  assert.equal(trustedBaseline(repository), null);
  assert.deepEqual(trustedExceptions(repository, null), []);
  write('scripts/example.mjs', 'export const value = 1; // reviewed note\n');
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/example\.mjs:1[^]*trusted baseline \(unavailable\)/);
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/example\.mjs:1/);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  write('package.json', '{');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: break the manifest']);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.throws(() => checkStagedComments(repository), /Invalid package.json in trusted baseline/);
});

test('mandatory directives and generated files pass in Git states while prose beside them fails', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/tool.mjs', '#!/usr/bin/env node\nexport const tool = 1;\n');
  write('supabase/database.types.ts', 'export type Json = string; // generated\n');
  write('.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha} # v7\n`);
  run(['add', '.']);
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.doesNotThrow(() => checkWorkingComments(repository));
  write('scripts/tool.mjs', '#!/usr/bin/env node\n// explain the tool\nexport const tool = 1;\n');
  write('supabase/other.ts', 'export type Json = string; // not generated\n');
  assert.throws(() => checkWorkingComments(repository), error => /scripts\/tool\.mjs:2 inline/.test(error.message) && /supabase\/other\.ts:1/.test(error.message));
});

test('a comment added inside a staged workflow run script is rejected even when the working file is clean', () => {
  const workflow = steps => `name: Probe\njobs:\n  a:\n    steps:\n      - run: |\n${steps}`;
  const clean = workflow('          npm ci\n');
  const { repository, run, write } = repositoryFixture({ '.github/workflows/probe.yml': clean });
  write('.github/workflows/probe.yml', workflow('          # explain the install\n          npm ci\n'));
  run(['add', '--', '.github/workflows/probe.yml']);
  write('.github/workflows/probe.yml', clean);
  assert.throws(() => checkStagedComments(repository), /index \.github\/workflows\/probe\.yml:6 inline: # explain the install/);
  assert.doesNotThrow(() => checkWorkingComments(repository));
  write('.github/workflows/probe.yml', workflow('          npm ci\n          echo "# not a comment" $#\n'));
  run(['add', '--', '.github/workflows/probe.yml']);
  assert.doesNotThrow(() => checkStagedComments(repository));
});

test('invalid UTF-8 and malformed sources fail instead of being skipped', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/example.mjs', Buffer.from([0x65, 0xff, 0x0a]));
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository));
  write('scripts/example.mjs', 'export const = ;\n');
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /Invalid JavaScript in scripts\/example\.mjs/);
});

test('comment gates run for the real repository sources without crashing and treat unchanged content as clean', () => {
  const files = git(root, ['ls-files', '-z']).split('\0').filter(file => file && hasCommentGrammar(file));
  assert.ok(files.length > 40);
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    assert.deepEqual(addedComments(file, text, text), [], file);
    const records = commentRecords(file, text);
    for (const record of records) assert.equal(text.slice(record.start, record.start + record.text.length), record.text, file);
  }
});

test('command line entry points reject unsupported arguments', () => {
  for (const [script, args] of [['check-comments.mjs', ['--unknown']], ['check-comments.mjs', ['--staged', 'extra']], ['check-format.mjs', ['extra']]]) {
    const result = spawnProcess(script, args);
    assert.equal(result.status, 1, script);
    assert.match(result.stderr, /Use no arguments/, script);
  }
});

function spawnProcess(script, args) {
  try {
    execFileSync(process.execPath, [path.join(root, 'scripts', script), ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stderr: '' };
  } catch (error) {
    return { status: error.status, stderr: String(error.stderr) };
  }
}

test('hosted CI runs the comment and formatting gates unconditionally before the aggregate check', () => {
  const workflow = parseDocument(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')).toJS();
  const steps = workflow.jobs['repository-checks'].steps;
  const indexes = ['npm run check:comments', 'npm run check:format', 'npm run check'].map(command => steps.findIndex(step => step.run === command));
  assert.ok(indexes.every(index => index >= 0), 'A hosted quality gate is missing.');
  assert.deepEqual([...indexes].sort((a, b) => a - b), indexes);
  for (const index of indexes) {
    assert.equal(steps[index].if, undefined);
    assert.equal(steps[index]['continue-on-error'], undefined);
  }
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review']);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
});

test('package scripts and hooks keep the quality gates direct and unmasked', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(scripts['check:comments'], 'node scripts/check-comments.mjs');
  assert.equal(scripts['check:format'], 'node scripts/check-format.mjs');
  const checks = scripts.check.split(' && ');
  assert.ok(checks.indexOf('npm run check:comments') > checks.indexOf('npm run check:hygiene'));
  assert.ok(checks.includes('npm run check:format'));
  const preCommit = readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8').split('\n');
  for (const command of ['node scripts/check-comments.mjs --staged', 'node scripts/check-format.mjs --staged', 'node scripts/check-yaml.mjs']) {
    assert.equal(preCommit.filter(line => line === command).length, 1, command);
  }
  assert.equal(readFileSync(path.join(root, '.githooks/pre-push'), 'utf8'),
    '#!/bin/sh\nset -eu\nnpm run identity\nnode scripts/check-metadata.mjs --pre-push "$@"\nnpm run check\nnpm run verify:negative\n');
});
