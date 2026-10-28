import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SyntaxKind } from 'typescript/unstable/ast';
import { commentViolations } from './check-comments.mjs';
import { checkAttribution, checkPath, sourceComments } from './check-hygiene.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { git } from './repository-files.mjs';
import { verifyAttestation } from './review-attestation.mjs';
import { describeModules, resolveModule } from './review-modules.mjs';
import { boundNames, sameNode, squash, withSource } from './review-syntax.mjs';
import { root } from './tool-path.mjs';

export const PASS = 'PASS';
export const FAIL = 'FAIL';
export const INSUFFICIENT = 'INSUFFICIENT_EVIDENCE';
const requiredCommands = Object.freeze(['check', 'verify:negative']);

const highRisk = [
  /^(?:AGENTS|README|CONTRIBUTING|SECURITY)\.md$/,
  /^\.(?:github|githooks|agents|claude|codex|cursor)\//,
  /^\.mcp\.json$/,
  /^package(?:-lock)?\.json$/,
  /^supabase\//,
  /^scripts\//,
  /^apps\/mobile\/(?:package|app)\.json$/,
  /^apps\/mobile\/src\/app\//,
  /^apps\/mobile\/src\/features\/access\//,
  /^apps\/mobile\/src\/lib\/(?:config|chunked-storage|supabase-client|device-storage)\.ts$/,
  /(?:^|\/)(?:jest|babel|metro|eslint|knip|stryker|vitest|playwright)\.config\.[^/]+$/,
  /(?:^|\/)\.?knip\.(?:jsonc?|[cm]?[jt]s)$/,
  /(?:^|\/)(?:tsconfig(?:\.[^/]+)?\.json|\.npmrc|\.env(?:\.[^/]+)?|\.gitignore|\.gitattributes|\.editorconfig|\.nvmrc|\.node-version|\.markdownlint-cli2\.[^/]+)$/,
];
const authorizationWord = /^(?:roles?|capabilit(?:y|ies)|permissions?|grants?|authori[sz]\w*|authenticat\w*|polic(?:y|ies)|rls|credentials?|secrets?)$/;
const authorizationTerm = text => text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).find(word => authorizationWord.test(word));
const configurationFile = /(?:^|\/)(?:(?:jest|vitest|playwright)\.config\.[^/]+|\.mocharc[^/]*)$/;
const guardedScript = /^(?:check|test|lint|typecheck|scan|verify)(?::|$)/;
const manifestFile = /(?:^|\/)package\.json$/;
const testFile = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|sql)$/;
const sourceFile = /\.(?:[cm]?[jt]sx?)$/;
const textFile = /\.(?:[cm]?[jt]sx?|json|md|ya?ml|sql|toml|jsonc)$/;
const disabledMarker = /(?:^|[^\w.])(?:(?:it|test|describe)\.(?:skip|only|todo|failing)\b|(?:xit|xtest|xdescribe|fit|fdescribe)\s*\()|\b(?:skip|todo)\s*:\s*(?:true|['"`])|\bt\.(?:skip|todo)\s*\(/g;
const testDeclaration = /(?:^|[^\w.])(?:it|test)(?:\.(?:each|concurrent))?\s*(?:\(|`)/g;
const assertion = /(?:^|[^\w.])(?:expect\s*\(|assert(?:\.\w+)?\s*\(|t\.assert\w*\s*\(|(?:is|isnt|ok|throws_ok|lives_ok|results_eq|results_ne|cmp_ok|is_empty|isnt_empty|policies_are|has_\w+|hasnt_\w+)\s*\()/;
const guardsAssertions = /\b(?:expect|assert)\b/;
const dependencyKeys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides', 'workspaces'];

const count = (text, pattern) => [...text.matchAll(pattern)].length;

const testRoots = new Set(['it', 'test', 'describe', 'xit', 'xtest', 'xdescribe', 'fit', 'fdescribe']);
const declarationRoots = new Set(['it', 'test', 'xit', 'xtest', 'fit']);
const disabledRoots = new Set(['xit', 'xtest', 'xdescribe', 'fit', 'fdescribe']);
const disabledMembers = new Set(['skip', 'only', 'todo', 'failing']);
const contextMembers = new Set(['skip', 'todo']);
const optionNames = new Set(['skip', 'todo', 'only']);
const assertionRoots = new Set(['expect', 'assert']);
const chainKinds = new Set([SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression,
  SyntaxKind.ParenthesizedExpression, SyntaxKind.NonNullExpression, SyntaxKind.AsExpression, SyntaxKind.TaggedTemplateExpression]);
const aliasKinds = new Set([SyntaxKind.ParenthesizedExpression, SyntaxKind.NonNullExpression, SyntaxKind.AsExpression]);
const functionKinds = new Set([SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression, SyntaxKind.FunctionDeclaration, SyntaxKind.MethodDeclaration,
  SyntaxKind.Constructor, SyntaxKind.GetAccessor, SyntaxKind.SetAccessor]);
const callbackKinds = new Set([SyntaxKind.ArrowFunction, SyntaxKind.FunctionExpression]);
const scopeKinds = new Set([...functionKinds, SyntaxKind.Block, SyntaxKind.SourceFile, SyntaxKind.ModuleBlock, SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement, SyntaxKind.ForOfStatement]);
const exitKinds = new Set([SyntaxKind.ReturnStatement, SyntaxKind.ThrowStatement, SyntaxKind.BreakStatement, SyntaxKind.ContinueStatement]);
const guardKinds = new Set([SyntaxKind.IfStatement, SyntaxKind.ConditionalExpression, SyntaxKind.ForStatement, SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement, SyntaxKind.WhileStatement, SyntaxKind.DoStatement, SyntaxKind.TryStatement, SyntaxKind.CatchClause,
  SyntaxKind.CaseClause, SyntaxKind.DefaultClause]);
const blockKinds = new Set([SyntaxKind.Block, SyntaxKind.SourceFile, SyntaxKind.ModuleBlock]);
const logicalOperators = new Set([SyntaxKind.AmpersandAmpersandToken, SyntaxKind.BarBarToken, SyntaxKind.QuestionQuestionToken]);
const labelKinds = new Set([SyntaxKind.PropertyAccessExpression, SyntaxKind.PropertyAssignment]);
const loopHeaderKinds = new Set([SyntaxKind.ForOfStatement, SyntaxKind.ForInStatement]);
const emptyStructure = () => ({ disabled: 0, unconditional: 0, declarations: 0, assertions: [] });

const chainTarget = node => (node.kind === SyntaxKind.TaggedTemplateExpression ? node.tag : node.expression);

function chainOf(start) {
  const members = [];
  for (let node = start; node; node = chainTarget(node)) {
    if (node.kind === SyntaxKind.Identifier) return { root: node.text, members };
    if (node.kind === SyntaxKind.PropertyAccessExpression) members.push(node.name.text);
    else if (node.kind === SyntaxKind.ElementAccessExpression) {
      const key = node.argumentExpression;
      members.push(key.kind === SyntaxKind.StringLiteral || key.kind === SyntaxKind.NoSubstitutionTemplateLiteral ? key.text : null);
    } else if (!chainKinds.has(node.kind)) return null;
  }
  return null;
}

const continuesChain = node => Boolean(node.parent && chainKinds.has(node.parent.kind) && sameNode(chainTarget(node.parent), node));

function aliasesTestRoot(node) {
  let current = node;
  while (aliasKinds.has(current.kind)) current = current.expression;
  return current.kind === SyntaxKind.Identifier && testRoots.has(current.text);
}

function exits(node) {
  if (exitKinds.has(node.kind)) return true;
  if (functionKinds.has(node.kind)) return false;
  let found = false;
  node.forEachChild(child => {
    if (exits(child)) found = true;
  });
  return found;
}

function testStructure(file, text) {
  if (!text.trim()) return emptyStructure();
  return withSource(file, text, source => {
    const nodes = [];
    const collect = node => {
      nodes.push(node);
      node.forEachChild(collect);
    };
    collect(source);
    const slice = node => squash(text.slice(node.getStart(source), node.end));

    const contexts = new Set();
    for (const node of nodes) {
      if (node.kind !== SyntaxKind.CallExpression || !testRoots.has(chainOf(node)?.root)) continue;
      for (const argument of node.arguments.filter(candidate => callbackKinds.has(candidate.kind))) {
        for (const parameter of argument.parameters) if (parameter.name.kind === SyntaxKind.Identifier) contexts.add(parameter.name.text);
      }
    }

    const declared = new Map();
    for (const node of nodes) {
      if (node.kind !== SyntaxKind.VariableDeclaration) continue;
      const header = node.parent?.parent;
      const value = node.initializer ?? (header && loopHeaderKinds.has(header.kind) ? header.expression : null);
      if (!value) continue;
      let scope = node.parent;
      while (scope && !scopeKinds.has(scope.kind)) scope = scope.parent;
      for (const name of boundNames(node.name)) declared.set(name, [...(declared.get(name) ?? []), { scope, value }]);
    }
    const lookup = identifier => {
      for (let scope = identifier.parent; scope; scope = scope.parent) {
        const entry = (declared.get(identifier.text) ?? []).find(candidate => candidate.scope && sameNode(candidate.scope, scope));
        if (entry) return entry.value;
      }
      return null;
    };
    const identifiersIn = node => {
      const found = [];
      const visit = child => {
        if (child.kind === SyntaxKind.Identifier && !(labelKinds.has(child.parent?.kind) && sameNode(child.parent.name, child))) found.push(child);
        child.forEachChild(visit);
      };
      visit(node);
      return found;
    };
    const resolved = call => {
      const lines = [];
      const seen = new Set();
      let frontier = identifiersIn(call);
      for (let depth = 0; depth < 3 && frontier.length; depth++) {
        const next = [];
        for (const identifier of frontier) {
          const value = lookup(identifier);
          if (!value || seen.has(`${identifier.text}@${value.pos}`)) continue;
          seen.add(`${identifier.text}@${value.pos}`);
          lines.push(`${identifier.text}=${slice(value)}`);
          next.push(...identifiersIn(value));
        }
        frontier = next;
      }
      return lines.sort();
    };
    const runsAsTest = fn => fn.parent?.kind === SyntaxKind.CallExpression && fn.parent.arguments.some(argument => sameNode(argument, fn)) && testRoots.has(chainOf(fn.parent)?.root);
    const guards = node => {
      const entries = [];
      if (node.parent?.kind === SyntaxKind.AwaitExpression) entries.push('awaited');
      if (node.parent?.kind === SyntaxKind.ReturnStatement) entries.push('returned');
      let child = node;
      for (let ancestor = node.parent; ancestor; child = ancestor, ancestor = ancestor.parent) {
        if (guardKinds.has(ancestor.kind) || (ancestor.kind === SyntaxKind.BinaryExpression && logicalOperators.has(ancestor.operatorToken.kind))) {
          const prefix = squash(text.slice(ancestor.getStart(source), child.getStart(source)));
          if (prefix) entries.push(`when ${prefix}`);
        }
        if (blockKinds.has(ancestor.kind)) {
          for (const statement of ancestor.statements) if (statement.end <= child.pos && exits(statement)) entries.push(`after ${slice(statement)}`);
        }
        if (functionKinds.has(ancestor.kind) && !runsAsTest(ancestor)) entries.push(`inside ${squash(text.slice(ancestor.getStart(source), (ancestor.body ?? ancestor).getStart(source)))}`);
      }
      return entries;
    };

    const structure = emptyStructure();
    for (const node of nodes) {
      if (node.kind === SyntaxKind.VariableDeclaration && node.initializer && aliasesTestRoot(node.initializer)) {
        structure.disabled++;
        structure.unconditional++;
      }
      if (node.kind === SyntaxKind.CallExpression && testRoots.has(chainOf(node)?.root)) {
        for (const argument of node.arguments) {
          const options = argument.kind === SyntaxKind.Identifier ? lookup(argument) : argument;
          if (options?.kind !== SyntaxKind.ObjectLiteralExpression) continue;
          for (const property of options.properties) {
            const switchedOff = property.kind === SyntaxKind.PropertyAssignment && property.initializer.kind === SyntaxKind.FalseKeyword;
            if ((property.kind === SyntaxKind.PropertyAssignment || property.kind === SyntaxKind.ShorthandPropertyAssignment) && optionNames.has(property.name.text) && !switchedOff) {
              structure.disabled++;
              if (property.kind === SyntaxKind.PropertyAssignment && (property.initializer.kind === SyntaxKind.TrueKeyword || property.initializer.kind === SyntaxKind.StringLiteral || property.initializer.kind === SyntaxKind.NoSubstitutionTemplateLiteral)) structure.unconditional++;
            }
          }
        }
      }
      if (!chainKinds.has(node.kind) || continuesChain(node)) continue;
      const chain = chainOf(node);
      if (!chain) continue;
      const { root, members } = chain;
      if (disabledRoots.has(root) || (testRoots.has(root) && members.some(member => member === null || disabledMembers.has(member)))
        || (contexts.has(root) && members.some(member => contextMembers.has(member)))) {
        structure.disabled++;
        structure.unconditional++;
      }
      if (node.kind !== SyntaxKind.CallExpression) continue;
      if (declarationRoots.has(root)) structure.declarations++;
      if (assertionRoots.has(root) || (contexts.has(root) && members.some(member => member?.startsWith('assert')))) {
        structure.assertions.push([slice(node), ...resolved(node), ...guards(node)].join(' | '));
      }
    }
    return structure;
  });
}

const legacyStructure = text => ({
  disabled: count(text, disabledMarker),
  unconditional: count(text, disabledMarker),
  declarations: count(text, testDeclaration),
  assertions: lineSet(text).filter(line => assertion.test(line)),
});
const lineSet = text => text.split(/\r?\n/).map(line => line.trim().replace(/\s+/g, ' ')).filter(Boolean);

function multiset(lines) {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return counts;
}

function missingItems(before, after) {
  const remaining = multiset(after);
  const missing = [];
  for (const item of before) {
    const available = remaining.get(item) ?? 0;
    if (available > 0) remaining.set(item, available - 1);
    else missing.push(item);
  }
  return missing;
}

const addedText = (before, after) => missingItems(lineSet(after), lineSet(before)).join('\n');

export function exportedNames(text, file = 'input.ts') {
  const [described] = describeModules([{ file, text }]);
  if (!described) throw new Error(`Invalid syntax in ${file}.`);
  const names = new Set(described.exports.keys());
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

function grepRevision(repository, head, args, label) {
  const result = spawnSync('git', ['grep', '-n', ...args], { cwd: repository, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: gitEnvironment() });
  if (result.error) throw result.error;
  if (result.status > 1) throw new Error(`git grep failed for ${label}: ${result.stderr}`);
  return result.stdout.split('\n').filter(Boolean).map(line => line.slice(head.length + 1));
}

const grepHead = (repository, head, word) => grepRevision(repository, head, ['-w', '-F', '-e', word, head], word);

function verdictOf(findings, failed) {
  if (failed.length) return { verdict: FAIL, findings: [...failed, ...findings] };
  return { verdict: findings.length ? INSUFFICIENT : PASS, findings };
}

const existsAt = (repository, revision, file) => {
  try {
    git(repository, ['cat-file', '-e', `${revision}:${file}`]);
    return true;
  } catch {
    return false;
  }
};

function revisionView(repository, revision) {
  const files = new Set(git(repository, ['ls-tree', '-r', '-z', '--name-only', revision]).split('\0').filter(Boolean));
  return { files, has: file => files.has(file), read: file => readAt(repository, revision, file) };
}

const parseJson = text => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const commandSegments = value => String(value ?? '').split(' && ').map(segment => segment.trim().split(/\s+/).filter(Boolean)).filter(tokens => tokens.length);
const sameTokens = (left, right) => left.length === right.length && left.every((token, index) => token === right[index]);

const lineTokens = line => line.split(/[\s'"`();,]+/).filter(Boolean);

function appendedTokens(segment, candidates) {
  for (const candidate of candidates) {
    if (candidate.length <= segment.length) continue;
    const extras = [];
    let matched = 0;
    for (const token of candidate) {
      if (token === segment[matched]) matched++;
      else extras.push(token);
    }
    if (matched === segment.length) return extras;
  }
  return null;
}

function packageChanges(repository, mergeBase, head, manifest) {
  const before = parseJson(readAt(repository, mergeBase, manifest));
  const after = parseJson(readAt(repository, head, manifest));
  if (!before || !after) return { manifest, dependencies: [], scripts: [], weakened: [`${manifest} is not valid JSON at the base or the head.`], registered: [] };
  const directory = path.posix.dirname(manifest);
  const label = directory === '.' ? '' : `${manifest} `;
  const dependencies = dependencyKeys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const scripts = [...new Set([...Object.keys(before.scripts ?? {}), ...Object.keys(after.scripts ?? {})])]
    .filter(name => before.scripts?.[name] !== after.scripts?.[name]);
  const weakened = [];
  const registered = [];
  for (const name of scripts) {
    if (!guardedScript.test(name)) continue;
    if (!after.scripts?.[name]) {
      weakened.push(`${label}script ${name} was removed`);
      continue;
    }
    const kept = commandSegments(after.scripts[name]);
    for (const segment of commandSegments(before.scripts?.[name])) {
      if (kept.some(candidate => sameTokens(candidate, segment))) continue;
      const extras = appendedTokens(segment, kept);
      if (!extras || !extras.every(token => testFile.test(token))) {
        weakened.push(`${label}script ${name} no longer runs: ${segment.join(' ')}`);
        continue;
      }
      const missing = extras.filter(token => !existsAt(repository, head, directory === '.' ? token : path.posix.join(directory, token)));
      if (missing.length) weakened.push(`${label}script ${name} registers ${missing.join(', ')}, which does not exist at the head.`);
      else registered.push({ script: name, files: extras });
    }
  }
  return { manifest, dependencies, scripts, weakened, registered };
}

function scopeDimension(repository, files, mergeBase, head, scope, packages) {
  const findings = [];
  const failed = [];
  if (!scope.length) findings.push('No owner-declared scope was supplied, so intent cannot be checked.');
  const patterns = scope.map(globPattern);
  for (const file of files) {
    for (const name of [file.path, file.from].filter(Boolean)) {
      if (patterns.length && !patterns.some(pattern => pattern.test(name))) failed.push(`${name} is outside the declared scope.`);
      if (highRisk.some(pattern => pattern.test(name))) findings.push(`${name} is in a high-risk area that needs explicit owner review.`);
    }
    if (!sourceFile.test(file.path) && !/\.sql$/.test(file.path)) continue;
    const before = file.status === 'A' ? '' : readAt(repository, mergeBase, file.from ?? file.path);
    const after = file.status === 'D' ? '' : readAt(repository, head, file.path);
    const term = authorizationTerm(`${addedText(before, after)}\n${addedText(after, before)}`);
    if (term) findings.push(`${file.path}: changed lines mention "${term}"; authorization and access-control changes need explicit owner review.`);
  }
  for (const change of packages) {
    if (change.dependencies.length) findings.push(`${change.manifest} changed ${change.dependencies.join(', ')}; license, security and compatibility need review.`);
    if (change.scripts.length) findings.push(`${change.manifest} scripts changed: ${change.scripts.join(', ')}.`);
    for (const { script, files: registeredFiles } of change.registered) findings.push(`${change.manifest} script ${script} registers test file(s) ${registeredFiles.join(', ')}; owner review must confirm they exist and run.`);
    failed.push(...change.weakened);
  }
  return verdictOf([...new Set(findings)], [...new Set(failed)]);
}

const defaultSelection = [/(?:^|\/)__tests__\/.*\.[jt]sx?$/, /(?:^|\/)(?:[^/]*\.)?(?:spec|test)\.[jt]sx?$/];
const unsupportedGlob = /[{}[\]()!?+@]/;

function jestSelection(directory, jest) {
  const inside = file => directory === '.' || file.startsWith(`${directory}/`);
  const rootDirectory = directory === '.' ? '' : directory;
  const patterns = Array.isArray(jest.testMatch) ? jest.testMatch.map(glob => glob.replaceAll('<rootDir>', rootDirectory).replace(/^\//, '')) : null;
  const regexes = [jest.testRegex ?? []].flat().map(value => new RegExp(value));
  const unevaluable = Boolean(jest.roots || jest.projects || (jest.preset && !patterns && !regexes.length) || patterns?.some(glob => unsupportedGlob.test(glob)));
  if (unevaluable) return { selects: file => inside(file) && testFile.test(file), unevaluable: JSON.stringify(jest) };
  const includes = (patterns ?? []).map(globPattern);
  const ignores = (jest.testPathIgnorePatterns ?? ['/node_modules/']).map(value => new RegExp(value.replaceAll('<rootDir>', rootDirectory ? `/${rootDirectory}` : '')));
  const matches = file => {
    if (patterns) return includes.some(pattern => pattern.test(file));
    if (regexes.length) return regexes.some(pattern => pattern.test(`/${file}`));
    return defaultSelection.some(pattern => pattern.test(file));
  };
  return { selects: file => inside(file) && matches(file) && !ignores.some(pattern => pattern.test(`/${file}`)), unevaluable: null };
}

const testRunners = new Set(['jest', 'vitest', 'mocha', 'ava', 'tap']);
const runsTests = tokens => tokens.includes('--test') || tokens.some(token => testRunners.has(token) || testFile.test(token) || /(?:^|\/)run-tests\.mjs$/.test(token));

function scriptSelection(directory, scripts) {
  const targets = Object.values(scripts ?? {}).flatMap(command => commandSegments(command).filter(runsTests).flat())
    .map(token => token.replace(/^['"]|['"]$/g, '')).filter(token => !token.startsWith('-'))
    .map(token => (directory === '.' ? token : path.posix.join(directory, token)).replace(/^\.\//, ''));
  const globs = targets.filter(target => target.includes('*')).map(globPattern);
  return file => targets.some(target => target === file || file.startsWith(target.endsWith('/') ? target : `${target}/`)) || globs.some(pattern => pattern.test(file));
}

function testSelector(view) {
  const selectors = [];
  const unevaluable = new Map();
  const presets = new Map();
  for (const manifestPath of [...view.files].filter(file => manifestFile.test(file))) {
    const manifest = parseJson(view.read(manifestPath));
    if (!manifest || typeof manifest !== 'object') continue;
    const directory = path.posix.dirname(manifestPath);
    selectors.push(scriptSelection(directory, manifest.scripts));
    const runsJest = Boolean(manifest.jest) || Object.values(manifest.scripts ?? {}).some(command => commandSegments(command).some(segment => segment.includes('jest')));
    if (!runsJest) continue;
    const jest = jestSelection(directory, manifest.jest ?? {});
    selectors.push(jest.selects);
    presets.set(manifestPath, manifest.jest?.preset ?? null);
    if (jest.unevaluable) unevaluable.set(manifestPath, jest.unevaluable);
  }
  return { selects: file => selectors.some(selector => selector(file)), unevaluable, presets };
}

function selectionChecks(files, before, after) {
  const findings = [];
  const failed = [];
  const was = testSelector(before);
  const now = testSelector(after);
  const runnable = file => testFile.test(file) && sourceFile.test(file);
  for (const file of before.files) {
    if (runnable(file) && after.has(file) && was.selects(file) && !now.selects(file)) failed.push(`${file}: still exists but no script or jest configuration selects it any more.`);
  }
  for (const [manifestPath, configuration] of now.unevaluable) {
    if (was.unevaluable.get(manifestPath) !== configuration) findings.push(`${manifestPath}: the jest configuration uses patterns this review cannot evaluate and changed.`);
  }
  for (const [manifestPath, preset] of now.presets) {
    if (was.presets.has(manifestPath) && was.presets.get(manifestPath) !== preset) findings.push(`${manifestPath}: the jest preset changed, which can change what runs.`);
  }
  for (const file of files) {
    if ((file.status === 'A' || file.from) && runnable(file.path) && !now.selects(file.path)) findings.push(`${file.path}: no script or jest configuration selects this test file, so it will not run.`);
    for (const name of [file.path, file.from].filter(Boolean)) {
      if (configurationFile.test(name)) findings.push(`${name}: test discovery configuration changed in a file this review cannot evaluate.`);
    }
  }
  return { findings, failed };
}

function testDimension(repository, files, mergeBase, head, views) {
  const findings = [];
  const failed = [];
  for (const file of files) {
    const fromPath = file.from ?? file.path;
    if (file.status === 'D' && testFile.test(fromPath)) {
      failed.push(`${fromPath}: test file deleted.`);
      continue;
    }
    if (file.from && testFile.test(file.from) && !testFile.test(file.path)) {
      failed.push(`${file.from}: test file renamed to ${file.path}, which is not a test file name.`);
    }
    if (file.status === 'A' || file.from) {
      try { checkPath(file.path); } catch (error) { failed.push(`${file.path}: ${error.message}`); }
    }
    if (file.status === 'D' || !textFile.test(file.path)) continue;
    const before = file.status === 'A' ? '' : readAt(repository, mergeBase, fromPath);
    const after = readAt(repository, head, file.path);
    try { checkAttribution(addedText(before, after), file.path); } catch (error) { failed.push(`${file.path}: ${error.message}`); }
    try {
      const comments = [sourceComments(fromPath, before), sourceComments(file.path, after)];
      try { checkAttribution(addedText(...comments), file.path); } catch (error) { failed.push(`${file.path}: ${error.message}`); }
      const introduced = commentViolations([{ file: file.path, text: after }], 'head').length - commentViolations([{ file: fromPath, text: before }], 'base').length;
      if (introduced > 0) failed.push(`${file.path}: adds ${introduced} source comment(s); the zero-comment policy applies to the delivered state.`);
    } catch (error) { findings.push(`${file.path}: comments could not be checked: ${error.message}`); }
    const isTest = testFile.test(file.path) || testFile.test(fromPath);
    const structured = sourceFile.test(file.path);
    if (!isTest && !(structured && guardsAssertions.test(before))) continue;
    let was;
    let now;
    try {
      was = structured ? testStructure(fromPath, before) : legacyStructure(before);
      now = structured ? testStructure(file.path, after) : legacyStructure(after);
    } catch (error) {
      findings.push(`${file.path}: tests could not be compared: ${error.message}`);
      continue;
    }
    if (isTest && now.disabled > was.disabled) failed.push(`${file.path}: disabled tests increased from ${was.disabled} to ${now.disabled}.`);
    if (isTest && now.disabled <= was.disabled && now.unconditional > was.unconditional) failed.push(`${file.path}: unconditionally disabled tests increased from ${was.unconditional} to ${now.unconditional}.`);
    if (isTest && now.declarations < was.declarations) findings.push(`${file.path}: test declarations decreased from ${was.declarations} to ${now.declarations}.`);
    const added = missingItems(now.assertions, was.assertions);
    const removed = [];
    for (const item of missingItems(was.assertions, now.assertions)) {
      const extras = added.map(candidate => appendedTokens(lineTokens(item), [lineTokens(candidate)])).find(Boolean);
      if (!extras?.every(token => testFile.test(token))) removed.push(item);
      else if (extras.some(token => !existsAt(repository, head, token))) failed.push(`${file.path}: assertion registers a test file that does not exist at the head: ${extras.join(', ')}`);
      else findings.push(`${file.path}: assertion extended with registered test file(s) ${extras.join(', ')}; owner review must confirm the original protection is intact.`);
    }
    if (removed.length) findings.push(`${file.path}: ${removed.length} assertion(s) removed, altered or moved behind control flow, first: ${removed[0].slice(0, 200)}`);
  }
  const selection = selectionChecks(files, views.before, views.after);
  return verdictOf([...findings, ...selection.findings], [...failed, ...selection.failed]);
}

const moduleFile = file => sourceFile.test(file) && !testFile.test(file);
const stemOf = file => path.posix.basename(file).replace(/(?:\.[^.]+)+$/, '');
const sourceGlobs = ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs', '*.cjs', '*.mts', '*.cts'];
const dynamicLoad = ['(require|import)[[:space:]]*\\([[:space:]]*[^\'"`[:space:])]', '(require|import)[[:space:]]*\\([[:space:]]*`[^`]*\\$\\{'];

const dynamicLoads = (repository, head) => grepRevision(repository, head, ['-E', ...dynamicLoad.flatMap(pattern => ['-e', pattern]), head, '--', ...sourceGlobs], 'dynamic loads');

function removedModuleChecks(repository, head, removed, before, after) {
  const findings = [];
  const failed = [];
  if (!removed.length) return { findings, failed };
  const gone = new Map(removed.map(file => [file.from ?? file.path, file]));
  const origins = new Map(removed.filter(file => file.status === 'R').map(file => [file.path, file.from]));
  const importers = new Set(origins.keys());
  for (const file of removed) {
    const original = file.from ?? file.path;
    const mentioned = stemOf(original) === 'index' ? [...after.files] : grepHead(repository, head, stemOf(original)).map(line => line.split(':')[0]);
    for (const candidate of mentioned) if (sourceFile.test(candidate)) importers.add(candidate);
    const location = grepHead(repository, head, original.replace(/\.[^./]+$/, '')).filter(line => !line.startsWith(`${file.path}:`));
    if (location.length) findings.push(`${original} was ${file.status === 'R' ? `renamed to ${file.path}` : 'removed'} but its path is still mentioned at ${location[0]}; owner review must confirm no reference was left behind.`);
  }
  const names = [...importers].filter(candidate => after.has(candidate));
  const described = describeModules(names.map(file => ({ file, text: after.read(file) })));
  described.forEach((module, index) => {
    const importer = names[index];
    if (!module) {
      findings.push(`${importer}: references could not be compared: Invalid syntax in ${importer}.`);
      return;
    }
    for (const use of module.uses) {
      const resolution = resolveModule(after, importer, use.specifier);
      if (!resolution || resolution.found.length) continue;
      const lostTarget = resolution.candidates.find(candidate => gone.has(candidate));
      const origin = origins.get(importer);
      const movedAway = origin !== undefined && Boolean(resolveModule(before, origin, use.specifier)?.found.length);
      if (!lostTarget && !movedAway) continue;
      const lost = lostTarget ? gone.get(lostTarget) : null;
      const reason = lost ? `${lostTarget} was ${lost.status === 'R' ? `renamed to ${lost.path}` : 'removed'}` : `${importer} moved from ${origin}`;
      failed.push(`${importer}:${use.line}: ${use.specifier} no longer resolves because ${reason}.`);
    }
  });
  const dynamic = dynamicLoads(repository, head);
  if (dynamic.length) findings.push(`${dynamic[0].split(':').slice(0, 2).join(':')}: dynamic require or import cannot be resolved statically while ${removed.length} module(s) were removed or renamed; a runtime reference cannot be excluded.`);
  return { findings, failed };
}

function removedExportChecks(repository, head, file, name, declaration, now, before, after) {
  const findings = [];
  const failed = [];
  const isDefault = name === 'default';
  const mentions = grepHead(repository, head, isDefault ? stemOf(file.path) : name).filter(line => !line.startsWith(`${file.path}:`));
  if (!mentions.length) {
    findings.push(`${file.path}: export ${name} was removed and has no static reference left, but static absence is not proof of non-use (routes, configuration, runtime registration, backend contracts); uncertain usage means do not delete.`);
    return { findings, failed };
  }
  if (now.star) {
    findings.push(`${file.path}: export ${name} was removed while the file re-exports another module with export *; owner review must confirm consumers still receive it.`);
    return { findings, failed };
  }
  const mentioning = [...new Set(mentions.map(line => line.split(':')[0]))];
  const consumers = mentioning.filter(candidate => moduleOrSource(candidate) && after.has(candidate));
  const lineOf = consumer => mentions.find(line => line.startsWith(`${consumer}:`));
  for (const other of isDefault ? [] : mentioning.filter(candidate => !consumers.includes(candidate))) findings.push(`${file.path}: export ${name} was removed but ${lineOf(other)} still mentions it outside source code; owner review must confirm it is unrelated.`);
  const described = describeModules(consumers.map(consumer => ({ file: consumer, text: after.read(consumer) })));
  consumers.forEach((consumer, index) => {
    const module = described[index];
    if (!module) {
      findings.push(`${consumer}: references could not be compared: Invalid syntax in ${consumer}.`);
      return;
    }
    if (!isDefault && typeof module.exports.get(name) === 'string') return;
    let bound = false;
    for (const use of module.uses) {
      const named = use.names.has(name);
      const resolution = resolveModule(after, consumer, use.specifier);
      const fromOriginal = Boolean(resolution?.found.includes(file.path));
      if (named) bound = true;
      if (fromOriginal && named) failed.push(`${file.path}: export ${name} was removed but is still referenced at ${lineOf(consumer)}.`);
      else if (fromOriginal && use.names.has('*')) {
        bound = true;
        findings.push(`${file.path}: export ${name} was removed while ${consumer}:${use.line} loads the whole module; owner review must confirm it does not use ${name}.`);
      } else if (named && resolution?.found.length) {
        const destination = resolution.found[0];
        const [target] = moduleOrSource(destination) ? describeModules([{ file: destination, text: after.read(destination) }]) : [null];
        const prior = before.has(destination) && moduleOrSource(destination) ? describeModules([{ file: destination, text: before.read(destination) }])[0] : null;
        const declared = target?.exports.get(name);
        if (!target) findings.push(`${consumer}:${use.line}: ${name} is now imported from ${destination}, which cannot be compared; owner review required.`);
        else if (declared === undefined && !target.star) failed.push(`${consumer}:${use.line}: ${name} is imported from ${destination}, which does not export it.`);
        else if (declared === undefined || declared === null) findings.push(`${consumer}:${use.line}: ${name} is now imported from ${destination} through a re-export whose declaration cannot be compared with the removed one; owner review required.`);
        else if (prior?.exports.has(name)) findings.push(`${consumer}:${use.line}: ${name} is now imported from ${destination}, which already exported a different ${name} before this change; owner review must confirm the symbol is the same.`);
        else if (declared !== declaration) findings.push(`${consumer}:${use.line}: ${name} is now imported from ${destination}, whose declaration differs from the removed one; owner review must confirm the behavior is unchanged.`);
      }
    }
    if (!bound && !isDefault) findings.push(`${consumer}: mentions ${name} without importing it, and ${file.path} no longer exports it; owner review must confirm the mention is unrelated.`);
  });
  return { findings, failed };
}

const moduleOrSource = file => sourceFile.test(file);

function deadCodeDimension(repository, files, mergeBase, head, views) {
  const findings = [];
  const failed = [];
  const note = subject => `${subject} has no static reference left, but static absence is not proof of non-use (routes, configuration, runtime registration, backend contracts); uncertain usage means do not delete.`;
  const removed = files.filter(file => (file.status === 'D' || file.status === 'R') && moduleFile(file.from ?? file.path));
  for (const file of files) {
    const original = file.from ?? file.path;
    if (file.status === 'D' && moduleFile(original)) {
      const stem = stemOf(original);
      const references = grepHead(repository, head, stem);
      if (references.length) failed.push(`${original} was removed but ${stem} is still referenced at ${references[0]}.`);
      else findings.push(note(`${original} was removed and`));
    }
    if ((file.status === 'M' || file.status === 'R') && moduleFile(file.path)) {
      let was;
      let now;
      try {
        [was] = describeModules([{ file: original, text: readAt(repository, mergeBase, original) }]);
        [now] = describeModules([{ file: file.path, text: readAt(repository, head, file.path) }]);
      } catch (error) {
        findings.push(`${file.path}: exports could not be compared: ${error.message}`);
        continue;
      }
      if (!was || !now) {
        findings.push(`${file.path}: exports could not be compared: Invalid syntax in ${was ? file.path : original}.`);
        continue;
      }
      for (const specifier of was.stars) {
        if (!now.stars.includes(specifier)) findings.push(`${file.path}: export * from ${specifier} was removed, so the names it re-exported cannot be listed; owner review must confirm no consumer still imports them.`);
      }
      for (const [name, declaration] of was.exports) {
        if (now.exports.has(name)) continue;
        const result = removedExportChecks(repository, head, file, name, declaration, now, views.before, views.after);
        findings.push(...result.findings);
        failed.push(...result.failed);
      }
    }
  }
  const references = removedModuleChecks(repository, head, removed, views.before, views.after);
  return verdictOf([...findings, ...references.findings], [...failed, ...references.failed]);
}

const treeBound = (repository, head) => git(repository, ['rev-parse', 'HEAD']).trim() === head && git(repository, ['status', '--porcelain']).trim() === '';

function runCommands(repository, scripts, head) {
  const bound = treeBound(repository, head);
  if (!bound) return { bound, invalidated: null, results: [] };
  const manifest = JSON.parse(readFileSync(path.join(repository, 'package.json'), 'utf8'));
  const installation = path.dirname(process.execPath);
  const cli = [process.env.npm_execpath, path.join(installation, 'node_modules/npm/bin/npm-cli.js'), path.join(installation, '../lib/node_modules/npm/bin/npm-cli.js')]
    .find(candidate => candidate && existsSync(candidate));
  if (scripts.length && !cli) throw new Error('The npm CLI was not found; run this through npm or set npm_execpath.');
  const results = [];
  let invalidated = null;
  for (const script of scripts) {
    if (!manifest.scripts?.[script]) throw new Error(`package.json has no script named ${script}.`);
    const child = spawnSync(process.execPath, [cli, 'run', script], {
      cwd: repository, env: Object.fromEntries(Object.entries(gitEnvironment()).filter(([name]) => !/^NODE_TEST_CONTEXT$/i.test(name))), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 30 * 60 * 1000, windowsHide: true,
    });
    results.push({ script, exitCode: child.status ?? 1, error: child.error?.message ?? null, outputTail: `${child.stdout}${child.stderr}`.slice(-1500) });
    if (!treeBound(repository, head)) {
      invalidated = script;
      break;
    }
  }
  return { bound, invalidated, results };
}

function correctnessDimension(commands) {
  const findings = [];
  const failed = [];
  if (!commands.bound) findings.push('Command results were not recorded: HEAD differs from the frozen head or the working tree is dirty.');
  if (commands.invalidated) findings.push(`npm run ${commands.invalidated} changed the working tree or HEAD, so no command result describes the frozen head.`);
  for (const result of commands.results) {
    if (result.exitCode !== 0) failed.push(`npm run ${result.script} exited ${result.exitCode}${result.error ? `: ${result.error}` : ''}.`);
  }
  const valid = commands.invalidated ? [] : commands.results;
  for (const script of requiredCommands) {
    if (!valid.some(result => result.script === script)) findings.push(`npm run ${script} was not run on the frozen head.`);
  }
  return verdictOf(findings, failed);
}

function codeHealthDimension(repository, files, mergeBase, head, attestation) {
  const diagnostics = [];
  for (const file of files) {
    if (file.status === 'D' || !sourceFile.test(file.path)) continue;
    const before = file.status === 'A' ? 0 : readAt(repository, mergeBase, file.from ?? file.path).split('\n').length - 1;
    const after = readAt(repository, head, file.path).split('\n').length - 1;
    diagnostics.push({ path: file.path, linesBefore: before, linesAfter: after });
  }
  const findings = [];
  if (!attestation.attested) findings.push(...attestation.reasons);
  else {
    const { verdict, evidence, unresolved } = attestation.codeHealth;
    if (verdict === FAIL) return { ...verdictOf([], [`Reviewer reported a code-health failure: ${evidence.join('; ') || 'no evidence given'}`]), diagnostics };
    if (verdict === INSUFFICIENT) findings.push('The reviewer could not reach a verdict.');
    else if (!evidence.length) findings.push('A PASS verdict needs file and line evidence.');
    else if (unresolved.length) findings.push(`The PASS evidence does not resolve to existing lines at the head: ${unresolved.join(', ')}`);
  }
  return { ...verdictOf(findings, []), diagnostics };
}

export function reviewDiff({ repository = root, base = 'origin/main', head = 'HEAD', scope = [], run = [], reviewer = null } = {}) {
  const baseSha = git(repository, ['rev-parse', '--verify', `${base}^{commit}`]).trim();
  const headSha = git(repository, ['rev-parse', '--verify', `${head}^{commit}`]).trim();
  const mergeBase = git(repository, ['merge-base', baseSha, headSha]).trim();
  const files = changedFiles(repository, mergeBase, headSha);
  const views = { before: revisionView(repository, mergeBase), after: revisionView(repository, headSha) };
  const packages = files.filter(file => manifestFile.test(file.path) && file.status === 'M').map(file => packageChanges(repository, mergeBase, headSha, file.path));
  const commands = runCommands(repository, run, headSha);
  const attestation = verifyAttestation(repository, reviewer, { headSha, mergeBase, view: views.after });
  const dimensions = {
    correctness: correctnessDimension(commands),
    codeHealth: codeHealthDimension(repository, files, mergeBase, headSha, attestation),
    deadCodeSafety: deadCodeDimension(repository, files, mergeBase, headSha, views),
    scope: scopeDimension(repository, files, mergeBase, headSha, scope, packages),
    testIntegrity: testDimension(repository, files, mergeBase, headSha, views),
  };
  const verdicts = Object.values(dimensions).map(dimension => dimension.verdict);
  const verdict = verdicts.includes(FAIL) ? FAIL : verdicts.includes(INSUFFICIENT) ? INSUFFICIENT : PASS;
  return {
    base: { ref: base, sha: baseSha }, head: { ref: head, sha: headSha }, mergeBase,
    files: files.map(file => ({ status: file.status, path: file.path, ...(file.from ? { from: file.from } : {}) })),
    commands: commands.results, reviewer: { tag: reviewer, attested: attestation.attested, signer: attestation.signer, key: attestation.key }, dimensions, verdict,
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
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const packet = reviewDiff(options);
    console.log(JSON.stringify(packet, null, 2));
    process.exitCode = { [PASS]: 0, [FAIL]: 1, [INSUFFICIENT]: 2 }[packet.verdict];
  } catch (error) {
    console.error(error.message);
    console.log(JSON.stringify({ verdict: INSUFFICIENT, error: error.message }, null, 2));
    process.exitCode = 3;
  }
}
