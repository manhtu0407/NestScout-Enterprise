import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { parseDocument } from 'yaml';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { checkPath, commentRecords, sourceComments, hasCommentGrammar } from './check-hygiene.mjs';
import {
  commentCategory, commentViolations, isMandatoryComment, normalizeComment,
  checkCommittedComments, checkStagedComments, checkWorkingComments, checkComments,
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
  }
  return { repository, run, write };
}

const texts = (file, source) => commentRecords(file, source).map(record => record.text);
const sha = 'a'.repeat(40);
const violations = (file, text, label = 'index') => commentViolations([{ file, text }], label);

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

test('ignore, attributes, editor and environment example files only comment at a line start or after whitespace', () => {
  assert.deepEqual(texts('.gitignore', '# note\n\\#literal\nname#tag\n  # indented\ndist/\n'), ['# note', '# indented']);
  assert.deepEqual(texts('supabase/.gitignore', '.branches\n# note\r\n'), ['# note']);
  assert.deepEqual(texts('.gitattributes', '* text=auto eol=lf\n# note\n*.png binary\n'), ['# note']);
  assert.deepEqual(texts('.editorconfig', '; semicolon\n# hash\n[*]\nindent_style = space ; value\nroot = true\n'), ['; semicolon', '# hash']);
  assert.deepEqual(texts('apps/mobile/.env.example', 'A=1 # trailing\nB="x # y"\nC=a#b\n# whole\nD=https://example.invalid/#f\n'), ['# trailing', '# whole']);
  for (const file of ['.gitignore', 'supabase/.gitignore', '.gitattributes', '.editorconfig', '.env.example', 'apps/mobile/.env.example']) {
    assert.equal(hasCommentGrammar(file), true, file);
    assert.equal(sourceComments(file, '# AI note\nplain\n'), '# AI note\nplain\n', file);
  }
  const source = '# note\ndist/\n';
  for (const record of commentRecords('.gitignore', source)) assert.equal(source.slice(record.start, record.start + record.text.length), record.text);
});

test('only files with a comment grammar are inspected; JSON keeps its line-leading fallback', () => {
  for (const file of ['README.md', 'package.json', 'docs/guide.md', 'scripts/tools.json', 'apps/mobile/app.json']) {
    assert.equal(commentRecords(file, '// text\n'), null, file);
    assert.equal(hasCommentGrammar(file), false, file);
  }
  for (const file of ['a.mjs', 'a.cjs', 'a.ts', 'a.d.ts', 'a.tsx', 'a.sql', 'a.toml', 'a.yml', 'a.yaml', 'a.jsonc', '.githooks/pre-push']) {
    assert.equal(hasCommentGrammar(file), true, file);
  }
  assert.equal(sourceComments('package.json', '{\n// x\n}\n'), '// x');
  assert.equal(sourceComments('docs/guide.md', 'plain prose\n'), 'plain prose\n');
});

test('every comment category is reported with its class and position', () => {
  assert.equal(normalizeComment('  /**\n   * Doc\n   */ '), '/** * Doc */');
  for (const [text, category] of [['// TODO: later', 'annotation'], ['/* FIXME */', 'annotation'], ['// HACK around', 'annotation'],
    ['// @ts-ignore', 'suppression'], ['// @ts-expect-error: reason', 'suppression'], ['// @ts-nocheck', 'suppression'],
    ['/* eslint-disable no-console */', 'suppression'], ['// eslint-disable-next-line', 'suppression'],
    ['// istanbul ignore next', 'suppression'], ['// prettier-ignore', 'suppression'], ['# gitleaks:allow', 'suppression'],
    ['/** Returns the value. */', 'documentation'], ['/* block */', 'block'], ['// inline', 'inline']]) {
    assert.equal(commentCategory(text), category, text);
    const file = text.startsWith('#') ? 'config.yml' : 'scripts/example.mjs';
    const found = violations(file, `export const value = 1;\n${text}\n`);
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
    ['.gitignore', '#!/bin/sh\n', [false]],
    ['.editorconfig', '# v7\n', [false]],
  ]) assert.deepEqual(verdicts(file, source), expected, `${file}: ${source}`);
});

test('generated database types are the only exact-path generated exception', () => {
  const source = 'export type Json = string; // generated note\n';
  assert.deepEqual(violations('supabase/database.types.ts', source), []);
  assert.equal(violations('supabase/other.types.ts', source).length, 1);
  assert.equal(violations('src/database.types.ts', source).length, 1);
});

test('comment exceptions are unsupported in every state, so the manifest cannot approve a comment', () => {
  assert.deepEqual(violations('package.json', '{}\n'), []);
  assert.deepEqual(violations('package.json', '{ "repositoryHygiene": { "artifacts": [] } }\n'), []);
  assert.deepEqual(violations('package.json', '{'), []);
  assert.equal(violations('package.json', '{ "repositoryHygiene": { "commentExceptions": [] } }\n').length, 1);
  assert.match(violations('package.json', '{ "repositoryHygiene": { "commentExceptions": [{}] } }\n')[0], /commentExceptions: exceptions are not supported/);
  assert.deepEqual(violations('apps/mobile/package.json', '{ "repositoryHygiene": { "commentExceptions": [] } }\n'), []);
});

const formats = [
  ['scripts/example.mjs', 'export const value = 1;\n', 'export const value = 1; // note\n', 'inline'],
  ['scripts/example.mjs', 'export const value = 1;\n', '/** Returns the value. */\nexport const value = 1;\n', 'documentation'],
  ['scripts/example.cjs', 'module.exports = 1;\n', 'module.exports = 1; /* note */\n', 'block'],
  ['src/example.ts', 'export const value: number = 1;\n', '// TODO: later\nexport const value: number = 1;\n', 'annotation'],
  ['src/example.tsx', 'export const View = () => <a href="//x">text</a>;\n', 'export const View = () => <a href="//x">text</a>; // @ts-ignore\n', 'suppression'],
  ['src/types.d.ts', 'declare const x: string;\n', 'declare const x: string; // note\n', 'inline'],
  ['db/query.sql', 'select 1;\n', 'select 1; -- note\n', 'inline'],
  ['db/query.sql', 'select 1;\n', '/* note */ select 1;\n', 'block'],
  ['config/settings.toml', 'key = "# kept"\n', 'key = "# kept" # note\n', 'inline'],
  ['config/settings.yml', 'key: "# kept"\n', 'key: "# kept" # note\n', 'inline'],
  ['config/settings.yaml', 'key: 1\n', '# note\nkey: 1\n', 'inline'],
  ['config/settings.jsonc', '{ "a": "// kept" }\n', '{ "a": "// kept" } // note\n', 'inline'],
  ['.githooks/pre-commit', '#!/bin/sh\nset -eu\nnpm test\n', '#!/bin/sh\nset -eu\n# note\nnpm test\n', 'inline'],
  ['.github/workflows/probe.yml', 'jobs:\n  a:\n    steps:\n      - run: |\n          npm ci\n', 'jobs:\n  a:\n    steps:\n      - run: |\n          npm ci # note\n', 'inline'],
  ['.gitattributes', '* text=auto\n', '# note\n* text=auto\n', 'inline'],
  ['supabase/.gitignore', '.temp\n', '# note\n.temp\n', 'inline'],
  ['.editorconfig', 'root = true\n', '; note\nroot = true\n', 'inline'],
  ['apps/mobile/.env.example', 'A=1\n', 'A=1 # note\n', 'inline'],
];

test('every supported format accepts its clean form and reports the comment it gains with the right class', () => {
  for (const [file, clean, dirty, category] of formats) {
    const label = `${file} (${category})`;
    assert.deepEqual(violations(file, clean), [], label);
    const found = violations(file, dirty);
    assert.equal(found.length, 1, label);
    assert.match(found[0], new RegExp(`^index ${file.replace(/[.\\/]/g, '\\$&')}:\\d+ ${category}: `), label);
  }
});

test('every supported format is rejected in the working tree, staged index and committed tree when it gains a comment', () => {
  const unique = formats.filter(([file], index) => formats.findIndex(item => item[0] === file) === index);
  const { repository, run, write } = repositoryFixture(Object.fromEntries(unique.map(([file, clean]) => [file, clean])));
  const count = new RegExp(`Source comments are prohibited \\(${unique.length}\\)`);
  assert.doesNotThrow(() => checkComments(repository));
  for (const [file, , dirty] of unique) write(file, dirty);
  assert.throws(() => checkWorkingComments(repository), count);
  assert.throws(() => checkComments(repository), /working tree /);
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['add', '.']);
  for (const [file, clean] of unique) write(file, clean);
  assert.throws(() => checkStagedComments(repository), count);
  assert.doesNotThrow(() => checkWorkingComments(repository));
  run(['commit', '--quiet', '-m', 'chore: add notes']);
  assert.throws(() => checkCommittedComments(repository), count);
  run(['add', '.']);
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['commit', '--quiet', '-m', 'fix: remove notes']);
  assert.doesNotThrow(() => checkComments(repository));
});

test('comments already present in the committed baseline are reported in every state', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/legacy.mjs': '// legacy note\nexport const value = 1;\n', 'db/old.sql': 'select 1; -- legacy\n' });
  assert.throws(() => checkCommittedComments(repository), /Source comments are prohibited \(2\)/);
  assert.throws(() => checkStagedComments(repository), /index scripts\/legacy\.mjs:1 inline: \/\/ legacy note/);
  assert.throws(() => checkWorkingComments(repository), /working tree db\/old\.sql:1 inline: -- legacy/);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.throws(() => checkComments(repository), /HEAD scripts\/legacy\.mjs:1/);
  write('scripts/legacy.mjs', '  // legacy note\nexport const value = 1;\nexport const extra = 1;\n');
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/legacy\.mjs:1/);
});

test('a manifest that declares comment exceptions approves nothing, whether staged, working or already committed', () => {
  const manifest = JSON.stringify({ repositoryHygiene: { commentExceptions: [{ file: 'scripts/a.mjs', text: '// reviewed', reason: 'Reviewed.' }] } }) + '\n';
  const { repository, run, write } = repositoryFixture({ 'scripts/a.mjs': 'export const a = 1;\n' });
  write('scripts/a.mjs', 'export const a = 1; // reviewed\n');
  write('package.json', manifest);
  assert.throws(() => checkWorkingComments(repository), /Source comments are prohibited \(2\)/);
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /Source comments are prohibited \(2\)/);
  run(['commit', '--quiet', '-m', 'chore: declare an exception']);
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  assert.throws(() => checkCommittedComments(repository), /scripts\/a\.mjs:1 inline: \/\/ reviewed/);
  assert.throws(() => checkCommittedComments(repository), /package\.json repositoryHygiene\.commentExceptions/);
});

test('history is not judged: a comment added by one commit and removed by a later one leaves a clean delivered state', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/example.mjs', 'export const value = 1;\n// TODO: remove\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'chore: add a note']);
  assert.throws(() => checkComments(repository), /HEAD scripts\/example\.mjs:2 annotation: \/\/ TODO: remove/);
  write('scripts/example.mjs', 'export const value = 1;\n');
  run(['add', '.']);
  run(['commit', '--quiet', '-m', 'fix: remove the note']);
  assert.doesNotThrow(() => checkComments(repository));
});

test('staged additions fail with a clean working file; working additions fail while unstaged', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  assert.doesNotThrow(() => checkComments(repository));
  write('scripts/example.mjs', 'export const value = 1; // narrate\n');
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/example\.mjs:1 inline: \/\/ narrate/);
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.throws(() => checkComments(repository), /working tree scripts\/example\.mjs:1/);
  run(['add', '--', 'scripts/example.mjs']);
  write('scripts/example.mjs', 'export const value = 1;\n');
  assert.throws(() => checkStagedComments(repository), /index scripts\/example\.mjs:1 inline: \/\/ narrate/);
  assert.doesNotThrow(() => checkWorkingComments(repository));
  assert.throws(() => checkComments(repository), /index scripts\/example\.mjs:1/);
  run(['add', '--', 'scripts/example.mjs']);
  assert.doesNotThrow(() => checkComments(repository));
});

test('the staged gate reads only Git objects, so unrelated working edits neither block nor are touched', () => {
  const { repository, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/example.mjs', 'export const value = 1; // unstaged\n');
  write('scripts/untracked.mjs', '// untracked\n');
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.throws(() => checkWorkingComments(repository), error => /scripts\/example\.mjs:1/.test(error.message) && /scripts\/untracked\.mjs:1/.test(error.message));
});

test('new and untracked files are fully inspected, including staged files deleted from the working tree', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/added.mjs', 'export const added = 1; // brand new\n');
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/added\.mjs:1 inline: \/\/ brand new/);
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['add', '--', 'scripts/added.mjs']);
  rmSync(path.join(repository, 'scripts/added.mjs'));
  assert.throws(() => checkStagedComments(repository), /index scripts\/added\.mjs:1 inline: \/\/ brand new/);
  assert.doesNotThrow(() => checkWorkingComments(repository));
  write('scripts/example.mjs', 'export const value = 1;\n');
  run(['rm', '--cached', '--quiet', '--', 'scripts/added.mjs']);
  assert.doesNotThrow(() => checkComments(repository));
});

test('the very first commit and an unborn branch are judged against the delivered state', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1; // first\n' }, { commit: false });
  assert.throws(() => checkWorkingComments(repository), /working tree scripts\/example\.mjs:1/);
  assert.doesNotThrow(() => checkCommittedComments(repository));
  assert.doesNotThrow(() => checkStagedComments(repository));
  run(['add', '.']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/example\.mjs:1/);
  write('scripts/example.mjs', 'export const value = 1;\n');
  run(['add', '.']);
  assert.doesNotThrow(() => checkComments(repository));
});

test('renaming a file, even across comment grammars, never launders its comments', () => {
  const { repository, run } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1; // kept\n' });
  run(['mv', 'scripts/example.mjs', 'scripts/renamed.mjs']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/renamed\.mjs:1 inline: \/\/ kept/);
  run(['mv', 'scripts/renamed.mjs', 'scripts/renamed.ts']);
  assert.throws(() => checkStagedComments(repository), /index scripts\/renamed\.ts:1 inline: \/\/ kept/);
});

test('approved mobile TypeScript and TSX sources are covered by every comment gate', () => {
  const screen = 'apps/mobile/src/features/access/screens/example-screen.tsx';
  const helper = 'apps/mobile/src/lib/example-helper.ts';
  const testFile = 'apps/mobile/src/lib/example-helper.test.ts';
  const clean = {
    [screen]: 'export const Screen = () => <a href="//x">text</a>;\n',
    [helper]: 'export const value = 1;\n',
    [testFile]: 'export const checked = 1;\n',
  };
  const { repository, run, write } = repositoryFixture(clean);
  for (const file of [screen, helper, testFile]) {
    assert.ok(hasCommentGrammar(file), file);
    assert.doesNotThrow(() => checkPath(file), file);
  }
  assert.doesNotThrow(() => checkComments(repository));
  write(screen, 'export const Screen = () => <a href="//x">text</a>; // note\n');
  write(helper, '/** Documented. */\nexport const value = 1;\n');
  write(testFile, 'export const checked = 1; // eslint-disable-line\n');
  assert.throws(() => checkWorkingComments(repository), error => [screen, helper, testFile].every(file => error.message.includes(file)));
  run(['add', '.']);
  for (const [file, text] of Object.entries(clean)) write(file, text);
  assert.throws(() => checkStagedComments(repository), error => [screen, helper, testFile].every(file => error.message.includes(file)));
  run(['commit', '--quiet', '-m', 'feat: add mobile comments']);
  assert.throws(() => checkCommittedComments(repository), error => [screen, helper, testFile].every(file => error.message.includes(file)));
});

test('mandatory directives and generated files pass in Git states while prose beside them fails', () => {
  const { repository, run, write } = repositoryFixture({ 'scripts/example.mjs': 'export const value = 1;\n' });
  write('scripts/tool.mjs', '#!/usr/bin/env node\nexport const tool = 1;\n');
  write('supabase/database.types.ts', 'export type Json = string; // generated\n');
  write('.github/workflows/ci.yml', `steps:\n  - uses: actions/checkout@${sha} # v7\n`);
  write('.githooks/pre-commit', '#!/bin/sh\nset -eu\n');
  run(['add', '.']);
  assert.doesNotThrow(() => checkStagedComments(repository));
  assert.doesNotThrow(() => checkWorkingComments(repository));
  run(['commit', '--quiet', '-m', 'chore: add mandatory directives']);
  assert.doesNotThrow(() => checkComments(repository));
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

test('the delivered repository sources contain no prohibited comment and only the verified mandatory ones', () => {
  const files = git(root, ['ls-files', '-z']).split('\0').filter(file => file && hasCommentGrammar(file));
  assert.ok(files.length > 40);
  const mandatory = [];
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    assert.deepEqual(violations(file, text, 'repository'), [], file);
    for (const record of commentRecords(file, text)) {
      assert.equal(text.slice(record.start, record.start + record.text.length), record.text, file);
      if (isMandatoryComment(file, record.text, text, record.start)) mandatory.push({ file, text: record.text });
    }
  }
  assert.ok(mandatory.length > 0);
  for (const { file, text } of mandatory) {
    const hook = /^\.githooks\/[a-z-]+$/.test(file) && /^#!\/bin\/sh$/.test(text);
    const dependabot = /^\.github\/workflows\/[a-z-]+\.yml$/.test(file) && /^# v\d+(?:\.\d+){0,2}$/.test(text);
    assert.ok(hook || dependabot, `Unexpected mandatory comment ${file}: ${text}`);
  }
  assert.deepEqual(violations('package.json', readFileSync(path.join(root, 'package.json'), 'utf8'), 'repository'), []);
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
  assert.ok(workflow.jobs['supabase-local'], 'The Supabase local verification job is missing.');
  assert.deepEqual(workflow.on.pull_request.types, ['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review']);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
});

test('package scripts and hooks keep the quality gates direct and unmasked', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(scripts['check:comments'], 'node scripts/check-comments.mjs');
  assert.equal(scripts['check:format'], 'node scripts/check-format.mjs');
  const checks = scripts.check.split(' && ');
  assert.ok(checks.includes('npm run check:mobile'));
  assert.equal(scripts['check:mobile'], 'npm run typecheck:mobile && npm run lint:mobile && npm run test:mobile');
  assert.ok(scripts['verify:negative'].includes('scripts/check-comments.test.mjs scripts/check-format.test.mjs'));
  assert.ok(checks.indexOf('npm run check:comments') > checks.indexOf('npm run check:hygiene'));
  assert.ok(checks.includes('npm run check:format'));
  const preCommit = readFileSync(path.join(root, '.githooks/pre-commit'), 'utf8').split('\n');
  for (const command of ['node scripts/check-comments.mjs --staged', 'node scripts/check-format.mjs --staged', 'node scripts/check-yaml.mjs']) {
    assert.equal(preCommit.filter(line => line === command).length, 1, command);
  }
  assert.equal(readFileSync(path.join(root, '.githooks/pre-push'), 'utf8'),
    '#!/bin/sh\nset -eu\nnpm run identity\nnode scripts/check-metadata.mjs --pre-push "$@"\nnpm run check\nnpm run verify:negative\n');
});
