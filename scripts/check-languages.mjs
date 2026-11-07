import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { repositoryFiles } from './repository-files.mjs';
import { root } from './tool-path.mjs';

export const policyPath = 'scripts/language-policy.json';

const topLevelKeys = ['version', 'conditionalLanguages', 'languages', 'interpreters', 'manifests', 'setupActions', 'modules', 'exceptions', 'kaelBackend'];
const modulePattern = /^(?:\.?[a-z0-9][a-z0-9-]*\/)+$/;
const kaelBackendPaths = ['services/kael-core/', 'supabase/functions/kael/'];
const kaelBackendPriority = ['rust', 'python', 'go'];

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value) || Object.keys(value).sort().join() !== [...expected].sort().join()) {
    fail(label, `expected exactly the keys ${expected.join(', ')}`);
  }
}

function text(value, minimum, label) {
  if (typeof value !== 'string' || value.trim().length < minimum || value !== value.trim()) {
    fail(label, `expected trimmed text of at least ${minimum} characters`);
  }
}

function safeScope(value, label) {
  const parts = typeof value === 'string' ? value.split('/') : [];
  if (typeof value !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(value) || value.startsWith('/')
    || parts.some((part, index) => part === '.' || part === '..' || (!part && index !== parts.length - 1))) {
    fail(label, 'expected a safe repository-relative file or directory path');
  }
}

const covers = (exception, file) => (exception.path.endsWith('/') ? file.startsWith(exception.path) : file === exception.path);

function overlapsScope(exception, scope) {
  return exception.path.startsWith(scope)
    || exception.path === scope.slice(0, -1)
    || (exception.path.endsWith('/') && scope.startsWith(exception.path));
}

export function parsePolicy(content, label) {
  let policy;
  try {
    policy = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  } catch {
    fail(label, 'invalid JSON');
  }
  exactKeys(policy, topLevelKeys, label);
  if (policy.version !== 2) fail(label, 'unsupported policy version');

  if (!isRecord(policy.languages) || !Object.keys(policy.languages).length) fail(label, 'languages must be a nonempty mapping');
  const extensions = new Map();
  for (const [language, list] of Object.entries(policy.languages)) {
    if (!/^[a-z]+$/.test(language) || !Array.isArray(list) || !list.length) fail(label, `invalid language ${JSON.stringify(language)}`);
    for (const extension of list) {
      if (!/^\.[a-z0-9]+$/.test(extension) || extensions.has(extension)) fail(label, `invalid or duplicated extension ${JSON.stringify(extension)}`);
      extensions.set(extension, language);
    }
  }
  const known = new Set(Object.keys(policy.languages));

  if (!Array.isArray(policy.conditionalLanguages) || policy.conditionalLanguages.some(language => !known.has(language))) {
    fail(label, 'conditionalLanguages must list known languages');
  }
  const conditional = new Set(policy.conditionalLanguages);

  for (const [field, keyPattern] of [['interpreters', /^[a-z]+$/], ['manifests', /^[A-Za-z0-9._-]+$/], ['setupActions', /^[a-z0-9._/-]+$/]]) {
    if (!isRecord(policy[field])) fail(label, `${field} must be a mapping`);
    for (const [key, language] of Object.entries(policy[field])) {
      if (!keyPattern.test(key) || !known.has(language)) fail(label, `invalid ${field} entry ${JSON.stringify(key)}`);
    }
  }

  if (!Array.isArray(policy.modules) || !policy.modules.length) fail(label, 'modules must be a nonempty list');
  const owners = new Set();
  for (const module of policy.modules) {
    exactKeys(module, ['path', 'domain', 'languages'], `${label} module`);
    if (!modulePattern.test(module.path) || owners.has(module.path)) fail(label, `invalid or duplicated module path ${JSON.stringify(module.path)}`);
    owners.add(module.path);
    text(module.domain, 3, `${label} module ${module.path}`);
    if (!Array.isArray(module.languages) || !module.languages.length
      || module.languages.some(language => !known.has(language) || conditional.has(language))) {
      fail(label, `module ${module.path} must list known, non-conditional languages; conditional languages need an exception`);
    }
  }

  exactKeys(policy.kaelBackend, ['paths', 'priority', 'legacyTypeScript'], `${label} kaelBackend`);
  if (!Array.isArray(policy.kaelBackend.paths)
    || policy.kaelBackend.paths.join() !== kaelBackendPaths.join()) {
    fail(label, `kaelBackend paths must remain ${kaelBackendPaths.join(', ')}`);
  }
  if (!Array.isArray(policy.kaelBackend.priority)
    || policy.kaelBackend.priority.join() !== kaelBackendPriority.join()) {
    fail(label, `Kael backend language priority must remain ${kaelBackendPriority.join(' -> ')}`);
  }
  for (const backendPath of kaelBackendPaths) {
    const owner = policy.modules.find(module => module.path === backendPath);
    if (!owner || owner.languages.join() !== kaelBackendPriority.join()) {
      fail(label, `Kael backend module ${backendPath} must allow languages in priority order`);
    }
  }

  if (!Array.isArray(policy.kaelBackend.legacyTypeScript)) fail(label, 'kaelBackend legacyTypeScript must be a list');
  const legacyTypeScript = new Set();
  for (const file of policy.kaelBackend.legacyTypeScript) {
    safeScope(file, `${label} legacy TypeScript`);
    if (file.endsWith('/') || !kaelBackendPaths.some(backendPath => file.startsWith(backendPath))
      || extensions.get(path.posix.extname(file).toLowerCase()) !== 'typescript') {
      fail(label, `legacy TypeScript path is outside the Kael backend or is not TypeScript: ${JSON.stringify(file)}`);
    }
    if (legacyTypeScript.has(file)) fail(label, `duplicated legacy TypeScript path ${file}`);
    legacyTypeScript.add(file);
  }

  if (!Array.isArray(policy.exceptions)) fail(label, 'exceptions must be a list');
  const granted = new Set();
  for (const exception of policy.exceptions) {
    exactKeys(exception, ['path', 'language', 'justification', 'approval'], `${label} exception`);
    safeScope(exception.path, `${label} exception`);
    if (!known.has(exception.language)) fail(label, `exception for unknown language ${JSON.stringify(exception.language)}`);
    text(exception.justification, 40, `${label} exception ${exception.path} justification`);
    text(exception.approval, 20, `${label} exception ${exception.path} approval`);
    const identity = `${exception.language}:${exception.path}`;
    if (granted.has(identity)) fail(label, `duplicated exception ${identity}`);
    if (kaelBackendPaths.some(backendPath => overlapsScope(exception, backendPath))) {
      fail(label, `language exceptions cannot expand the Kael backend legacy or implementation boundary: ${exception.path}`);
    }
    granted.add(identity);
  }

  return {
    extensions,
    interpreters: policy.interpreters,
    manifests: policy.manifests,
    setupActions: Object.entries(policy.setupActions),
    modules: [...policy.modules].sort((a, b) => b.path.length - a.path.length),
    exceptions: policy.exceptions,
    kaelBackend: { paths: kaelBackendPaths, priority: kaelBackendPriority, legacyTypeScript },
  };
}

function shebangLanguage(content, policy) {
  const first = content.subarray(0, 256).toString('utf8').split('\n')[0];
  const match = /^#!\s*(\S+)(?:\s+(.+))?/.exec(first);
  if (!match) return null;
  let program = path.posix.basename(match[1]);
  if (program === 'env') program = (match[2] ?? '').split(/\s+/).find(argument => argument && !argument.startsWith('-')) ?? '';
  return policy.interpreters[path.posix.basename(program).replace(/[0-9.]+$/, '')] ?? null;
}

function workflowLanguages(content, policy, label) {
  let document;
  try {
    document = parseYaml(content.toString('utf8'));
  } catch {
    fail(label, 'invalid workflow YAML');
  }
  const found = new Set();
  for (const job of Object.values(document?.jobs ?? {})) {
    const references = [job?.uses, ...(Array.isArray(job?.steps) ? job.steps.map(step => step?.uses) : [])];
    for (const reference of references) {
      const value = typeof reference === 'string' ? reference.toLowerCase() : '';
      for (const [prefix, language] of policy.setupActions) if (value.startsWith(prefix)) found.add(language);
    }
  }
  return found;
}

function sourceLanguages(file, content, policy) {
  const found = new Set();
  const base = path.posix.basename(file);
  if (Object.hasOwn(policy.manifests, base)) found.add(policy.manifests[base]);
  const extension = path.posix.extname(base).toLowerCase();
  if (policy.extensions.has(extension)) found.add(policy.extensions.get(extension));
  else if (!extension) {
    const interpreted = shebangLanguage(content, policy);
    if (interpreted) found.add(interpreted);
  }
  if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)) {
    for (const language of workflowLanguages(content, policy, file)) found.add(language);
  }
  return found;
}

function checkSnapshot(files, state) {
  const label = `${state} ${policyPath}`;
  const policyFile = files.find(item => item.file === policyPath);
  if (!policyFile) fail(label, 'language policy is missing');
  const policy = parsePolicy(policyFile.content, label);
  const detections = [];
  for (const { file, content } of files) {
    for (const language of sourceLanguages(file, content, policy)) detections.push({ file, language });
  }
  for (const { file, language } of detections) {
    const owner = policy.modules.find(module => file.startsWith(module.path));
    const isKaelBackend = policy.kaelBackend.paths.some(backendPath => file.startsWith(backendPath));
    if (isKaelBackend && language === 'typescript' && policy.kaelBackend.legacyTypeScript.has(file)) continue;
    const workflowRuntime = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(file)
      && policy.kaelBackend.priority.includes(language)
      && detections.some(item => item.language === language
        && policy.kaelBackend.paths.some(backendPath => item.file.startsWith(backendPath)));
    if (workflowRuntime) continue;
    if (owner?.languages.includes(language) || policy.exceptions.some(exception => exception.language === language && covers(exception, file))) continue;
    fail(`${state} ${file}`, `${language} is not approved for ${owner ? owner.domain : 'an unowned path'}; a new language needs a justified, architecture-approved exception in ${policyPath}`);
  }
  for (const file of policy.kaelBackend.legacyTypeScript) {
    if (!detections.some(item => item.file === file && item.language === 'typescript')) {
      fail(label, `legacy TypeScript entry is missing from ${state}: ${file}`);
    }
  }
  for (const exception of policy.exceptions) {
    if (!detections.some(({ file, language }) => language === exception.language && covers(exception, file))) {
      fail(label, `stale exception for ${exception.language} at ${exception.path}; remove permissions that nothing uses`);
    }
  }
  return detections.length;
}

export function checkLanguages(repository = root) {
  const files = repositoryFiles(repository);
  return ['index', 'working'].map(state => checkSnapshot(files.filter(item => item.state === state), state));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Use no arguments.');
  const [indexed, working] = checkLanguages();
  console.log(`Language policy passed for index (${indexed} governed files) and working tree (${working} governed files).`);
}
