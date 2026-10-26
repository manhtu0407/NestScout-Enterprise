import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, toolPath } from './tool-path.mjs';
import { scanStaged, secretScanOptions, secretScanEnvironment } from './scan-staged.mjs';
import { git, repositoryFiles } from './repository-files.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { parseDocument } from 'yaml';

const run = (name, args) => execFileSync(toolPath(name), args, { cwd: root, env: secretScanEnvironment(), stdio: 'inherit' });

// Hosted workflows run with repository credentials, so their trust boundary is checked in every Git state:
// only reviewed triggers, no write tokens, and immutable action references.
const trustedTriggers = new Set(['pull_request', 'push', 'workflow_dispatch', 'workflow_call']);
const pinnedAction = /^(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?@[a-f0-9]{40}|docker:\/\/\S+@sha256:[a-f0-9]{64}|\.\/\S+)$/;
const readOnly = value => value === 'read-all' || (value && typeof value === 'object' && !Array.isArray(value)
  && Object.values(value).every(level => level === 'read' || level === 'none'));

export function workflowPolicyViolations(text) {
  const document = parseDocument(text, { uniqueKeys: true });
  const workflow = document.toJS();
  const found = [];
  if (document.errors.length || !workflow || typeof workflow !== 'object') return ['workflow is not a valid YAML mapping'];
  const on = workflow.on;
  const triggers = typeof on === 'string' ? { [on]: null } : Array.isArray(on) ? Object.fromEntries(on.map(name => [name, null])) : on;
  if (!triggers || typeof triggers !== 'object' || !Object.keys(triggers).length) found.push('workflow needs explicit triggers');
  for (const [name, config] of Object.entries(triggers ?? {})) {
    if (!trustedTriggers.has(name)) found.push(`untrusted trigger: ${name}`);
    if (name === 'push' && (!Array.isArray(config?.branches) || config.branches.join() !== 'main' || config.tags || config['tags-ignore'] || config['branches-ignore'])) {
      found.push('push must be limited to branches: [main]');
    }
  }
  if (!readOnly(workflow.permissions)) found.push('top-level permissions must be explicit and read-only');
  const jobs = workflow.jobs && typeof workflow.jobs === 'object' ? Object.entries(workflow.jobs) : [];
  if (!jobs.length) found.push('workflow has no jobs');
  for (const [id, job] of jobs) {
    if (job?.permissions !== undefined && !readOnly(job.permissions)) found.push(`job ${id}: permissions must be read-only`);
    if (typeof job?.uses === 'string' && !pinnedAction.test(job.uses)) found.push(`job ${id}: reusable workflow is not immutably pinned`);
    for (const [index, step] of (Array.isArray(job?.steps) ? job.steps : []).entries()) {
      if (typeof step?.uses === 'string' && !pinnedAction.test(step.uses)) found.push(`job ${id} step ${index + 1}: action is not pinned to a full commit SHA`);
    }
  }
  return found;
}

export function checkWorkflowPolicy(repository = root) {
  for (const { file, state, content } of repositoryFiles(repository).filter(item => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(item.file))) {
    const violations = workflowPolicyViolations(new TextDecoder('utf-8', { fatal: true }).decode(content));
    if (violations.length) throw new Error(`Unsafe ${state} workflow ${file}: ${violations.join('; ')}.`);
  }
}

export function checkWorkflows(repository = root, stdio = 'inherit') {
  checkWorkflowPolicy(repository);
  const inspected = new Map();
  const workflows = repositoryFiles(repository).filter(item => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(item.file));
  if (!workflows.length) throw new Error('No repository workflows found.');
  for (const { file, state, content } of workflows) {
    if (inspected.get(file)?.equals(content)) continue;
    try {
      execFileSync(toolPath('actionlint'), ['-color', '-shellcheck=', '-pyflakes=', '-stdin-filename', file, '-'], {
        cwd: repository, env: gitEnvironment(), input: content, stdio: ['pipe', stdio, stdio],
      });
    } catch (error) {
      throw new Error(`Invalid ${state} workflow ${file} (actionlint exit ${error.status ?? 'unavailable'}).`, { cause: error });
    }
    inspected.set(file, content);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (process.argv.length !== 3) throw new Error('Use workflows or secrets.');
  if (mode === 'workflows') {
    checkWorkflows();
  } else if (mode === 'secrets') {
    scanStaged(root);
    run('gitleaks', ['git', ...secretScanOptions, '--log-opts=--all', root]);
    // Also cover staged and uncommitted files; never scan node_modules or tool caches.
    const files = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-secret-scan-'));
    try {
      for (const file of new Set(files)) {
        const destination = path.resolve(directory, file);
        if (!destination.startsWith(directory + path.sep)) throw new Error('Invalid file path.');
        mkdirSync(path.dirname(destination), { recursive: true });
        try {
          const source = path.join(root, file);
          if (!lstatSync(source).isFile()) throw new Error(`Only regular files may be scanned: ${file}`);
          copyFileSync(source, destination);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error; // Deleted tracked files have no working copy.
        }
      }
      run('gitleaks', ['dir', ...secretScanOptions, directory]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  } else {
    throw new Error('Use workflows or secrets. Run npm run tools:install first.');
  }
}
