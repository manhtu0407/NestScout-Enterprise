import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { git } from './repository-files.mjs';
import { exportedNames, FAIL, INSUFFICIENT, PASS, reviewDiff } from './review-diff.mjs';
import { root } from './tool-path.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-review-diff-'));
after(() => {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  rmSync(directory, { recursive: true });
});

const orderState = [
  "const transitions = { pending: ['accepted', 'cancelled'], accepted: ['completed', 'cancelled'], completed: [], cancelled: [] };",
  'export function transition(order, next, actor) {',
  "  if (actor.role !== 'owner') throw new Error('forbidden');",
  "  if (!transitions[order.state]?.includes(next)) throw new Error('invalid transition');",
  '  return { ...order, state: next };',
  '}',
  'export function applyOnce(ledger, key, amount) {',
  '  if (ledger.seen.has(key)) return ledger;',
  '  return { seen: new Set([...ledger.seen, key]), total: ledger.total + amount };',
  '}',
  '',
].join('\n');

const orderStateTest = [
  "import assert from 'node:assert/strict';",
  "import { test } from 'node:test';",
  "import { applyOnce, transition } from './order-state.mjs';",
  "test('a completed order cannot return to pending', () => {",
  "  assert.throws(() => transition({ state: 'completed' }, 'pending', { role: 'owner' }), /invalid transition/);",
  '});',
  "test('only the owner role may change state', () => {",
  "  assert.throws(() => transition({ state: 'pending' }, 'accepted', { role: 'client' }), /forbidden/);",
  '});',
  "test('the same key is applied once', () => {",
  "  const once = applyOnce({ seen: new Set(), total: 0 }, 'k', 5);",
  "  assert.equal(applyOnce(once, 'k', 5).total, 5);",
  '});',
  "test('a valid transition succeeds', () => {",
  "  assert.equal(transition({ state: 'pending' }, 'accepted', { role: 'owner' }).state, 'accepted');",
  '});',
  '',
].join('\n');

const formatTotal = [
  "import { currency } from './currency';",
  '',
  'export function formatTotal(cents: number): string {',
  '  return `${currency}${(cents / 100).toFixed(2)}`;',
  '}',
  '',
].join('\n');

const formatTotalTest = [
  "import { formatTotal } from './format-total';",
  '',
  "describe('formatTotal', () => {",
  "  it('formats whole amounts', () => {",
  "    expect(formatTotal(500)).toBe('d5.00');",
  '  });',
  "  it('formats fractions', () => {",
  "    expect(formatTotal(1234)).toBe('d12.34');",
  '  });',
  '});',
  '',
].join('\n');

const baseFiles = {
  '.gitignore': 'node_modules/\n',
  'package.json': JSON.stringify({
    name: 'fixture', private: true,
    scripts: { check: 'node --test scripts/order-state.test.mjs', 'verify:negative': 'node -e ""' },
    dependencies: {},
  }, null, 2) + '\n',
  'scripts/order-state.mjs': orderState,
  'scripts/order-state.test.mjs': orderStateTest,
  'apps/mobile/src/lib/currency.ts': "export const currency = 'd';\n",
  'apps/mobile/src/lib/format-total.ts': formatTotal,
  'apps/mobile/src/lib/format-total.test.ts': formatTotalTest,
  'apps/mobile/src/lib/consumer.ts': "import { formatTotal } from './format-total';\n\nexport const label = formatTotal(100);\n",
  'apps/mobile/src/lib/standalone-helper.ts': "export const standalone = 1;\n",
  'apps/mobile/src/lib/legacy-names.ts': "export const legacyName = 'a';\nexport const retiredName = 'b';\nexport const usedName = 'c';\n",
  'apps/mobile/src/lib/use-names.ts': "import { usedName, retiredName } from './legacy-names';\n\nexport const names = [usedName, retiredName];\n",
  'apps/mobile/src/app/settings.tsx': 'export default function Settings() {\n  return null;\n}\n',
};

function fixture(mutate, { commit = true, files = {} } = {}) {
  const repository = mkdtempSync(path.join(directory, 'repository-'));
  const run = args => git(repository, args);
  const api = {
    write(file, text) {
      mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
      writeFileSync(path.join(repository, file), text);
    },
    remove(file) {
      rmSync(path.join(repository, file));
    },
    run,
  };
  run(['init', '--quiet', '--initial-branch=main']);
  run(['config', 'user.name', 'Fixture']);
  run(['config', 'user.email', 'fixture@example.invalid']);
  run(['config', 'core.autocrlf', 'false']);
  for (const [file, text] of Object.entries({ ...baseFiles, ...files })) api.write(file, text);
  run(['add', '--all']);
  run(['commit', '--quiet', '-m', 'chore: establish fixture']);
  run(['switch', '--quiet', '-c', 'claude/change']);
  mutate(api);
  if (commit) {
    run(['add', '--all']);
    run(['commit', '--quiet', '-m', 'refactor: change under review']);
  }
  return { repository, api };
}

const scope = ['apps/mobile/src/lib/**'];
const independentReviewer = { reviewer: 'second session', independent: true, codeHealth: { verdict: 'PASS', evidence: ['apps/mobile/src/lib/format-total.ts:3 extracted helper'] } };
const review = (mutate, options = {}) => {
  const { repository } = fixture(mutate);
  return reviewDiff({ repository, base: 'main', scope, ...options });
};
const verdicts = packet => Object.fromEntries(Object.entries(packet.dimensions).map(([name, dimension]) => [name, dimension.verdict]));
const change = (file, from, to) => api => api.write(file, baseFiles[file].replace(from, to));

test('a behavior-preserving refactor with passing evidence and an independent reviewer passes every dimension', () => {
  const packet = review(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal.replace('(cents / 100).toFixed(2)', 'toDollars(cents)') + 'const toDollars = (cents: number) => (cents / 100).toFixed(2);\n'),
    { run: ['check', 'verify:negative'], reviewer: independentReviewer });
  assert.deepEqual(verdicts(packet), { correctness: PASS, codeHealth: PASS, deadCodeSafety: PASS, scope: PASS, testIntegrity: PASS });
  assert.equal(packet.verdict, PASS);
  assert.equal(packet.reviewerIndependent, true);
  assert.match(packet.head.sha, /^[0-9a-f]{40}$/);
});

test('without a reviewer or command evidence the overall verdict is never PASS', () => {
  const packet = review(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'));
  assert.equal(packet.dimensions.correctness.verdict, INSUFFICIENT);
  assert.equal(packet.dimensions.codeHealth.verdict, INSUFFICIENT);
  assert.equal(packet.verdict, INSUFFICIENT);
});

test('a reviewer that is not independent cannot lift code health above insufficient evidence', () => {
  const packet = review(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'),
    { run: ['check', 'verify:negative'], reviewer: { ...independentReviewer, independent: false } });
  assert.equal(packet.dimensions.codeHealth.verdict, INSUFFICIENT);
  assert.match(packet.dimensions.codeHealth.findings.join('\n'), /not independent/);
  assert.equal(packet.reviewerIndependent, false);
  assert.equal(packet.verdict, INSUFFICIENT);
});

test('a reviewer PASS without file and line evidence is insufficient, and a reviewer FAIL fails the review', () => {
  const mutate = api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n');
  const bare = review(mutate, { reviewer: { independent: true, codeHealth: { verdict: 'PASS' } } });
  assert.equal(bare.dimensions.codeHealth.verdict, INSUFFICIENT);
  const failing = review(mutate, { reviewer: { independent: true, codeHealth: { verdict: 'FAIL', evidence: ['format-total.ts:1 leaks currency'] } } });
  assert.equal(failing.dimensions.codeHealth.verdict, FAIL);
  assert.equal(failing.verdict, FAIL);
});

test('a deliberate test weakening is caught: skipped, deleted, removed or altered assertions and tests', () => {
  const cases = [
    ['skipped test', change('apps/mobile/src/lib/format-total.test.ts', "it('formats fractions'", "it.skip('formats fractions'"), FAIL, /disabled tests increased/],
    ['focused test', change('apps/mobile/src/lib/format-total.test.ts', "it('formats fractions'", "it.only('formats fractions'"), FAIL, /disabled tests increased/],
    ['node test skip option', change('scripts/order-state.test.mjs', "test('a valid transition succeeds', () => {", "test('a valid transition succeeds', { skip: true }, () => {"), FAIL, /disabled tests increased/],
    ['deleted test file', api => api.remove('apps/mobile/src/lib/format-total.test.ts'), FAIL, /test file deleted/],
    ['deleted assertion', change('apps/mobile/src/lib/format-total.test.ts', "    expect(formatTotal(1234)).toBe('d12.34');\n", ''), INSUFFICIENT, /assertion line\(s\) removed or altered/],
    ['altered expected result', change('apps/mobile/src/lib/format-total.test.ts', "toBe('d12.34')", "toBe('d12.35')"), INSUFFICIENT, /assertion line\(s\) removed or altered/],
    ['removed test case', change('apps/mobile/src/lib/format-total.test.ts', "  it('formats fractions', () => {\n    expect(formatTotal(1234)).toBe('d12.34');\n  });\n", ''), INSUFFICIENT, /test declarations decreased/],
  ];
  for (const [label, mutate, expected, pattern] of cases) {
    const packet = review(mutate);
    assert.equal(packet.dimensions.testIntegrity.verdict, expected, label);
    assert.match(packet.dimensions.testIntegrity.findings.join('\n'), pattern, label);
    assert.notEqual(packet.verdict, PASS, label);
  }
});

const appendTo = (file, text) => api => api.write(file, baseFiles[file] + text);
const disabledCount = packet => packet.dimensions.testIntegrity.findings.join('\n');

test('skip markers inside strings, templates and comments are not disabled tests in JavaScript and TypeScript', () => {
  const javaScript = [
    "const quoted = \"it.skip('a', () => {}); skip: true\";",
    "const single = 'describe.only(x)';",
    "const code = `describe.only('a', () => { it.todo('b'); })`;",
    "const mixed = `${'x'} test.skip('y') ${single}`;",
    "/* it.skip('commented') */",
    "// test.only('commented')",
    '',
  ].join('\n');
  const typed = [
    "const quoted: string = \"it.skip('a')\";",
    "const code: string = `describe.only('a') ${quoted} it.todo('b')`;",
    "/* xit('commented', () => {}) */",
    '',
  ].join('\n');
  for (const [label, mutate] of [
    ['mjs', appendTo('scripts/order-state.test.mjs', javaScript)],
    ['ts', appendTo('apps/mobile/src/lib/format-total.test.ts', typed)],
  ]) {
    const packet = review(mutate, { scope: ['scripts/**', 'apps/mobile/src/lib/**'] });
    assert.equal(packet.dimensions.testIntegrity.verdict, PASS, label);
  }
});

test('real disabled tests are still caught beside literal fixtures, in code positions, and in unparseable files', () => {
  const literals = "const fixtureText = \"it.skip('a')\";\n";
  const cases = [
    ['real skip beside a literal', appendTo('scripts/order-state.test.mjs', `${literals}test.skip('quote " in the name', () => {});\n`), /from 0 to 1/],
    ['skip inside a template substitution', appendTo('scripts/order-state.test.mjs', "const run = `${test.skip('n', () => {})}`;\n"), /from 0 to 1/],
    ['skip with a reason string', appendTo('scripts/order-state.test.mjs', "test('n', { skip: 'later' }, () => {});\n"), /from 0 to 1/],
    ['typed TypeScript skip', appendTo('apps/mobile/src/lib/format-total.test.ts', `${literals}it.skip('typed', (): void => {});\n`), /from 0 to 1/],
    ['focused suite', appendTo('apps/mobile/src/lib/format-total.test.ts', "describe.only('focused', () => {});\n"), /from 0 to 1/],
    ['unparseable file falls back to the raw count', appendTo('scripts/order-state.test.mjs', `${literals}const broken = ;\n`), /from 0 to 1/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const packet = review(mutate, { scope: ['scripts/**', 'apps/mobile/src/lib/**'] });
    assert.equal(packet.dimensions.testIntegrity.verdict, FAIL, label);
    assert.match(disabledCount(packet), pattern, label);
  }
  const added = review(appendTo('scripts/order-state.test.mjs', `${literals}test.skip('x', () => {});\n`), { scope: ['scripts/**'] });
  assert.equal(added.dimensions.testIntegrity.findings.filter(line => /disabled tests increased/.test(line)).length, 1);
});

const registryTests = ['scripts/order-state.test.mjs'];
const registryManifest = (tests, suffix = '') => `${JSON.stringify({
  ...JSON.parse(baseFiles['package.json']),
  scripts: { ...JSON.parse(baseFiles['package.json']).scripts, 'verify:foundation': `node scripts/run-tests.mjs ${tests.join(' ')}${suffix}` },
}, null, 2)}\n`;
const registryPin = (tests, suffix = '') => `import assert from 'node:assert/strict';\nimport manifest from '../package.json' with { type: 'json' };\n\nassert.equal(manifest.scripts['verify:foundation'], 'node scripts/run-tests.mjs ${tests.join(' ')}${suffix}');\n`;
const registryFiles = { 'package.json': registryManifest(registryTests), 'scripts/registry-pin.test.mjs': registryPin(registryTests) };
const newTest = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n\ntest('registered', () => {\n  assert.equal(1, 1);\n});\n";
const registryReview = (mutate, scopeGlobs = ['package.json', 'scripts/**']) => {
  const { repository } = fixture(mutate, { files: registryFiles });
  return reviewDiff({ repository, base: 'main', scope: scopeGlobs });
};

test('registering an existing new test file in the script and its pin needs owner review but is not a scope violation', () => {
  const tests = [...registryTests, 'scripts/new-check.test.mjs'];
  const packet = registryReview(api => {
    api.write('scripts/new-check.test.mjs', newTest);
    api.write('package.json', registryManifest(tests));
    api.write('scripts/registry-pin.test.mjs', registryPin(tests));
  });
  assert.equal(packet.dimensions.scope.verdict, INSUFFICIENT);
  assert.match(packet.dimensions.scope.findings.join('\n'), /registers test file\(s\) scripts\/new-check\.test\.mjs; owner review must confirm/);
  assert.equal(packet.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(packet.dimensions.testIntegrity.findings.join('\n'), /assertion extended with registered test file\(s\) scripts\/new-check\.test\.mjs/);
  assert.doesNotMatch(packet.dimensions.testIntegrity.findings.join('\n'), /removed or altered/);
  assert.notEqual(packet.verdict, PASS);
  assert.notEqual(packet.verdict, FAIL);
});

test('registration changes that drop, hide or invent a test are scope or test-integrity failures', () => {
  const extended = [...registryTests, 'scripts/new-check.test.mjs'];
  const cases = [
    ['registers a file that does not exist', api => {
      api.write('package.json', registryManifest([...registryTests, 'scripts/ghost.test.mjs']));
      api.write('scripts/registry-pin.test.mjs', registryPin([...registryTests, 'scripts/ghost.test.mjs']));
    }, /does not exist at the head/],
    ['appends a flag instead of a test file', api => {
      api.write('package.json', registryManifest(registryTests, ' --passWithNoTests'));
    }, /script verify:foundation no longer runs/],
    ['drops an existing registered test', api => {
      api.write('scripts/new-check.test.mjs', newTest);
      api.write('package.json', registryManifest(['scripts/new-check.test.mjs']));
      api.write('scripts/registry-pin.test.mjs', registryPin(['scripts/new-check.test.mjs']));
    }, /script verify:foundation no longer runs: node scripts\/run-tests\.mjs scripts\/order-state\.test\.mjs/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const packet = registryReview(mutate);
    assert.equal(packet.dimensions.scope.verdict, FAIL, label);
    assert.match(packet.dimensions.scope.findings.join('\n'), pattern, label);
    assert.equal(packet.verdict, FAIL, label);
  }
  const ghostPin = registryReview(api => {
    api.write('scripts/registry-pin.test.mjs', registryPin([...registryTests, 'scripts/ghost.test.mjs']));
  });
  assert.equal(ghostPin.dimensions.testIntegrity.verdict, FAIL);
  assert.match(ghostPin.dimensions.testIntegrity.findings.join('\n'), /does not exist at the head/);
  const hidden = registryReview(api => {
    api.write('scripts/registry-pin.test.mjs', registryPin(registryTests, ' --no-fail'));
  });
  assert.equal(hidden.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(hidden.dimensions.testIntegrity.findings.join('\n'), /1 assertion line\(s\) removed or altered/);
  const pinOnly = registryReview(api => {
    api.write('scripts/new-check.test.mjs', newTest);
    api.write('scripts/registry-pin.test.mjs', registryPin(extended));
  });
  assert.equal(pinOnly.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(pinOnly.dimensions.testIntegrity.findings.join('\n'), /assertion extended with registered test file\(s\)/);
});

test('adding a new passing test and leaving existing assertions alone is not a test-integrity finding', () => {
  const packet = review(api => api.write('apps/mobile/src/lib/format-total.test.ts', formatTotalTest.replace('});\n', "  it('formats zero', () => {\n    expect(formatTotal(0)).toBe('d0.00');\n  });\n});\n")));
  assert.equal(packet.dimensions.testIntegrity.verdict, PASS);
});

test('controlled behavioral regressions in an isolated fixture fail through the recorded command results', () => {
  const regressions = [
    ['wrong state transition', change('scripts/order-state.mjs', 'completed: []', "completed: ['pending']")],
    ['changed authorization check', change('scripts/order-state.mjs', "actor.role !== 'owner'", "actor.role === 'worker'")],
    ['broken idempotency', change('scripts/order-state.mjs', '  if (ledger.seen.has(key)) return ledger;\n', '')],
  ];
  for (const [label, mutate] of regressions) {
    const packet = review(mutate, { scope: ['scripts/order-state.mjs'], run: ['check', 'verify:negative'], reviewer: independentReviewer });
    assert.equal(packet.dimensions.correctness.verdict, FAIL, label);
    assert.match(packet.dimensions.correctness.findings.join('\n'), /npm run check exited 1/, label);
    assert.equal(packet.verdict, FAIL, label);
  }
});

test('known limit: a behavior change that no existing test covers is not visible to the deterministic dimensions', () => {
  const packet = review(change('scripts/order-state.mjs', "accepted: ['completed', 'cancelled']", "accepted: ['completed', 'cancelled', 'pending']"),
    { scope: ['scripts/order-state.mjs'], run: ['check', 'verify:negative'] });
  assert.equal(packet.dimensions.correctness.verdict, PASS);
  assert.equal(packet.dimensions.scope.verdict, PASS);
  assert.equal(packet.dimensions.testIntegrity.verdict, PASS);
  assert.equal(packet.dimensions.deadCodeSafety.verdict, PASS);
  assert.equal(packet.verdict, INSUFFICIENT);
});

test('removals are never approved without ownership evidence, and still-referenced removals fail', () => {
  const unreferenced = review(api => api.remove('apps/mobile/src/lib/standalone-helper.ts'));
  assert.equal(unreferenced.dimensions.deadCodeSafety.verdict, INSUFFICIENT);
  assert.match(unreferenced.dimensions.deadCodeSafety.findings.join('\n'), /uncertain usage means do not delete/);

  const referenced = review(api => api.remove('apps/mobile/src/lib/currency.ts'));
  assert.equal(referenced.dimensions.deadCodeSafety.verdict, FAIL);
  assert.match(referenced.dimensions.deadCodeSafety.findings.join('\n'), /still referenced at apps\/mobile\/src\/lib\/format-total\.ts/);

  const route = review(api => api.remove('apps/mobile/src/app/settings.tsx'), { scope: ['apps/mobile/src/**'] });
  assert.equal(route.dimensions.deadCodeSafety.verdict, INSUFFICIENT);
  assert.equal(route.dimensions.scope.verdict, INSUFFICIENT);
  assert.match(route.dimensions.scope.findings.join('\n'), /high-risk area/);
});

test('removed exports are classified as referenced, unreferenced or moved', () => {
  const rewrite = text => api => api.write('apps/mobile/src/lib/legacy-names.ts', text);
  const referenced = review(rewrite("export const legacyName = 'a';\nexport const usedName = 'c';\n"));
  assert.equal(referenced.dimensions.deadCodeSafety.verdict, FAIL);
  assert.match(referenced.dimensions.deadCodeSafety.findings.join('\n'), /export retiredName was removed but is still referenced/);

  const unreferenced = review(rewrite("export const retiredName = 'b';\nexport const usedName = 'c';\n"));
  assert.equal(unreferenced.dimensions.deadCodeSafety.verdict, INSUFFICIENT);

  const moved = review(api => {
    api.write('apps/mobile/src/lib/legacy-names.ts', "export const legacyName = 'a';\nexport const usedName = 'c';\n");
    api.write('apps/mobile/src/lib/retired-names.ts', "export const retiredName = 'b';\n");
    api.write('apps/mobile/src/lib/use-names.ts', "import { usedName } from './legacy-names';\nimport { retiredName } from './retired-names';\n\nexport const names = [usedName, retiredName];\n");
  });
  assert.equal(moved.dimensions.deadCodeSafety.verdict, PASS);
});

test('export extraction handles declarations, lists, aliases and type exports', () => {
  const names = exportedNames('export const a = 1;\nexport async function b() {}\nexport type C = string;\nexport { d, e as f };\nexport type { G };\nexport default function () {}\n');
  assert.deepEqual([...names].sort(), ['C', 'a', 'b', 'd', 'f', 'G'].sort());
});

test('scope: files outside the declared scope fail, a missing scope is insufficient, protected areas need owner review', () => {
  const outside = review(api => api.write('scripts/order-state.mjs', orderState + 'export const extra = 1;\n'));
  assert.equal(outside.dimensions.scope.verdict, FAIL);
  assert.match(outside.dimensions.scope.findings.join('\n'), /scripts\/order-state\.mjs is outside the declared scope/);

  const undeclared = review(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'), { scope: [] });
  assert.equal(undeclared.dimensions.scope.verdict, INSUFFICIENT);

  const policy = review(api => api.write('AGENTS.md', '# changed\n'), { scope: ['AGENTS.md'] });
  assert.equal(policy.dimensions.scope.verdict, INSUFFICIENT);
  assert.match(policy.dimensions.scope.findings.join('\n'), /AGENTS\.md is in a high-risk area/);
});

test('scope: dependency changes need review and a gate removed from the aggregate check fails', () => {
  const manifest = JSON.parse(baseFiles['package.json']);
  const manifestText = value => `${JSON.stringify(value, null, 2)}\n`;
  const dependency = review(api => api.write('package.json', manifestText({ ...manifest, dependencies: { left: '1.0.0' } })), { scope: ['package.json'] });
  assert.equal(dependency.dimensions.scope.verdict, INSUFFICIENT);
  assert.match(dependency.dimensions.scope.findings.join('\n'), /changed dependencies/);

  const stronger = { ...manifest, scripts: { ...manifest.scripts, check: 'node --test scripts/order-state.test.mjs && npm run verify:negative' } };
  const { repository } = fixture(api => api.write('package.json', manifestText(manifest)), { files: { 'package.json': manifestText(stronger) } });
  const dropped = reviewDiff({ repository, base: 'main', scope: ['package.json'] });
  assert.equal(dropped.dimensions.scope.verdict, FAIL);
  assert.match(dropped.dimensions.scope.findings.join('\n'), /script check no longer runs: npm run verify:negative/);
});

test('agent artifacts: disposable names and AI attribution in added lines fail', () => {
  const named = review(api => api.write('apps/mobile/src/lib/notes.ts', 'export const x = 1;\n'));
  assert.equal(named.dimensions.testIntegrity.verdict, FAIL);
  assert.match(named.dimensions.testIntegrity.findings.join('\n'), /Disposable document\/source name/);

  const credited = review(api => api.write('apps/mobile/src/lib/format-total.ts', `${formatTotal}// Co-Authored-By: Claude <noreply@anthropic.com>\n`));
  assert.equal(credited.dimensions.testIntegrity.verdict, FAIL);
  assert.match(credited.dimensions.testIntegrity.findings.join('\n'), /AI attribution/);
});

test('command evidence is bound to the frozen head and a clean working tree', () => {
  const { repository, api } = fixture(inner => inner.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'));
  api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const dirty = 1;\n');
  const dirty = reviewDiff({ repository, base: 'main', scope, run: ['check', 'verify:negative'] });
  assert.equal(dirty.dimensions.correctness.verdict, INSUFFICIENT);
  assert.match(dirty.dimensions.correctness.findings.join('\n'), /working tree is dirty/);
  assert.deepEqual(dirty.commands, []);

  api.run(['checkout', '--quiet', '--', '.']);
  const earlier = reviewDiff({ repository, base: 'main', head: 'main', scope, run: ['check'] });
  assert.equal(earlier.dimensions.correctness.verdict, INSUFFICIENT);
  assert.throws(() => reviewDiff({ repository, base: 'main', scope, run: ['not-a-script'] }), /no script named not-a-script/);
});

test('recorded commands find the npm CLI from the Node installation when not started through npm', () => {
  const saved = process.env.npm_execpath;
  delete process.env.npm_execpath;
  try {
    const packet = review(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'), { run: ['check', 'verify:negative'] });
    assert.equal(packet.dimensions.correctness.verdict, PASS);
    assert.deepEqual(packet.commands.map(command => command.exitCode), [0, 0]);
  } finally {
    if (saved !== undefined) process.env.npm_execpath = saved;
  }
});

test('the reviewed diff is frozen to resolved SHAs, so later commits do not change it', () => {
  const { repository, api } = fixture(inner => inner.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'));
  const frozen = api.run(['rev-parse', 'HEAD']).trim();
  const before = reviewDiff({ repository, base: 'main', head: frozen, scope });
  api.remove('apps/mobile/src/lib/format-total.test.ts');
  api.run(['add', '--all']);
  api.run(['commit', '--quiet', '-m', 'test: later change']);
  const after = reviewDiff({ repository, base: 'main', head: frozen, scope });
  assert.deepEqual(after.files, before.files);
  assert.equal(after.head.sha, frozen);
  assert.equal(after.dimensions.testIntegrity.verdict, PASS);
  const advanced = reviewDiff({ repository, base: 'main', head: 'HEAD', scope });
  assert.equal(advanced.dimensions.testIntegrity.verdict, FAIL);
});

test('the command line prints the packet and exits 2 for insufficient evidence and 1 for a failure', () => {
  const insufficient = fixture(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'));
  const run = (repository, ...extra) => spawnSync(process.execPath, [path.join(root, 'scripts/review-diff.mjs'), '--repository', repository, '--base', 'main', '--scope', 'apps/mobile/src/lib/**', ...extra], { encoding: 'utf8' });
  const first = run(insufficient.repository);
  assert.equal(first.status, 2);
  assert.equal(JSON.parse(first.stdout).verdict, INSUFFICIENT);
  const failing = fixture(api => api.remove('apps/mobile/src/lib/format-total.test.ts'));
  const second = run(failing.repository);
  assert.equal(second.status, 1);
  assert.equal(JSON.parse(second.stdout).dimensions.testIntegrity.verdict, FAIL);
  const unknown = run(insufficient.repository, '--unknown', 'value');
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown argument --unknown/);
});
