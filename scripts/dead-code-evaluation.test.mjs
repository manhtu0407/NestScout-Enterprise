import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { root } from './tool-path.mjs';

const knip = path.join(root, 'node_modules/knip/bin/knip.js');
const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-dead-code-'));
after(() => {
  assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
  rmSync(directory, { recursive: true });
});

const lines = (...parts) => `${parts.join('\n')}\n`;
const stubPackages = ['jest', 'jest-expo', 'expo', 'expo-router', 'react', 'used-lib', 'left-pad', 'typescript'];

const files = {
  'package.json': JSON.stringify({
    name: 'fixture', private: true, main: 'expo-router/entry',
    scripts: { tool: 'node scripts/tool.mjs', test: 'jest' },
    dependencies: { expo: '1.0.0', 'expo-router': '1.0.0', react: '1.0.0', 'left-pad': '1.0.0', 'used-lib': '1.0.0' },
    devDependencies: { jest: '1.0.0', 'jest-expo': '1.0.0', typescript: '1.0.0' },
    jest: { preset: 'jest-expo', setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'], moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' } },
  }, null, 2),
  'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true, jsx: 'react-native', paths: { '@/*': ['./src/*'] } }, include: ['src/**/*'] }),
  'app.json': JSON.stringify({ expo: { name: 'f', slug: 'f', plugins: ['expo-router', './plugins/with-extra.js'] } }),
  'plugins/with-extra.js': lines('module.exports = (config) => config;'),
  'src/app/_layout.tsx': lines("import '../lib/task';", 'export default function Layout() { return null; }'),
  'src/app/index.tsx': lines(
    "import 'expo';",
    "import 'react';",
    "import { usedFn, maybeLazy, pluginByName } from '@/lib/used';",
    "import type { Shape } from '../lib/types';",
    'void maybeLazy;',
    'void pluginByName;',
    'export default function Home(): null { const shape: Shape = { n: usedFn() }; void shape; return null; }',
  ),
  'src/app/settings.tsx': lines('export default function Settings() { return null; }'),
  'src/lib/used.ts': lines(
    "import { callGrantAccess } from './rpc';",
    "import { x } from 'used-lib';",
    'void x;',
    'export function usedFn(): number { void callGrantAccess; return 1; }',
    'export function unusedExport(): number { return 2; }',
    "export async function maybeLazy(flag: boolean) { if (flag) { const module = await import('./lazy'); return module.lazy; } return 0; }",
    'export async function pluginByName(name: string) { return import(`./plugins/${name}`); }',
  ),
  'src/lib/used.test.ts': lines("import { usedFn } from './used';", "test('used', () => { expect(usedFn()).toBe(1); });"),
  'src/lib/types.ts': lines('export type Shape = { n: number };'),
  'src/lib/lazy.ts': lines('export const lazy = 3;'),
  'src/lib/plugins/alpha.ts': lines('export const alpha = 4;'),
  'src/lib/orphan.ts': lines('export const orphan = 5;'),
  'src/lib/task.ts': lines('const handlers: Record<string, () => void> = {};', 'handlers.background = () => undefined;', 'export {};'),
  'src/lib/rpc.ts': lines("export const callGrantAccess = (client: { rpc: (name: string) => unknown }) => client.rpc('grant_access');"),
  'jest.setup.ts': lines('export {};'),
  'scripts/tool.mjs': lines('console.log(1);'),
  'scripts/ci-only.mjs': lines('console.log(2);'),
  '.github/workflows/ci.yml': lines('name: ci', 'on: push', 'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps:', '      - run: node scripts/ci-only.mjs'),
  'supabase/migrations/20260101000000_functions.sql': lines(
    'create function public.grant_access() returns void language sql as $$ select 1 $$;',
    'create function public.never_called() returns void language sql as $$ select 1 $$;',
  ),
};

function writeFixture(target) {
  const put = (file, content) => {
    mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    writeFileSync(path.join(target, file), content);
  };
  for (const [file, content] of Object.entries(files)) put(file, content);
  for (const name of stubPackages) {
    put(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', main: 'index.js', bin: name === 'jest' ? { jest: 'cli.js' } : undefined }));
    put(`node_modules/${name}/index.js`, lines('module.exports = {};'));
  }
  put('node_modules/jest/cli.js', lines(''));
  put('node_modules/.bin/jest', lines(''));
}

function reportedItems(target, extra = []) {
  const result = spawnSync(process.execPath, [knip, '--directory', target, '--reporter', 'json', '--no-progress', '--no-exit-code', ...extra], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const reported = new Set();
  for (const issue of JSON.parse(result.stdout).issues) {
    if (issue.files?.length) reported.add(`file:${issue.file}`);
    for (const item of issue.exports ?? []) reported.add(`export:${issue.file}#${item.name}`);
    for (const item of issue.dependencies ?? []) reported.add(`dependency:${item.name}`);
    for (const item of Object.values(issue.unlisted ?? {})) reported.add(`unlisted:${item.name}`);
  }
  return reported;
}

const cases = [
  { id: 'unused-file', subject: 'file:src/lib/orphan.ts', defect: true, outcome: 'TP', visibility: 'static import graph' },
  { id: 'unused-export', subject: 'export:src/lib/used.ts#unusedExport', defect: true, outcome: 'TP', visibility: 'static import graph' },
  { id: 'unused-dependency', subject: 'dependency:left-pad', defect: true, outcome: 'TP', visibility: 'package manifest' },
  { id: 'unused-sql-function', subject: 'sql:public.never_called', defect: true, outcome: 'FN', visibility: 'SQL is outside the TypeScript import graph' },
  { id: 'router-route', subject: 'file:src/app/settings.tsx', defect: false, outcome: 'TN', visibility: 'Expo Router file-system routing' },
  { id: 'type-only-import', subject: 'file:src/lib/types.ts', defect: false, outcome: 'TN', visibility: 'static import graph' },
  { id: 'path-alias', subject: 'file:src/lib/used.ts', defect: false, outcome: 'TN', visibility: 'tsconfig paths' },
  { id: 'literal-dynamic-import', subject: 'file:src/lib/lazy.ts', defect: false, outcome: 'TN', visibility: 'static string in import()' },
  { id: 'side-effect-registration', subject: 'file:src/lib/task.ts', defect: false, outcome: 'TN', visibility: 'side-effect import' },
  { id: 'jest-setup', subject: 'file:jest.setup.ts', defect: false, outcome: 'TN', visibility: 'jest configuration' },
  { id: 'npm-script-target', subject: 'file:scripts/tool.mjs', defect: false, outcome: 'TN', visibility: 'package.json scripts' },
  { id: 'workflow-script-target', subject: 'file:scripts/ci-only.mjs', defect: false, outcome: 'TN', visibility: 'GitHub Actions run step' },
  { id: 'used-dependency', subject: 'dependency:used-lib', defect: false, outcome: 'TN', visibility: 'static import graph' },
  { id: 'rpc-sql-function', subject: 'sql:public.grant_access', defect: false, outcome: 'TN', visibility: 'SQL is outside the TypeScript import graph' },
  { id: 'computed-dynamic-import', subject: 'file:src/lib/plugins/alpha.ts', defect: false, outcome: 'FP', visibility: 'computed import() path' },
  { id: 'config-plugin-reference', subject: 'file:plugins/with-extra.js', defect: false, outcome: 'FP', visibility: 'app.json expo.plugins entry' },
  { id: 'inferred-expo-updates', subject: 'unlisted:expo-updates', defect: false, outcome: 'FP', visibility: 'Expo plugin assumes updates are enabled' },
];

function classify(item, reported) {
  const flagged = reported.has(item.subject);
  if (item.defect) return flagged ? 'TP' : 'FN';
  return flagged ? 'FP' : 'TN';
}

test('Knip classifies labeled dead-code and legitimately-used cases exactly as recorded for the pinned version', () => {
  const target = path.join(directory, 'fixture');
  writeFixture(target);
  const reported = reportedItems(target);
  const observed = Object.fromEntries(cases.map(item => [item.id, classify(item, reported)]));
  assert.deepEqual(observed, Object.fromEntries(cases.map(item => [item.id, item.outcome])));
});

test('the labeled sample is too small and has known false positives, so enforcement stays advisory', () => {
  const counts = Object.fromEntries(['TP', 'FP', 'FN', 'TN'].map(label => [label, cases.filter(item => item.outcome === label).length]));
  assert.deepEqual(counts, { TP: 3, FP: 3, FN: 1, TN: 10 });
  const precision = counts.TP / (counts.TP + counts.FP);
  assert.equal(precision, 0.5);
  assert.ok(cases.length < 30, 'a sample this small cannot justify a blocking gate');
  assert.ok(cases.some(item => item.outcome === 'FP' && !item.defect), 'documented false positives must stay recorded');
});

test('Knip leaves every file byte-identical and creates nothing when run in report mode', () => {
  const target = path.join(directory, 'report-only');
  writeFixture(target);
  const snapshot = () => Object.fromEntries(readdirSync(target, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const full = path.join(entry.parentPath, entry.name);
      return [path.relative(target, full).split(path.sep).join('/'), createHash('sha256').update(readFileSync(full)).digest('hex')];
    }));
  const before = snapshot();
  reportedItems(target);
  assert.deepEqual(snapshot(), before);
});
