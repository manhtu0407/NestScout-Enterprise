import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAttribution, checkPath } from './check-hygiene.mjs';
import { git } from './repository-files.mjs';
import { root } from './tool-path.mjs';

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const INSUFFICIENT = 'INSUFFICIENT_EVIDENCE';
export const requiredCommands = Object.freeze(['check', 'verify:negative']);
export const dimensionNames = Object.freeze(['correctness', 'codeHealth', 'deadCodeSafety', 'scope', 'testIntegrity']);

const highRisk = [
  /^(?:AGENTS|README|CONTRIBUTING|SECURITY)\.md$/,
  /^\.(?:github|githooks|agents|claude|codex|cursor)\//,
  /^\.mcp\.json$/,
  /^package(?:-lock)?\.json$/,
  /^supabase\/(?:migrations\/|tests\/|config\.toml$|seed\.sql$)/,
  /^scripts\/(?:check-|verify-|scan-|install-|tool-|run-tests|test-integrity|repository-files|git-environment)/,
  /^apps\/mobile\/(?:package|app|tsconfig)\.json$/,
  /^apps\/mobile\/eslint\.config\.mjs$/,
  /^apps\/mobile\/src\/app\//,
  /^apps\/mobile\/src\/features\/access\/(?:auth|capability|routing|state)\//,
  /^apps\/mobile\/src\/lib\/(?:config|chunked-storage|supabase-client|device-storage)\.ts$/,
];
const testFile = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|sql)$/;
const sourceFile = /\.(?:[cm]?[jt]sx?)$/;
const textFile = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|sql|toml|jsonc)$/;
const disabledMarker = /(?:^|[^\w.])(?:(?:it|test|describe)\.(?:skip|only|todo|failing)\b|(?:xit|xtest|xdescribe|fit|fdescribe)\s*\()|\b(?:skip|todo)\s*:\s*(?:true|['"`])|\bt\.(?:skip|todo)\s*\(/g;
const testDeclaration = /(?:^|[^\w.])(?:it|test)(?:\.(?:each|concurrent))?\s*(?:\(|`)/g;
const assertion = /(?:^|[^\w.])(?:expect\s*\(|assert(?:\.\w+)?\s*\(|t\.assert\w*\s*\(|(?:is|isnt|ok|throws_ok|lives_ok|results_eq|results_ne|cmp_ok|is_empty|isnt_empty|policies_are|has_\w+|hasnt_\w+)\s*\()/;
const dependencyKeys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'workspaces'];
const exportDeclaration = /^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const exportList = /^export\s*(?:type\s*)?\{([^}]*)\}/gm;

const count = (text, pattern) => [...text.matchAll(pattern)].length;
const lineSet = text => text.split(/\r?\n/).map(line => line.trim().replace(/\s+/g, ' ')).filter(Boolean);

function multiset(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

function missingLines(before, after, keep = () => true) {
  const remaining = multiset(lineSet(after));
  const missing = [];
  for (const line of lineSet(before)) {
    if (!keep(line)) continue;
    const available = remaining.get(line) ?? 0;
    if (available > 0) remaining.set(line, available - 1);
    else missing.push(line);
  }
  return missing;
}

const addedText = (before, after) => missingLines(after, before).join('\n');

export function exportedNames(text) {
  const names = new Set([...text.matchAll(exportDeclaration)].map(match => match[1]));
  for (const [, list] of text.matchAll(exportList)) {
    for (const item of list.split(',')) {
      const name = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  names.delete('default');
  return names;
}

function globPattern(glob) {
  const source = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*')
    .replaceAll('\u0000', '(?:.*/)?').replaceAll('\u0001', '.*');
  return new RegExp(`^${source}$`);
}

function changedFiles(repository, mergeBase, head) {
  const tokens = git(repository, ['diff', '--name-status', '-z', '-M', mergeBase, head]).split('\0');
  const files = [];
  for (let index = 0; index < tokens.length - 1;) {
    const status = tokens[index++];
    if (!status) break;
    if (status[0] === 'R' || status[0] === 'C') files.push({ status: status[0], from: tokens[index++], path: tokens[index++] });
    else files.push({ status: status[0], path: tokens[index++] });
  }
  return files;
}

const readAt = (repository, revision, file) => git(repository, ['show', `${revision}:${file}`]);

function grepHead(repository, head, word) {
  const result = spawnSync('git', ['grep', '-n', '-w', '-F', '-e', word, head], { cwd: repository, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status > 1) throw new Error(`git grep failed for ${word}: ${result.stderr}`);
  return result.stdout.split('\n').filter(Boolean).map(line => line.slice(head.length + 1));
}

function verdictOf(findings, failed) {
  if (failed.length) return { verdict: FAIL, findings: [...failed, ...findings] };
  return { verdict: findings.length ? INSUFFICIENT : PASS, findings };
}

function packageChanges(repository, mergeBase, head) {
  const before = JSON.parse(readAt(repository, mergeBase, 'package.json'));
  const after = JSON.parse(readAt(repository, head, 'package.json'));
  const dependencies = dependencyKeys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const scripts = [...new Set([...Object.keys(before.scripts ?? {}), ...Object.keys(after.scripts ?? {})])]
    .filter(name => before.scripts?.[name] !== after.scripts?.[name]);
  const weakened = [];
  for (const name of scripts) {
    const segments = value => new Set(String(value ?? '').split(' && '));
    const kept = segments(after.scripts?.[name]);
    const dropped = [...segments(before.scripts?.[name])].filter(segment => segment && !kept.has(segment));
    if (name === 'check' || name.startsWith('verify:') || name.startsWith('check:')) {
      if (!after.scripts?.[name]) weakened.push(`script ${name} was removed`);
      else if (dropped.length) weakened.push(`script ${name} no longer runs: ${dropped.join(', ')}`);
    }
  }
  return { dependencies, scripts, weakened };
}

function scopeDimension(files, scope, packages) {
  const findings = [];
  const failed = [];
  if (!scope.length) findings.push('No owner-declared scope was supplied, so intent cannot be checked.');
  const patterns = scope.map(globPattern);
  for (const file of files) {
    for (const name of [file.path, file.from].filter(Boolean)) {
      if (patterns.length && !patterns.some(pattern => pattern.test(name))) failed.push(`${name} is outside the declared scope.`);
      if (highRisk.some(pattern => pattern.test(name))) findings.push(`${name} is in a high-risk area that needs explicit owner review.`);
    }
  }
  if (packages) {
    if (packages.dependencies.length) findings.push(`package.json changed ${packages.dependencies.join(', ')}; license, security and compatibility need review.`);
    if (packages.scripts.length) findings.push(`package.json scripts changed: ${packages.scripts.join(', ')}.`);
    failed.push(...packages.weakened);
  }
  return verdictOf([...new Set(findings)], [...new Set(failed)]);
}

function testDimension(repository, files, mergeBase, head, packages) {
  const findings = [];
  const failed = [];
  for (const file of files) {
    const fromPath = file.from ?? file.path;
    if (file.status === 'D' && testFile.test(fromPath)) {
      failed.push(`${fromPath}: test file deleted.`);
      continue;
    }
    if (file.status === 'A' || file.from) {
      try { checkPath(file.path); } catch (error) { failed.push(`${file.path}: ${error.message}`); }
    }
    if (file.status === 'D' || !textFile.test(file.path)) continue;
    const before = file.status === 'A' ? '' : readAt(repository, mergeBase, fromPath);
    const after = readAt(repository, head, file.path);
    try { checkAttribution(addedText(before, after), file.path); } catch (error) { failed.push(`${file.path}: ${error.message}`); }
    if (!testFile.test(file.path)) continue;
    const disabledBefore = count(before, disabledMarker);
    const disabledAfter = count(after, disabledMarker);
    if (disabledAfter > disabledBefore) failed.push(`${file.path}: disabled tests increased from ${disabledBefore} to ${disabledAfter}.`);
    const declaredBefore = count(before, testDeclaration);
    const declaredAfter = count(after, testDeclaration);
    if (declaredAfter < declaredBefore) findings.push(`${file.path}: test declarations decreased from ${declaredBefore} to ${declaredAfter}.`);
    const removed = missingLines(before, after, line => assertion.test(line));
    if (removed.length) findings.push(`${file.path}: ${removed.length} assertion line(s) removed or altered, first: ${removed[0]}`);
  }
  if (packages && packages.dependencies.length === 0 && files.some(file => file.path === 'apps/mobile/package.json')) {
    const jest = revision => JSON.stringify(JSON.parse(readAt(repository, revision, 'apps/mobile/package.json')).jest);
    if (jest(mergeBase) !== jest(head)) findings.push('apps/mobile/package.json: the jest test selection changed.');
  }
  return verdictOf(findings, failed);
}

function deadCodeDimension(repository, files, mergeBase, head) {
  const findings = [];
  const failed = [];
  const note = subject => `${subject} has no static reference left, but static absence is not proof of non-use (routes, configuration, runtime registration, backend contracts); uncertain usage means do not delete.`;
  for (const file of files) {
    const original = file.from ?? file.path;
    if (file.status === 'D' && sourceFile.test(original) && !testFile.test(original)) {
      const stem = path.posix.basename(original).replace(/(?:\.[^.]+)+$/, '');
      const references = grepHead(repository, head, stem);
      if (references.length) failed.push(`${original} was removed but ${stem} is still referenced at ${references[0]}.`);
      else findings.push(note(`${original} was removed and`));
    }
    if ((file.status === 'M' || file.status === 'R') && sourceFile.test(file.path) && !testFile.test(file.path)) {
      const before = exportedNames(readAt(repository, mergeBase, original));
      const after = exportedNames(readAt(repository, head, file.path));
      for (const name of before) {
        if (after.has(name)) continue;
        const remaining = grepHead(repository, head, name).filter(line => !line.startsWith(`${file.path}:`));
        const referencing = [...new Set(remaining.map(line => line.split(':')[0]))].filter(candidate => sourceFile.test(candidate));
        if (referencing.some(candidate => exportedNames(readAt(repository, head, candidate)).has(name))) continue;
        if (remaining.length) failed.push(`${file.path}: export ${name} was removed but is still referenced at ${remaining[0]}.`);
        else findings.push(note(`${file.path}: export ${name} was removed and`));
      }
    }
  }
  return verdictOf(findings, failed);
}

function runCommands(repository, scripts, head) {
  const bound = git(repository, ['rev-parse', 'HEAD']).trim() === head && git(repository, ['status', '--porcelain']).trim() === '';
  if (!bound) return { bound, results: [] };
  const manifest = JSON.parse(readFileSync(path.join(repository, 'package.json'), 'utf8'));
  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (scripts.length && !existsSync(cli)) throw new Error('The npm CLI was not found; run this through npm or set npm_execpath.');
  const results = scripts.map(script => {
    if (!manifest.scripts?.[script]) throw new Error(`package.json has no script named ${script}.`);
    const child = spawnSync(process.execPath, [cli, 'run', script], {
      cwd: repository, env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^NODE_TEST_CONTEXT$/i.test(name))), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000, windowsHide: true,
    });
    return { script, exitCode: child.status ?? 1, error: child.error?.message ?? null, outputTail: `${child.stdout}${child.stderr}`.slice(-1500) };
  });
  return { bound, results };
}

function correctnessDimension(commands, required) {
  const findings = [];
  const failed = [];
  if (!commands.bound) findings.push('Command results were not recorded: HEAD differs from the frozen head or the working tree is dirty.');
  for (const result of commands.results) {
    if (result.exitCode !== 0) failed.push(`npm run ${result.script} exited ${result.exitCode}${result.error ? `: ${result.error}` : ''}.`);
  }
  for (const script of required) {
    if (!commands.results.some(result => result.script === script)) findings.push(`npm run ${script} was not run on the frozen head.`);
  }
  return verdictOf(findings, failed);
}

function codeHealthDimension(repository, files, mergeBase, head, reviewer) {
  const diagnostics = [];
  for (const file of files) {
    if (file.status === 'D' || !sourceFile.test(file.path)) continue;
    const before = file.status === 'A' ? 0 : readAt(repository, mergeBase, file.from ?? file.path).split('\n').length - 1;
    const after = readAt(repository, head, file.path).split('\n').length - 1;
    diagnostics.push({ path: file.path, linesBefore: before, linesAfter: after });
  }
  const findings = [];
  if (!reviewer) findings.push('No read-only reviewer verdict was supplied; structural quality cannot be decided from line counts.');
  else if (reviewer.independent !== true) findings.push('The reviewer is not independent of the implementation, so its verdict cannot count as assurance.');
  else if (!['PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE'].includes(reviewer.codeHealth?.verdict)) findings.push('The reviewer verdict must be PASS, FAIL or INSUFFICIENT_EVIDENCE.');
  else if (reviewer.codeHealth.verdict === PASS && !(Array.isArray(reviewer.codeHealth.evidence) && reviewer.codeHealth.evidence.length)) findings.push('A PASS verdict needs file and line evidence.');
  else if (reviewer.codeHealth.verdict === FAIL) return { ...verdictOf([], [`Reviewer reported a code-health failure: ${(reviewer.codeHealth.evidence ?? []).join('; ') || 'no evidence given'}`]), diagnostics };
  else if (reviewer.codeHealth.verdict === INSUFFICIENT) findings.push('The reviewer could not reach a verdict.');
  return { ...verdictOf(findings, []), diagnostics };
}

export function reviewDiff({ repository = root, base = 'origin/main', head = 'HEAD', scope = [], run = [], reviewer = null, required = requiredCommands } = {}) {
  const baseSha = git(repository, ['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const headSha = git(repository, ['rev-parse', '--verify', `${head}^{commit}`]).trim();
  const mergeBase = git(repository, ['merge-base', baseSha, headSha]).trim();
  const files = changedFiles(repository, mergeBase, headSha);
  const packages = files.some(file => file.path === 'package.json' && file.status === 'M') ? packageChanges(repository, mergeBase, headSha) : null;
  const commands = runCommands(repository, run, headSha);
  const dimensions = {
    correctness: correctnessDimension(commands, required),
    codeHealth: codeHealthDimension(repository, files, mergeBase, headSha, reviewer),
    deadCodeSafety: deadCodeDimension(repository, files, mergeBase, headSha),
    scope: scopeDimension(files, scope, packages),
    testIntegrity: testDimension(repository, files, mergeBase, headSha, packages),
  };
  const verdicts = Object.values(dimensions).map(dimension => dimension.verdict);
  const verdict = verdicts.includes(FAIL) ? FAIL : verdicts.includes(INSUFFICIENT) ? INSUFFICIENT : PASS;
  return {
    base: { ref: base, sha: baseSha }, head: { ref: head, sha: headSha }, mergeBase,
    files: files.map(file => ({ status: file.status, path: file.path, ...(file.from ? { from: file.from } : {}) })),
    commands: commands.results, reviewerIndependent: reviewer?.independent === true, dimensions, verdict,
  };
}

function parseArguments(argv) {
  const options = { run: [], scope: [] };
  const names = new Map([['--base', 'base'], ['--head', 'head'], ['--repository', 'repository'], ['--reviewer', 'reviewer']]);
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value.`);
    if (names.has(flag)) options[names.get(flag)] = value;
    else if (flag === '--scope') options.scope.push(...value.split(',').filter(Boolean));
    else if (flag === '--run') options.run.push(value);
    else throw new Error(`Unknown argument ${flag}.`);
  }
  if (options.reviewer) options.reviewer = JSON.parse(readFileSync(options.reviewer, 'utf8'));
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packet = reviewDiff(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(packet, null, 2));
  process.exitCode = { [PASS]: 0, [FAIL]: 1, [INSUFFICIENT]: 2 }[packet.verdict];
}
