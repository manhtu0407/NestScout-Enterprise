import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, lstatSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, toolPath } from './tool-path.mjs';
import { scanStaged, secretScanOptions } from './scan-staged.mjs';
import { git } from './repository-files.mjs';
import { gitEnvironment } from './git-environment.mjs';

const mode = process.argv[2];
const run = (name, args) => execFileSync(toolPath(name), args, { cwd: root, env: gitEnvironment(), stdio: 'inherit' });
if (mode === 'workflows') {
  run('actionlint', ['-color', '-shellcheck=', '-pyflakes=']);
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
