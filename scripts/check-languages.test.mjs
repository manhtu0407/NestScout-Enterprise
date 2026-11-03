import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkLanguages, policyPath } from './check-languages.mjs';
import { git } from './repository-files.mjs';
import { root } from './tool-path.mjs';

const actualPolicy = JSON.parse(readFileSync(path.join(root, policyPath), 'utf8'));
const approvedException = {
  path: 'services/kael-ml/',
  language: 'python',
  justification: 'Model fine-tuning needs the PyTorch ecosystem and a profiled TypeScript alternative was rejected.',
  approval: 'Architecture decision recorded and approved by the repository owner',
};

function fixture(operation, policy = actualPolicy) {
  const repository = mkdtempSync(path.join(tmpdir(), 'nestscout-languages-'));
  const write = (file, content = 'fixture\n') => {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), content);
  };
  const run = args => git(repository, args);
  try {
    run(['init', '--quiet']);
    run(['config', 'core.autocrlf', 'false']);
    write(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    write('apps/mobile/eslint.config.mjs', 'export default [];\n');
    run(['add', '--all']);
    operation({ repository, write, run });
  } finally {
    assert.equal(path.dirname(realpathSync(repository)), realpathSync(tmpdir()));
    rmSync(repository, { recursive: true });
  }
}

test('the repository satisfies its own language policy in index and working tree', () => {
  const [indexed, working] = checkLanguages(root);
  assert.ok(indexed > 0 && working >= indexed);
});

test('governed modules accept their approved languages', () => {
  fixture(({ repository, write, run }) => {
    write('apps/mobile/src/features/access/state.ts');
    write('apps/mobile/src/app/index.tsx');
    write('services/kael-core/agent.ts');
    write('supabase/migrations/20261103100000_example.sql');
    write('supabase/database.types.ts');
    write('scripts/example-tool.mjs');
    write('.githooks/pre-commit', '#!/bin/sh\nexit 0\n');
    write('docs/example.md', '# Example\n');
    run(['add', '--all']);
    assert.deepEqual(checkLanguages(repository), [8, 8]);
  });
});

for (const [label, file, content] of [
  ['Python source in the Kael core', 'services/kael-core/model.py', 'print(1)\n'],
  ['a Python notebook in the Kael core', 'services/kael-core/analysis.ipynb', '{}\n'],
  ['Rust source in the mobile app', 'apps/mobile/src/native.rs', 'fn main() {}\n'],
  ['plain JavaScript in the mobile app', 'apps/mobile/src/legacy.js', 'export {};\n'],
  ['TypeScript in repository tooling', 'scripts/new-tool.ts', 'export {};\n'],
  ['SQL outside the database module', 'services/kael-core/query.sql', 'select 1;\n'],
  ['TypeScript at an unowned path', 'packages/shared/index.ts', 'export {};\n'],
  ['Swift in the mobile app', 'apps/mobile/src/Bridge.swift', 'import UIKit\n'],
  ['a Python requirements manifest', 'services/kael-core/requirements.txt', 'torch\n'],
  ['a Cargo manifest', 'services/kael-core/Cargo.toml', '[package]\n'],
  ['a Go module manifest', 'services/gateway/go.mod', 'module gateway\n'],
  ['an extensionless Python script', 'scripts/run-model', '#!/usr/bin/env python3\nprint(1)\n'],
  ['an extensionless Ruby hook', '.githooks/post-merge', '#!/usr/bin/ruby\nputs 1\n'],
  ['a Python source file in documentation', 'docs/example.py', 'print(1)\n'],
]) {
  test(`reject ${label} in the working tree and in an index-only snapshot`, () => {
    fixture(({ repository, write, run }) => {
      write(file, content);
      assert.throws(() => checkLanguages(repository), /working .*not approved/);
      run(['add', '--', file]);
      rmSync(path.join(repository, file));
      assert.throws(() => checkLanguages(repository), /index .*not approved/);
    });
  });
}

test('reject runtime setup actions for unapproved languages in workflows', () => {
  for (const action of ['actions/setup-python@v5', 'dtolnay/rust-toolchain@stable', 'actions/setup-go@v5', 'astral-sh/setup-uv@v6']) {
    fixture(({ repository, write }) => {
      write('.github/workflows/build.yml', `name: build\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${action}\n`);
      assert.throws(() => checkLanguages(repository), /not approved for an unowned path/);
    });
  }
});

test('accept workflows that only use Node.js and checkout actions', () => {
  fixture(({ repository, write, run }) => {
    write('.github/workflows/build.yml', 'name: build\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n      - uses: actions/setup-node@v6\n');
    run(['add', '--all']);
    assert.deepEqual(checkLanguages(repository), [1, 1]);
  });
});

test('a justified, architecture-approved exception permits a conditional language only where granted', () => {
  const policy = { ...actualPolicy, exceptions: [...actualPolicy.exceptions, approvedException] };
  fixture(({ repository, write, run }) => {
    write('services/kael-ml/train.py', 'print(1)\n');
    write('services/kael-ml/requirements.txt', 'torch\n');
    run(['add', '--all']);
    assert.deepEqual(checkLanguages(repository), [3, 3]);
    write('services/kael-core/other.py', 'print(1)\n');
    assert.throws(() => checkLanguages(repository), /services\/kael-core\/other\.py: python is not approved/);
  }, policy);
});

test('reject a stale exception that nothing uses', () => {
  fixture(({ repository }) => {
    assert.throws(() => checkLanguages(repository), /stale exception for python at services\/kael-ml\//);
  }, { ...actualPolicy, exceptions: [...actualPolicy.exceptions, approvedException] });
});

for (const [label, transform] of [
  ['unknown top-level key', policy => ({ ...policy, extra: true })],
  ['missing top-level key', ({ exceptions, ...policy }) => policy],
  ['unsupported version', policy => ({ ...policy, version: 2 })],
  ['conditional language granted to a module', policy => ({ ...policy, modules: [...policy.modules, { path: 'ml/', domain: 'Machine learning', languages: ['python'] }] })],
  ['unknown language in a module', policy => ({ ...policy, modules: [...policy.modules, { path: 'ml/', domain: 'Machine learning', languages: ['cobol'] }] })],
  ['duplicated module path', policy => ({ ...policy, modules: [...policy.modules, policy.modules[0]] })],
  ['unsafe module path', policy => ({ ...policy, modules: [...policy.modules, { path: '../x/', domain: 'Escape', languages: ['typescript'] }] })],
  ['duplicated extension', policy => ({ ...policy, languages: { ...policy.languages, scripting: ['.ts'] } })],
  ['exception without justification', policy => ({ ...policy, exceptions: [...policy.exceptions, { ...approvedException, justification: 'needed' }] })],
  ['exception without approval', policy => ({ ...policy, exceptions: [...policy.exceptions, { ...approvedException, approval: '' }] })],
  ['exception with extra fields', policy => ({ ...policy, exceptions: [...policy.exceptions, { ...approvedException, extra: 1 }] })],
  ['exception with traversal', policy => ({ ...policy, exceptions: [...policy.exceptions, { ...approvedException, path: '../services/' }] })],
  ['exception for an unknown language', policy => ({ ...policy, exceptions: [...policy.exceptions, { ...approvedException, language: 'cobol' }] })],
  ['manifest mapped to an unknown language', policy => ({ ...policy, manifests: { ...policy.manifests, 'build.zig': 'zig' } })],
]) {
  test(`reject a malformed policy with ${label}`, () => {
    fixture(({ repository }) => {
      assert.throws(() => checkLanguages(repository), /language-policy\.json/);
    }, transform(actualPolicy));
  });
}

test('reject a missing policy file and invalid JSON', () => {
  fixture(({ repository }) => {
    rmSync(path.join(repository, policyPath));
    assert.throws(() => checkLanguages(repository), /language policy is missing/);
  });
  fixture(({ repository, write }) => {
    write(policyPath, '{ invalid');
    assert.throws(() => checkLanguages(repository), /invalid JSON/);
  });
});

test('package scripts keep the language gate mandatory in the aggregate check', () => {
  const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  assert.equal(scripts['check:languages'], 'node scripts/check-languages.mjs');
  assert.equal(scripts.check.split(' && ').filter(command => command === 'npm run check:languages').length, 1);
  assert.ok(scripts['verify:negative'].includes('scripts/check-languages.test.mjs'));
});
