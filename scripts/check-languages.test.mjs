import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
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
    for (const file of actualPolicy.kaelBackend.legacyTypeScript) {
      write(file, readFileSync(path.join(root, file)));
    }
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
    write('services/kael-core/agent.rs');
    write('supabase/migrations/20261103100000_example.sql');
    write('supabase/database.types.ts');
    write('scripts/example-tool.mjs');
    write('.githooks/pre-commit', '#!/bin/sh\nexit 0\n');
    write('docs/example.md', '# Example\n');
    run(['add', '--all']);
    const expected = actualPolicy.kaelBackend.legacyTypeScript.length + 8;
    assert.deepEqual(checkLanguages(repository), [expected, expected]);
  });
});

test('Kael backend accepts Rust, Python and Go in the declared preference order', () => {
  fixture(({ repository, write, run }) => {
    write('services/kael-core/Cargo.toml', '[package]\nname = "kael-core"\nversion = "0.1.0"\n');
    write('services/kael-core/src/engine.rs', 'pub fn run() {}\n');
    write('services/kael-core/pyproject.toml', '[project]\nname = "kael-core"\n');
    write('services/kael-core/src/model.py', 'def run():\n    return None\n');
    write('services/kael-core/go.mod', 'module example.invalid/kael-core\n');
    write('services/kael-core/src/tool.go', 'package kaelcore\n');
    write('supabase/functions/kael/runtime.rs', 'pub fn serve() {}\n');
    run(['add', '--all']);
    const [indexed, working] = checkLanguages(repository);
    assert.ok(indexed > actualPolicy.kaelBackend.legacyTypeScript.length);
    assert.equal(working, indexed);
  });
});

test('Kael backend module ownership cannot be shadowed by nested modules', () => {
  for (const backendPath of actualPolicy.kaelBackend.paths) {
    const policy = {
      ...actualPolicy,
      modules: [...actualPolicy.modules, {
        path: `${backendPath}src/experimental/`,
        domain: 'Nested Kael module',
        languages: ['typescript'],
      }],
    };
    fixture(({ repository }) => {
      assert.throws(() => checkLanguages(repository), /Kael backend modules cannot be nested/);
    }, policy);
  }
});

test('new TypeScript or JavaScript sources cannot join the legacy Kael backend file set', () => {
  for (const [file, content] of [
    ['services/kael-core/src/new-runtime.ts', 'export {};\n'],
    ['services/kael-core/src/new-tool.js', 'export {};\n'],
    ['supabase/functions/kael/agent.ts', 'export {};\n'],
    ['supabase/functions/kael/agent.js', 'export {};\n'],
  ]) {
    fixture(({ repository, write, run }) => {
      write(file, content);
      assert.throws(() => checkLanguages(repository), /not approved for Kael Backend/);
      run(['add', '--', file]);
      rmSync(path.join(repository, file));
      assert.throws(() => checkLanguages(repository), /not approved for Kael Backend/);
    });
  }
});

test('remove a legacy Kael TypeScript source only after updating the legacy boundary', () => {
  fixture(({ repository }) => {
    rmSync(path.join(repository, actualPolicy.kaelBackend.legacyTypeScript[0]));
    assert.throws(() => checkLanguages(repository), /legacy TypeScript entry is missing from working/);
  });
});

for (const [label, file, content] of [
  ['Rust source in the mobile app', 'apps/mobile/src/native.rs', 'fn main() {}\n'],
  ['plain JavaScript in the mobile app', 'apps/mobile/src/legacy.js', 'export {};\n'],
  ['TypeScript in repository tooling', 'scripts/new-tool.ts', 'export {};\n'],
  ['SQL outside the database module', 'services/kael-core/query.sql', 'select 1;\n'],
  ['TypeScript at an unowned path', 'packages/shared/index.ts', 'export {};\n'],
  ['Swift in the mobile app', 'apps/mobile/src/Bridge.swift', 'import UIKit\n'],
  ['Python source in another NestScout service', 'services/ordinary/model.py', 'print(1)\n'],
  ['a Python requirements manifest in another NestScout service', 'services/ordinary/requirements.txt', 'torch\n'],
  ['a Cargo manifest outside Kael', 'services/ordinary/Cargo.toml', '[package]\n'],
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
      assert.throws(() => checkLanguages(repository), /requires matching Kael backend source/);
    });
  }
});

test('accept workflows that only use Node.js and checkout actions', () => {
  fixture(({ repository, write, run }) => {
    write('.github/workflows/build.yml', 'name: build\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v6\n      - uses: actions/setup-node@v6\n');
    run(['add', '--all']);
    const expected = actualPolicy.kaelBackend.legacyTypeScript.length + 1;
    assert.deepEqual(checkLanguages(repository), [expected, expected]);
  });
});

test('Kael setup actions require actual matching backend source, never a manifest alone', () => {
  const source = { rust: 'services/kael-core/src/engine.rs', python: 'services/kael-core/src/engine.py', go: 'services/kael-core/src/engine.go' };
  const code = { rust: 'pub fn run() {}\n', python: 'def run():\n    return None\n', go: 'package kaelcore\n' };
  const action = { rust: 'dtolnay/rust-toolchain@stable', python: 'actions/setup-python@v5', go: 'actions/setup-go@v5' };
  const manifests = Object.entries(actualPolicy.manifests).filter(([, language]) => actualPolicy.kaelBackend.priority.includes(language));
  for (const [manifest, language] of manifests) {
    test(`reject ${manifest} without matching ${language} source for its setup action`, () => {
      fixture(({ repository, write, run }) => {
        write('.github/workflows/kael.yml', `name: kael\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${action[language]}\n`);
        write(`services/kael-core/${manifest}`, 'fixture manifest\n');
        run(['add', '--all']);
        assert.throws(() => checkLanguages(repository), /requires matching Kael backend source/);
      });
    });
  }
  for (const [setup, language] of Object.entries(actualPolicy.setupActions).filter(([, language]) => actualPolicy.kaelBackend.priority.includes(language))) {
    test(`accept ${setup} only with matching ${language} Kael backend source`, () => {
      fixture(({ repository, write, run }) => {
        write('.github/workflows/kael.yml', `name: kael\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${setup}@v1\n`);
        write(source[language], code[language]);
        run(['add', '--all']);
        const [indexed, working] = checkLanguages(repository);
        assert.equal(working, indexed);
      });
    });
  }
});

test('a justified, architecture-approved exception permits a conditional language only where granted', () => {
  const policy = { ...actualPolicy, exceptions: [...actualPolicy.exceptions, approvedException] };
  fixture(({ repository, write, run }) => {
    write('services/kael-ml/train.py', 'print(1)\n');
    write('services/kael-ml/requirements.txt', 'torch\n');
    run(['add', '--all']);
    const expected = actualPolicy.kaelBackend.legacyTypeScript.length + 3;
    assert.deepEqual(checkLanguages(repository), [expected, expected]);
    write('services/kael-core/other.ts', 'export {};\n');
    assert.throws(() => checkLanguages(repository), /services\/kael-core\/other\.ts: typescript is not approved/);
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
  ['unsupported version', policy => ({ ...policy, version: 3 })],
  ['conditional language granted to a module', policy => ({
    ...policy,
    conditionalLanguages: ['python'],
    modules: [...policy.modules, { path: 'ml/', domain: 'Machine learning', languages: ['python'] }],
  })],
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
  ['Kael backend language priority changed', policy => ({
    ...policy,
    kaelBackend: { ...policy.kaelBackend, priority: ['python', 'rust', 'go'] },
    modules: policy.modules.map(module => policy.kaelBackend.paths.includes(module.path)
      ? { ...module, languages: ['python', 'rust', 'go'] } : module),
  })],
  ['Kael legacy TypeScript allowlist broadened by an exception', policy => ({
    ...policy,
    exceptions: [...policy.exceptions, { ...approvedException, path: 'services/kael-core/src/' }],
  })],
  ['legacy TypeScript path outside Kael', policy => ({
    ...policy,
    kaelBackend: { ...policy.kaelBackend, legacyTypeScript: [...policy.kaelBackend.legacyTypeScript, 'services/ordinary/old.ts'] },
  })],
  ['legacy TypeScript path duplicated', policy => ({
    ...policy,
    kaelBackend: { ...policy.kaelBackend, legacyTypeScript: [...policy.kaelBackend.legacyTypeScript, policy.kaelBackend.legacyTypeScript[0]] },
  })],
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

test('package scripts and hosted CI keep language enforcement mandatory', () => {
  const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  assert.equal(scripts['check:languages'], 'node scripts/check-languages.mjs');
  assert.equal(scripts.check.split(' && ').filter(command => command === 'npm run check:languages').length, 1);
  assert.ok(scripts['verify:negative'].includes('scripts/check-languages.test.mjs'));

  const workflow = parseDocument(readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')).toJS();
  const steps = workflow.jobs['repository-checks'].steps;
  assert.equal(steps.some(step => step.run === 'npm run check:languages'), false);
  assert.ok(steps.some(step => step.run === 'npm run check'));
  assert.ok(steps.some(step => step.run === 'npm run verify:negative'));
});
