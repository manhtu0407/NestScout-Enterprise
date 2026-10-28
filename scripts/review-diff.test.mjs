import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

const baseManifest = JSON.stringify({
  name: 'fixture', private: true,
  scripts: { check: 'node --test scripts/order-state.test.mjs', 'verify:negative': 'node -e ""' },
  dependencies: {},
}, null, 2) + '\n';
const rootManifest = (scripts, extra = {}) => `${JSON.stringify({ ...JSON.parse(baseManifest), scripts: { ...JSON.parse(baseManifest).scripts, ...scripts }, ...extra }, null, 2)}\n`;
const mobileManifest = (jest = {}, scripts = {}) => `${JSON.stringify({
  name: '@fixture/mobile', private: true, scripts: { test: 'jest --ci', ...scripts },
  jest: { preset: 'jest-expo', testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'], ...jest },
}, null, 2)}\n`;

const baseFiles = {
  '.gitignore': 'node_modules/\n',
  'package.json': baseManifest,
  'apps/mobile/package.json': mobileManifest(),
  'apps/mobile/tsconfig.json': `${JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }, null, 2)}\n`,
  'scripts/tools.json': '{"pin":"a"}\n',
  'scripts/order-state.mjs': orderState,
  'scripts/order-state.test.mjs': orderStateTest,
  'apps/mobile/src/lib/currency.ts': "export const currency = 'd';\n",
  'apps/mobile/src/lib/format-total.ts': formatTotal,
  'apps/mobile/src/lib/format-total.test.ts': formatTotalTest,
  'apps/mobile/src/lib/consumer.ts': "import { formatTotal } from './format-total';\n\nexport const label = formatTotal(100);\n",
  'apps/mobile/src/lib/aliased.ts': "import { currency } from '@/lib/currency';\n\nexport const aliasedCurrency = currency;\n",
  'apps/mobile/src/lib/names-a.ts': 'export const tariff = 1;\n',
  'apps/mobile/src/lib/names-b.ts': 'export const tariff = 2;\n',
  'apps/mobile/src/lib/use-tariff.ts': "import { tariff } from './names-a';\n\nexport const used = tariff;\n",
  'apps/mobile/src/lib/permissions.ts': "export const allowedRoles = ['client'];\n",
  'apps/mobile/src/features/access/mode/preferred-mode-store.ts': "export const allowed = ['client'];\n",
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
const keyDirectory = mkdtempSync(path.join(directory, 'keys-'));
function signingKey(principal) {
  const file = path.join(keyDirectory, principal.replace(/\W/g, '-'));
  const made = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', principal, '-f', file], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  const publicKey = readFileSync(`${file}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ');
  return { principal, file, entry: `${principal} namespaces="git" ${publicKey}` };
}
const reviewerKey = signingKey('reviewer@example.invalid');
const authorKey = signingKey('fixture@example.invalid');
const strangerKey = signingKey('stranger@example.invalid');

let signerLists = 0;
function trustSigners(repository, keys) {
  const allowed = path.join(keyDirectory, `allowed-${signerLists++}`);
  writeFileSync(allowed, `${keys.map(key => key.entry).join('\n')}\n`);
  git(repository, ['config', 'gpg.format', 'ssh']);
  git(repository, ['config', 'gpg.ssh.allowedSignersFile', allowed]);
}
const verdictMessage = (verdict = 'PASS', evidence = ['apps/mobile/src/lib/format-total.ts:3 extracted helper']) => JSON.stringify({ codeHealth: { verdict, evidence } });
function attest(repository, key, { message = verdictMessage(), tag = 'review/head', kind = 'signed' } = {}) {
  const identity = ['-c', 'user.name=Reviewer', '-c', `user.email=${key.principal}`, '-c', `user.signingkey=${key.file}`];
  const flags = { signed: ['-s', '-m', message], unsigned: ['-a', '-m', message], lightweight: [] }[kind];
  git(repository, [...identity, 'tag', ...flags, tag]);
  return tag;
}
const defaultChange = api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n');
function attestedRepository({ trusted = [reviewerKey], signer = reviewerKey, mutate = defaultChange, prepare = () => {}, ...tagOptions } = {}) {
  const { repository, api } = fixture(mutate);
  trustSigners(repository, trusted);
  prepare(repository, api);
  return { repository, api, tag: attest(repository, signer, tagOptions) };
}
const attestedReview = ({ review: options = {}, ...settings } = {}) => {
  const { repository, tag } = attestedRepository(settings);
  return reviewDiff({ repository, base: 'main', scope, reviewer: tag, ...options });
};
const review = (mutate, options = {}) => {
  const { repository } = fixture(mutate);
  return reviewDiff({ repository, base: 'main', scope, ...options });
};
const verdicts = packet => Object.fromEntries(Object.entries(packet.dimensions).map(([name, dimension]) => [name, dimension.verdict]));
const change = (file, from, to) => api => api.write(file, baseFiles[file].replace(from, to));

test('a behavior-preserving refactor with passing evidence and a verified attestation passes every dimension', () => {
  const packet = attestedReview({
    mutate: api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal.replace('(cents / 100).toFixed(2)', 'toDollars(cents)') + 'const toDollars = (cents: number) => (cents / 100).toFixed(2);\n'),
    review: { run: ['check', 'verify:negative'] },
  });
  assert.deepEqual(verdicts(packet), { correctness: PASS, codeHealth: PASS, deadCodeSafety: PASS, scope: PASS, testIntegrity: PASS });
  assert.equal(packet.verdict, PASS);
  assert.equal(packet.reviewer.attested, true);
  assert.equal(packet.reviewer.signer, reviewerKey.principal);
  assert.match(packet.reviewer.key, /^SHA256:/);
  assert.match(packet.head.sha, /^[0-9a-f]{40}$/);
});

test('without a reviewer or command evidence the overall verdict is never PASS', () => {
  const packet = review(defaultChange);
  assert.equal(packet.dimensions.correctness.verdict, INSUFFICIENT);
  assert.equal(packet.dimensions.codeHealth.verdict, INSUFFICIENT);
  assert.equal(packet.verdict, INSUFFICIENT);
  assert.equal(packet.reviewer.attested, false);
});

test('a self-declared independent verdict is not evidence', () => {
  const declared = { reviewer: 'second session', independent: true, codeHealth: { verdict: 'PASS', evidence: ['apps/mobile/src/lib/format-total.ts:3 extracted helper'] } };
  const packet = review(defaultChange, { run: ['check', 'verify:negative'], reviewer: declared });
  assert.equal(packet.dimensions.codeHealth.verdict, INSUFFICIENT);
  assert.match(packet.dimensions.codeHealth.findings.join('\n'), /must name a signed git tag; a self-declared verdict is not evidence/);
  assert.equal(packet.reviewer.attested, false);
  assert.equal(packet.verdict, INSUFFICIENT);
});

test('an attestation that git cannot verify or that is not independent of the change cannot lift code health above insufficient evidence', () => {
  const signedCommit = (repository, api) => {
    api.write('apps/mobile/src/lib/unit-label.ts', "export const unitLabel = 'd';\n");
    git(repository, ['add', '--all']);
    git(repository, ['-c', `user.signingkey=${reviewerKey.file}`, 'commit', '-S', '--quiet', '-m', 'refactor: signed change']);
  };
  const cases = [
    ['signed by a key the verifier does not trust', { trusted: [authorKey], signer: strangerKey }, /was not verified against the allowed signers/],
    ['an unsigned annotated tag', { kind: 'unsigned' }, /was not verified against the allowed signers/],
    ['a lightweight tag', { kind: 'lightweight' }, /is not an annotated, signed tag/],
    ['signed by the author of the reviewed commits', { trusted: [authorKey], signer: authorKey }, /authored, committed or signed the reviewed commits/],
    ['signed with a key that signed the reviewed commits', { prepare: signedCommit }, /authored, committed or signed the reviewed commits/],
    ['a message that is not a verdict', { message: 'looks good to me' }, /is not a JSON verdict/],
    ['a verdict outside the allowed set', { message: verdictMessage('APPROVED') }, /must be PASS, FAIL or INSUFFICIENT_EVIDENCE/],
  ];
  for (const [label, settings, pattern] of cases) {
    const packet = attestedReview(settings);
    assert.equal(packet.dimensions.codeHealth.verdict, INSUFFICIENT, label);
    assert.match(packet.dimensions.codeHealth.findings.join('\n'), pattern, label);
    assert.equal(packet.reviewer.attested, false, label);
    assert.notEqual(packet.verdict, PASS, label);
  }
  const { repository, api } = attestedRepository();
  api.write('apps/mobile/src/lib/unit-label.ts', "export const unitLabel = 'd';\n");
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--quiet', '-m', 'refactor: later change']);
  const stale = reviewDiff({ repository, base: 'main', scope, reviewer: 'review/head' });
  assert.match(stale.dimensions.codeHealth.findings.join('\n'), /covers [0-9a-f]{12}, not the frozen head [0-9a-f]{12}/);
  assert.equal(stale.reviewer.attested, false);
  assert.equal(reviewDiff({ repository, base: 'main', scope, reviewer: 'review/missing' }).reviewer.attested, false);
});

test('a verified PASS still needs evidence that resolves to lines at the head, and a verified FAIL fails the review', () => {
  const unresolved = attestedReview({ message: verdictMessage('PASS', ['apps/mobile/src/lib/format-total.ts:99', 'apps/mobile/src/lib/missing.ts:1']) });
  assert.equal(unresolved.reviewer.attested, true);
  assert.equal(unresolved.dimensions.codeHealth.verdict, INSUFFICIENT);
  assert.match(unresolved.dimensions.codeHealth.findings.join('\n'), /does not resolve to existing lines at the head: apps\/mobile\/src\/lib\/format-total\.ts:99, apps\/mobile\/src\/lib\/missing\.ts:1/);
  const bare = attestedReview({ message: verdictMessage('PASS', []) });
  assert.match(bare.dimensions.codeHealth.findings.join('\n'), /needs file and line evidence/);
  const undecided = attestedReview({ message: verdictMessage('INSUFFICIENT_EVIDENCE', []) });
  assert.match(undecided.dimensions.codeHealth.findings.join('\n'), /could not reach a verdict/);
  const failing = attestedReview({ message: verdictMessage('FAIL', ['apps/mobile/src/lib/format-total.ts:1 leaks currency']) });
  assert.equal(failing.dimensions.codeHealth.verdict, FAIL);
  assert.equal(failing.verdict, FAIL);
});

test('a deliberate test weakening is caught: skipped, deleted, removed or altered assertions and tests', () => {
  const cases = [
    ['skipped test', change('apps/mobile/src/lib/format-total.test.ts', "it('formats fractions'", "it.skip('formats fractions'"), FAIL, /disabled tests increased/],
    ['focused test', change('apps/mobile/src/lib/format-total.test.ts', "it('formats fractions'", "it.only('formats fractions'"), FAIL, /disabled tests increased/],
    ['node test skip option', change('scripts/order-state.test.mjs', "test('a valid transition succeeds', () => {", "test('a valid transition succeeds', { skip: true }, () => {"), FAIL, /disabled tests increased/],
    ['deleted test file', api => api.remove('apps/mobile/src/lib/format-total.test.ts'), FAIL, /test file deleted/],
    ['deleted assertion', change('apps/mobile/src/lib/format-total.test.ts', "    expect(formatTotal(1234)).toBe('d12.34');\n", ''), INSUFFICIENT, /assertion\(s\) removed, altered or moved behind control flow/],
    ['altered expected result', change('apps/mobile/src/lib/format-total.test.ts', "toBe('d12.34')", "toBe('d12.35')"), INSUFFICIENT, /assertion\(s\) removed, altered or moved behind control flow/],
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

test('real disabled tests are still caught beside literal fixtures and in code positions', () => {
  const literals = "const fixtureText = \"it.skip('a')\";\n";
  const cases = [
    ['real skip beside a literal', appendTo('scripts/order-state.test.mjs', `${literals}test.skip('quote " in the name', () => {});\n`), /from 0 to 1/],
    ['skip inside a template substitution', appendTo('scripts/order-state.test.mjs', "const run = `${test.skip('n', () => {})}`;\n"), /from 0 to 1/],
    ['skip with a reason string', appendTo('scripts/order-state.test.mjs', "test('n', { skip: 'later' }, () => {});\n"), /from 0 to 1/],
    ['typed TypeScript skip', appendTo('apps/mobile/src/lib/format-total.test.ts', `${literals}it.skip('typed', (): void => {});\n`), /from 0 to 1/],
    ['focused suite', appendTo('apps/mobile/src/lib/format-total.test.ts', "describe.only('focused', () => {});\n"), /from 0 to 1/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const packet = review(mutate, { scope: ['scripts/**', 'apps/mobile/src/lib/**'] });
    assert.equal(packet.dimensions.testIntegrity.verdict, FAIL, label);
    assert.match(disabledCount(packet), pattern, label);
  }
  const added = review(appendTo('scripts/order-state.test.mjs', `${literals}test.skip('x', () => {});\n`), { scope: ['scripts/**'] });
  assert.equal(added.dimensions.testIntegrity.findings.filter(line => /disabled tests increased/.test(line)).length, 1);
});

const extraTypedTest = "it('extra', () => {\n  expect(formatTotal(1)).toBe('d0.01');\n});\n";
const extraNodeTest = "test('extra', () => {\n  assert.equal(1, 1);\n});\n";

test('disabled tests are found through computed access, chained modifiers, aliases, options and context calls even when new tests offset the count', () => {
  const typed = 'apps/mobile/src/lib/format-total.test.ts';
  const node = 'scripts/order-state.test.mjs';
  const cases = [
    ['computed skip', typed, "it['skip']('hidden', () => {});\n"],
    ['concurrent skip', typed, "it.concurrent.skip('hidden', () => {});\n"],
    ['skipped table', typed, "xit.each([1])('hidden', () => {});\n"],
    ['skip through destructuring', typed, "const { skip } = it;\nskip('hidden', () => {});\n"],
    ['skip through a renamed destructuring', typed, "const { skip: park } = it;\npark('hidden', () => {});\n"],
    ['alias of the test function', typed, "const run = it;\nrun.skip('hidden', () => {});\n"],
    ['stored skip', typed, "const quarantined = it.skip;\nquarantined('hidden', () => {});\n"],
    ['dynamic modifier', typed, "describe[process.env.MODE]('hidden', () => {});\n"],
    ['conditional skip option', node, "test('hidden', { skip: process.platform !== 'none' }, () => {});\n"],
    ['skip option from a variable', node, "const parked = true;\ntest('hidden', { skip: parked }, () => {});\n"],
    ['todo option', node, "test('hidden', { todo: true }, () => {});\n"],
    ['context skip', node, "test('hidden', t => {\n  t.skip();\n});\n"],
    ['context todo with a reason', node, "test('hidden', async context => {\n  context.todo('later');\n});\n"],
  ];
  for (const [label, file, text] of cases) {
    const packet = review(appendTo(file, `${text}${file === typed ? extraTypedTest : extraNodeTest}`), { scope: ['scripts/**', 'apps/mobile/src/lib/**'] });
    assert.equal(packet.dimensions.testIntegrity.verdict, FAIL, label);
    assert.match(disabledCount(packet), /disabled tests increased/, label);
    assert.notEqual(packet.verdict, PASS, label);
  }
  const harmless = [
    ['an explicit false option', node, "test('visible', { skip: false }, () => {});\n"],
    ['a table of enabled tests', typed, "it.each([1, 2])('visible %d', value => {\n  expect(formatTotal(value)).toBeDefined();\n});\n"],
    ['a member named like a modifier on another object', typed, "const registry = { skip: 1 };\nexpect(registry.skip).toBe(1);\n"],
  ];
  for (const [label, file, text] of harmless) {
    const packet = review(appendTo(file, text), { scope: ['scripts/**', 'apps/mobile/src/lib/**'] });
    assert.equal(packet.dimensions.testIntegrity.verdict, PASS, label);
  }
});

test('a test file renamed to a name that no test runner selects counts as a deleted test', () => {
  const renamed = review(api => api.run(['mv', 'apps/mobile/src/lib/format-total.test.ts', 'apps/mobile/src/lib/format-total-checks.ts']));
  assert.equal(renamed.dimensions.testIntegrity.verdict, FAIL);
  assert.match(renamed.dimensions.testIntegrity.findings.join('\n'), /format-total\.test\.ts: test file renamed to apps\/mobile\/src\/lib\/format-total-checks\.ts/);
  assert.notEqual(renamed.verdict, PASS);

  const stillTest = review(api => api.run(['mv', 'apps/mobile/src/lib/format-total.test.ts', 'apps/mobile/src/lib/format-totals.test.ts']));
  assert.equal(stillTest.dimensions.testIntegrity.verdict, PASS);
});

const wholeExpectation = [
  "import { formatTotal } from './format-total';",
  '',
  "describe('formatTotal', () => {",
  "  it('formats whole amounts', () => {",
  "    const wholeExpected = 'd5.00';",
  '    expect(formatTotal(500))',
  '      .toBe(wholeExpected);',
  '  });',
  "  it('formats fractions', () => {",
  "    const wholeExpected = 'd12.34';",
  '    expect(formatTotal(1234)).toBe(wholeExpected);',
  '  });',
  '});',
  '',
].join('\n');
const assertTotalHelper = "import { formatTotal } from './format-total';\n\nexport function checkTotal(cents: number, expected: string): void {\n  expect(formatTotal(cents)).toBe(expected);\n}\n";
const withBase = (file, base, head) => {
  const { repository } = fixture(api => api.write(file, head), { files: { [file]: base } });
  return reviewDiff({ repository, base: 'main', scope });
};

test('assertions that are weakened without changing a matched line are reported: control flow, matchers, constants and shared helpers', () => {
  const file = 'apps/mobile/src/lib/format-total.test.ts';
  const cases = [
    ['early return', change(file, "    expect(formatTotal(500)).toBe('d5.00');", "    return;\n    expect(formatTotal(500)).toBe('d5.00');")],
    ['conditional return', change(file, "    expect(formatTotal(500)).toBe('d5.00');", "    if (process.env.FAST) return;\n    expect(formatTotal(500)).toBe('d5.00');")],
    ['wrapped in an unreachable branch', change(file, "    expect(formatTotal(500)).toBe('d5.00');", "    if (Date.now() < 0) {\n      expect(formatTotal(500)).toBe('d5.00');\n    }")],
    ['short-circuited', change(file, "    expect(formatTotal(500)).toBe('d5.00');", "    process.env.SLOW && expect(formatTotal(500)).toBe('d5.00');")],
    ['moved into a catch handler', change(file, "    expect(formatTotal(500)).toBe('d5.00');", "    try {\n      formatTotal(500);\n    } catch {\n      expect(formatTotal(500)).toBe('d5.00');\n    }")],
    ['looped over nothing', change(file, "    expect(formatTotal(500)).toBe('d5.00');", "    for (const unused of []) {\n      expect(formatTotal(500)).toBe('d5.00');\n    }")],
  ];
  for (const [label, mutate] of cases) {
    const packet = review(mutate);
    assert.equal(packet.dimensions.testIntegrity.verdict, INSUFFICIENT, label);
    assert.match(packet.dimensions.testIntegrity.findings.join('\n'), /assertion\(s\) removed, altered or moved behind control flow/, label);
    assert.notEqual(packet.verdict, PASS, label);
  }

  const multiLine = withBase(file, wholeExpectation, wholeExpectation.replace('      .toBe(wholeExpected);', '      .toBeDefined();'));
  assert.equal(multiLine.dimensions.testIntegrity.verdict, INSUFFICIENT, 'multi-line matcher weakened');
  assert.match(multiLine.dimensions.testIntegrity.findings.join('\n'), /1 assertion\(s\) removed, altered or moved/);

  const constant = withBase(file, wholeExpectation, wholeExpectation.replace("const wholeExpected = 'd5.00';", 'const wholeExpected = formatTotal(500);'));
  assert.equal(constant.dimensions.testIntegrity.verdict, INSUFFICIENT, 'expected value made self-referential');

  const helper = 'apps/mobile/src/lib/assert-total.ts';
  const loosened = withBase(helper, assertTotalHelper, assertTotalHelper.replace('  expect(formatTotal(cents)).toBe(expected);\n', '  formatTotal(cents);\n'));
  assert.equal(loosened.dimensions.testIntegrity.verdict, INSUFFICIENT, 'assertion removed from a shared helper');
  assert.match(loosened.dimensions.testIntegrity.findings.join('\n'), /assert-total\.ts: 1 assertion\(s\) removed/);
});

test('behavior-neutral edits to tests are not assertion findings: formatting, added tests with the same local names, moved blocks', () => {
  const file = 'apps/mobile/src/lib/format-total.test.ts';
  const reflowed = withBase(file, wholeExpectation, wholeExpectation.replace('    expect(formatTotal(500))\n      .toBe(wholeExpected);', '    expect(formatTotal(500)).toBe(wholeExpected);'));
  assert.equal(reflowed.dimensions.testIntegrity.verdict, PASS, 'reformatted assertion');

  const added = withBase(file, wholeExpectation, wholeExpectation.replace('});\n', "  it('formats zero', () => {\n    const wholeExpected = 'd0.00';\n    expect(formatTotal(0)).toBe(wholeExpected);\n  });\n});\n"));
  assert.equal(added.dimensions.testIntegrity.verdict, PASS, 'new test with a repeated local name');

  const untouched = review(api => api.write('apps/mobile/src/lib/format-total.ts', formatTotal + 'export const unitLabel = currency;\n'));
  assert.equal(untouched.dimensions.testIntegrity.verdict, PASS);
});

test('a test file that cannot be parsed is reported as not comparable and never passes', () => {
  const packet = review(appendTo('scripts/order-state.test.mjs', "const fixtureText = \"it.skip('a')\";\nconst broken = ;\ntest.skip('x', () => {});\n"), { scope: ['scripts/**'] });
  assert.equal(packet.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(packet.dimensions.testIntegrity.findings.join('\n'), /scripts\/order-state\.test\.mjs: tests could not be compared: Invalid syntax/);
  assert.notEqual(packet.verdict, PASS);
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
  assert.doesNotMatch(packet.dimensions.testIntegrity.findings.join('\n'), /removed, altered or moved/);
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
  assert.match(hidden.dimensions.testIntegrity.findings.join('\n'), /1 assertion\(s\) removed, altered or moved behind control flow/);
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
    const packet = review(mutate, { scope: ['scripts/order-state.mjs'], run: ['check', 'verify:negative'] });
    assert.equal(packet.dimensions.correctness.verdict, FAIL, label);
    assert.match(packet.dimensions.correctness.findings.join('\n'), /npm run check exited 1/, label);
    assert.equal(packet.verdict, FAIL, label);
  }
});

test('known limit: a behavior change that no executed command covers is not visible to the deterministic dimensions', () => {
  const packet = review(change('apps/mobile/src/lib/currency.ts', "'d'", "'x'"), { run: ['check', 'verify:negative'] });
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
  const referencedFindings = referenced.dimensions.deadCodeSafety.findings.join('\n');
  assert.match(referencedFindings, /currency is still referenced at apps\/mobile\/src\/lib\/(?:aliased|format-total)\.ts/);
  assert.match(referencedFindings, /format-total\.ts:1: \.\/currency no longer resolves because apps\/mobile\/src\/lib\/currency\.ts was removed/);

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

const lib = 'apps/mobile/src/lib/';
const reviewWith = (files, mutate, options = {}) => {
  const { repository } = fixture(mutate, { files });
  return reviewDiff({ repository, base: 'main', scope, ...options });
};

test('a removed export is not treated as moved because another file exports the same name', () => {
  const dropTariff = api => api.write(`${lib}names-a.ts`, 'export const other = 1;\n');
  const consume = (api, specifier) => api.write(`${lib}use-tariff.ts`, `import { tariff } from '${specifier}';\n\nexport const used = tariff;\n`);
  const cases = [
    ['a consumer still imports the removed export', dropTariff, FAIL, /export tariff was removed but is still referenced at apps\/mobile\/src\/lib\/use-tariff\.ts/],
    ['a consumer re-pointed to a pre-existing export of the same name', api => { dropTariff(api); consume(api, './names-b'); }, INSUFFICIENT, /already exported a different tariff before this change/],
    ['a consumer re-pointed to a new export with another declaration', api => { dropTariff(api); api.write(`${lib}names-c.ts`, 'export const tariff = 3;\n'); consume(api, './names-c'); }, INSUFFICIENT, /whose declaration differs from the removed one/],
    ['a consumer re-pointed to a module that does not export the name', api => { dropTariff(api); api.write(`${lib}names-d.ts`, 'export const other = 4;\n'); consume(api, './names-d'); }, FAIL, /which does not export it/],
    ['a consumer that loads the whole module', api => { dropTariff(api); api.write(`${lib}use-tariff.ts`, "import * as rates from './names-a';\n\nexport const used = rates.tariff;\n"); }, INSUFFICIENT, /loads the whole module/],
    ['a mention that is not an import', api => { dropTariff(api); api.write(`${lib}use-tariff.ts`, 'export const used = 1;\nexport const label = "tariff";\n'); }, INSUFFICIENT, /mentions tariff without importing it/],
  ];
  for (const [label, mutate, expected, pattern] of cases) {
    const packet = review(mutate);
    assert.equal(packet.dimensions.deadCodeSafety.verdict, expected, label);
    assert.match(packet.dimensions.deadCodeSafety.findings.join('\n'), pattern, label);
    assert.notEqual(packet.verdict, PASS, label);
  }

  const identicalMove = review(api => { dropTariff(api); api.write(`${lib}names-c.ts`, 'export const tariff = 1;\n'); consume(api, './names-c'); });
  assert.equal(identicalMove.dimensions.deadCodeSafety.verdict, PASS, 'the same declaration moved to a new module');
  const packageImport = review(api => { dropTariff(api); consume(api, 'date-fns'); });
  assert.equal(packageImport.dimensions.deadCodeSafety.verdict, PASS, 'a consumer that takes the name from a package');
});

test('a renamed or moved module that leaves an importer unresolved fails, and a complete rename passes', () => {
  const rename = (from, to, finish = () => {}) => api => {
    api.write(`${lib}${to}`, baseFiles[`${lib}${from}`]);
    api.remove(`${lib}${from}`);
    finish(api);
  };
  const completeRename = rename('currency.ts', 'money.ts', api => {
    api.write(`${lib}format-total.ts`, formatTotal.replace("'./currency'", "'./money'"));
    api.write(`${lib}aliased.ts`, baseFiles[`${lib}aliased.ts`].replace('@/lib/currency', '@/lib/money'));
  });

  const broken = review(rename('currency.ts', 'money.ts'));
  assert.equal(broken.dimensions.deadCodeSafety.verdict, FAIL);
  const brokenFindings = broken.dimensions.deadCodeSafety.findings.join('\n');
  assert.match(brokenFindings, /apps\/mobile\/src\/lib\/format-total\.ts:1: \.\/currency no longer resolves because apps\/mobile\/src\/lib\/currency\.ts was renamed to apps\/mobile\/src\/lib\/money\.ts/);
  assert.match(brokenFindings, /apps\/mobile\/src\/lib\/aliased\.ts:1: @\/lib\/currency no longer resolves/);
  assert.notEqual(broken.verdict, PASS);

  const moved = review(rename('format-total.ts', 'nested/format-total.ts'));
  assert.equal(moved.dimensions.deadCodeSafety.verdict, FAIL);
  const movedFindings = moved.dimensions.deadCodeSafety.findings.join('\n');
  assert.match(movedFindings, /nested\/format-total\.ts:1: \.\/currency no longer resolves because apps\/mobile\/src\/lib\/nested\/format-total\.ts moved from apps\/mobile\/src\/lib\/format-total\.ts/);
  assert.match(movedFindings, /consumer\.ts:1: \.\/format-total no longer resolves because apps\/mobile\/src\/lib\/format-total\.ts was renamed to/);

  const complete = review(completeRename);
  assert.equal(complete.dimensions.deadCodeSafety.verdict, PASS, 'a rename that updates every importer');

  const dynamic = reviewWith({ [`${lib}loader.ts`]: 'export const load = (name: string) => import(name);\n' }, completeRename);
  assert.equal(dynamic.dimensions.deadCodeSafety.verdict, INSUFFICIENT);
  assert.match(dynamic.dimensions.deadCodeSafety.findings.join('\n'), /loader\.ts:1: dynamic require or import cannot be resolved statically/);

  const mentioned = reviewWith({ 'apps/mobile/metadata.json': '{"entry":"apps/mobile/src/lib/currency"}\n' }, completeRename);
  assert.equal(mentioned.dimensions.deadCodeSafety.verdict, INSUFFICIENT);
  assert.match(mentioned.dimensions.deadCodeSafety.findings.join('\n'), /currency\.ts was renamed to apps\/mobile\/src\/lib\/money\.ts but its path is still mentioned at apps\/mobile\/metadata\.json/);
});

test('authorization boundaries, role gates, tool pins and security configuration need owner review', () => {
  const widenedGate = api => api.write('apps/mobile/src/features/access/mode/preferred-mode-store.ts', "export const allowed = ['client', 'worker', 'admin'];\n");
  const cases = [
    ['the access mode gate is widened', widenedGate, /preferred-mode-store\.ts is in a high-risk area/],
    ['a tool pin is changed', api => api.write('scripts/tools.json', '{"pin":"b"}\n'), /scripts\/tools\.json is in a high-risk area/],
    ['the package registry is redirected', api => api.write('.npmrc', 'registry=https://example.invalid/\n'), /\.npmrc is in a high-risk area/],
    ['tests are ignored by version control', api => api.write('.gitignore', 'node_modules/\n*.test.ts\n'), /\.gitignore is in a high-risk area/],
    ['the compiler path mapping changes', change('apps/mobile/tsconfig.json', './src/*', './src/lib/*'), /tsconfig\.json is in a high-risk area/],
    ['a permission list is widened outside the listed paths', change(`${lib}permissions.ts`, "['client']", "['client', 'worker']"), /permissions\.ts: changed lines mention "roles"/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const packet = review(mutate, { scope: ['**'] });
    assert.equal(packet.dimensions.scope.verdict, INSUFFICIENT, label);
    assert.match(packet.dimensions.scope.findings.join('\n'), pattern, label);
    assert.notEqual(packet.verdict, PASS, label);
  }
  const attested = attestedReview({ mutate: widenedGate, review: { scope: ['apps/mobile/**'], run: ['check', 'verify:negative'] } });
  assert.equal(attested.reviewer.attested, true);
  assert.equal(attested.dimensions.correctness.verdict, PASS);
  assert.equal(attested.dimensions.scope.verdict, INSUFFICIENT);
  assert.equal(attested.verdict, INSUFFICIENT);

  assert.equal(review(defaultChange).dimensions.scope.verdict, PASS, 'an ordinary refactor outside every protected area');
});

test('test selection is compared at both revisions whether or not the root manifest changed', () => {
  const mobile = 'apps/mobile/package.json';
  const covered = 'apps/mobile/src/lib/format-total.test.ts';
  const unselected = file => new RegExp(`${file.replaceAll('.', '\\.')}: still exists but no script or jest configuration selects it any more`);
  const narrowing = [
    ['the test match narrowed to nothing', mobileManifest({ testMatch: ['<rootDir>/src/**/nothing.test.ts'] })],
    ['an ignore pattern covering the tests', mobileManifest({ testPathIgnorePatterns: ['/src/lib/'] })],
    ['a test regex that matches no test', mobileManifest({ testMatch: undefined, testRegex: 'nothing\\.test\\.ts$' })],
  ];
  for (const [label, manifest] of narrowing) {
    const packet = review(api => api.write(mobile, manifest), { scope: [mobile] });
    assert.deepEqual(packet.files.map(file => file.path), [mobile], label);
    assert.equal(packet.dimensions.testIntegrity.verdict, FAIL, label);
    assert.match(packet.dimensions.testIntegrity.findings.join('\n'), unselected(covered), label);
  }

  const flagged = review(api => api.write(mobile, mobileManifest({}, { test: 'jest --ci --passWithNoTests' })), { scope: [mobile] });
  assert.equal(flagged.dimensions.scope.verdict, FAIL);
  assert.match(flagged.dimensions.scope.findings.join('\n'), /apps\/mobile\/package\.json script test no longer runs: jest --ci/);

  const neutered = [
    ['a root test script replaced', { 'test:mobile': 'npm run test --workspace apps/mobile' }, { 'test:mobile': 'echo skipped' }, /script test:mobile no longer runs: npm run test --workspace apps\/mobile/],
    ['a root lint script replaced', { 'lint:markdown': 'markdownlint-cli2' }, { 'lint:markdown': 'true' }, /script lint:markdown no longer runs: markdownlint-cli2/],
  ];
  for (const [label, before, after, pattern] of neutered) {
    const { repository } = fixture(api => api.write('package.json', rootManifest(after)), { files: { 'package.json': rootManifest(before) } });
    const packet = reviewDiff({ repository, base: 'main', scope: ['package.json'] });
    assert.equal(packet.dimensions.scope.verdict, FAIL, label);
    assert.match(packet.dimensions.scope.findings.join('\n'), pattern, label);
  }

  const droppedFromScripts = review(api => api.write('package.json', rootManifest({ check: 'node -e ""' })), { scope: ['package.json'] });
  assert.equal(droppedFromScripts.dimensions.scope.verdict, FAIL);
  assert.equal(droppedFromScripts.dimensions.testIntegrity.verdict, FAIL);
  assert.match(droppedFromScripts.dimensions.testIntegrity.findings.join('\n'), unselected('scripts/order-state.test.mjs'));

  const unregistered = review(api => api.write('scripts/new-check.test.mjs', newTest), { scope: ['scripts/**'] });
  assert.equal(unregistered.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(unregistered.dimensions.testIntegrity.findings.join('\n'), /scripts\/new-check\.test\.mjs: no script or jest configuration selects this test file/);

  const unevaluable = review(api => api.write(mobile, mobileManifest({ roots: ['<rootDir>/src'] })), { scope: [mobile] });
  assert.equal(unevaluable.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(unevaluable.dimensions.testIntegrity.findings.join('\n'), /uses patterns this review cannot evaluate and changed/);

  const configuration = reviewWith({ 'apps/mobile/jest.config.js': 'module.exports = {};\n' }, api => api.write('apps/mobile/jest.config.js', 'module.exports = { testMatch: [] };\n'), { scope: ['apps/mobile/**'] });
  assert.equal(configuration.dimensions.testIntegrity.verdict, INSUFFICIENT);
  assert.match(configuration.dimensions.testIntegrity.findings.join('\n'), /jest\.config\.js: test discovery configuration changed/);
  assert.equal(configuration.dimensions.scope.verdict, INSUFFICIENT);

  const broadened = review(api => api.write(mobile, mobileManifest({ testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.check.ts'] })), { scope: [mobile] });
  assert.equal(broadened.dimensions.testIntegrity.verdict, PASS, 'a test match that only gains patterns');
  const added = review(api => api.write(`${lib}format-totals.test.ts`, formatTotalTest));
  assert.equal(added.dimensions.testIntegrity.verdict, PASS, 'a new test that the jest configuration selects');
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
