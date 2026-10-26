import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryFiles } from './repository-files.mjs';
import { checkPath } from './check-hygiene.mjs';
import { root } from './tool-path.mjs';

const runners = ['verify:foundation', 'verify:supabase', 'verify:negative', 'db:mcp:test'];
const requiredChecks = [
  'check:reserved', 'check:hygiene', 'check:metadata', 'lint:markdown',
  'lint:yaml', 'lint:workflows', 'scan:secrets', 'verify:supabase',
  'typecheck:db', 'verify:foundation', 'check:test-selection', 'check:capabilities',
];
const testName = /\.(?:test|spec)\.mjs$/i;
const reporterPath = 'scripts/test-integrity-reporter.mjs';
const runnerPath = 'scripts/run-tests.mjs';

function selectedTests(scripts, state) {
  const selected = new Set();
  for (const runner of runners) {
    const value = scripts[runner];
    if (typeof value !== 'string') throw new Error(state + ': missing test runner ' + runner);
    const commands = value.split(' && ');
    if (runner === 'verify:negative') {
      if (commands.length !== 2 || commands[0] !== 'node scripts/verify-negative.mjs') {
        throw new Error(state + ': negative fixture verification must run before unit tests');
      }
    } else if (commands.length !== 1) throw new Error(state + ': unexpected test runner command ' + runner);
    const tokens = commands[commands.length - 1].split(' ');
    // Registration alone does not prove execution; the runner script pins the reporter that fails skipped, todo and empty tests
    // and rejects ambient options that filter tests, so a bare node --test is not an accepted runner.
    if (tokens.length < 3 || tokens[0] !== 'node' || tokens[1] !== runnerPath) {
      throw new Error(state + ': test runner must execute node ' + runnerPath + ': ' + runner);
    }
    for (const file of tokens.slice(2)) {
      try {
        if (!file.startsWith('scripts/') || !testName.test(file)) throw new Error('Expected a scripts test path.');
        checkPath(file);
      } catch (cause) {
        throw new Error(state + ': invalid or unsafe test target ' + file, { cause });
      }
      if (selected.has(file)) throw new Error(state + ': persistent test selected more than once: ' + file);
      selected.add(file);
    }
  }
  return selected;
}

export function checkTestSelection(repository = root) {
  const files = repositoryFiles(repository);
  for (const state of ['index', 'working']) {
    const current = files.filter(item => item.state === state);
    const manifest = current.find(item => item.file === 'package.json');
    if (!manifest) throw new Error(state + ': package.json missing');
    let packageFile;
    try {
      packageFile = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest.content));
    } catch {
      throw new Error(state + ': invalid package.json');
    }
    const scripts = packageFile?.scripts;
    if (!scripts || typeof scripts !== 'object') throw new Error(state + ': scripts are missing');
    if (scripts['check:test-selection'] !== 'node scripts/check-test-selection.mjs') {
      throw new Error(state + ': test-selection guard disabled');
    }
    if (typeof scripts.check !== 'string') throw new Error(state + ': aggregate check missing');
    const checks = scripts.check.split(' && ');
    if (checks.some(command => !/^npm run [a-z][a-z0-9:-]*$/.test(command))
      || new Set(checks).size !== checks.length) {
      throw new Error(state + ': unexpected, duplicated or masked aggregate check');
    }
    for (const check of requiredChecks) {
      if (!checks.includes('npm run ' + check)) throw new Error(state + ': mandatory check omitted: ' + check);
    }
    const selected = selectedTests(scripts, state);
    const present = new Set(current.map(item => item.file).filter(file => testName.test(file)));
    for (const file of present) if (!selected.has(file)) {
      throw new Error(state + ': unselected persistent test ' + file);
    }
    for (const file of selected) if (!present.has(file)) {
      throw new Error(state + ': missing selected persistent test ' + file);
    }
    for (const [file, label] of [[runnerPath, 'test runner script'], [reporterPath, 'test integrity reporter']]) {
      if (!current.some(item => item.file === file)) throw new Error(state + ': missing ' + label);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Use no arguments.');
  checkTestSelection();
  console.log('Persistent test selection and aggregate checks passed for index and working tree.');
}
