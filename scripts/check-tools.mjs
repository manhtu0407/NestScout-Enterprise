import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, toolPath } from './tool-path.mjs';
import { scanStaged, secretScanOptions } from './scan-staged.mjs';
import { git, repositoryFiles } from './repository-files.mjs';
import { gitEnvironment } from './git-environment.mjs';

const run = (name, args) => execFileSync(toolPath(name), args, { cwd: root, env: gitEnvironment(), stdio: 'inherit' });
export function checkWorkflows(repository = root, stdio = 'inherit') {
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
