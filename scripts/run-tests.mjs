import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const reporter = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-integrity-reporter.mjs');
const testFile = /\.(?:test|spec)\.mjs$/;
const optionVariables = /^(?:NODE_OPTIONS|npm_config_node[_-]options)$/i;
const testOption = /^--(?:experimental-)?test(?:[-=]|$)/;

export function nodeOptionTokens(value) {
  if (/[^\S ]/.test(value)) throw new Error('contains whitespace other than spaces');
  const tokens = [];
  let token = '';
  let quoted = false;
  for (let index = 0; index < value.length; index++) {
    let character = value[index];
    if (character === '\\' && quoted) {
      if (++index === value.length) throw new Error('ends with an incomplete escape');
      character = value[index];
    } else if (character === ' ' && !quoted) {
      if (token) tokens.push(token);
      token = '';
      continue;
    } else if (character === '"') {
      quoted = !quoted;
      continue;
    }
    token += character;
  }
  if (quoted) throw new Error('has an unterminated quote');
  if (token) tokens.push(token);
  return tokens;
}

export function ambientTestOptions(env = process.env) {
  return Object.entries(env).filter(([name]) => optionVariables.test(name)).flatMap(([name, value]) => {
    try {
      return nodeOptionTokens(String(value)).filter(option => testOption.test(option.replaceAll('_', '-'))).map(option => `${name}: ${option}`);
    } catch (error) {
      return [`${name}: ${error.message}`];
    }
  });
}

export function runTests(files, env = process.env, cwd = process.cwd()) {
  if (!files.length || files.some(file => !testFile.test(file))) throw new Error('Pass one or more *.test.mjs or *.spec.mjs files.');
  const ambient = ambientTestOptions(env);
  if (ambient.length) throw new Error(`Ambient Node options would change, or cannot be shown not to change, which tests run: ${ambient.join(', ')}. Unset them or run node --test directly outside verification.`);
  const childEnvironment = Object.fromEntries(Object.entries(env).filter(([name]) => !/^NODE_TEST_CONTEXT$/i.test(name)));
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-test-run-'));
  try {
    const evidence = path.join(directory, 'executed.json');
    const result = spawnSync(process.execPath, ['--test', `--test-reporter=${pathToFileURL(reporter).href}`, ...files], {
      cwd, env: { ...childEnvironment, NESTSCOUT_TEST_EVIDENCE: evidence }, stdio: 'inherit',
    });
    if (result.error) throw result.error;
    const problems = [];
    let executed = null;
    try { executed = JSON.parse(readFileSync(evidence, 'utf8')); } catch { executed = null; }
    if (!executed) problems.push('the integrity reporter did not complete, so execution of the requested tests is unproven');
    else for (const file of files) {
      const relative = path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join('/');
      if (!executed[relative]) problems.push(`${relative} has no recorded passing test`);
    }
    return { status: result.status ?? 1, problems };
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { status, problems } = runTests(process.argv.slice(2));
    if (problems.length) console.error(`Test execution evidence is incomplete:\n${problems.map(problem => `  - ${problem}`).join('\n')}`);
    process.exitCode = status || (problems.length ? 1 : 0);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
