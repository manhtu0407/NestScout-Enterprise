import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function git(repository, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repository, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024, ...options,
  });
}

export function indexEntries(repository) {
  return git(repository, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t');
    const [mode, blob, stage] = entry.slice(0, tab).split(' ');
    return { mode, blob, stage, file: entry.slice(tab + 1) };
  });
}

export function repositoryFiles(repository) {
  const entries = indexEntries(repository);
  const names = new Set(entries.map(entry => entry.file));
  for (const file of git(repository, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) names.add(file);
  const files = [];
  for (const entry of entries) {
    if (!['100644', '100755'].includes(entry.mode) || entry.stage !== '0') {
      throw new Error(`Expected a regular resolved index entry: ${JSON.stringify(entry.file)}`);
    }
    files.push({ file: entry.file, state: 'index', content: git(repository, ['cat-file', 'blob', entry.blob], { encoding: 'buffer' }) });
  }
  const directories = new Map();
  for (const file of names) {
    let directory = repository;
    try {
      for (const part of file.split('/')) {
        if (!directories.has(directory)) directories.set(directory, readdirSync(directory));
        if (!directories.get(directory).includes(part)) {
          if (directories.get(directory).some(name => name.toLowerCase() === part.toLowerCase())) {
            throw new Error(`Working filename case differs from Git: ${JSON.stringify(file)}`);
          }
          const missing = new Error('Absent working file');
          missing.code = 'ENOENT';
          throw missing;
        }
        directory = path.join(directory, part);
        if (lstatSync(directory).isSymbolicLink()) throw new Error(`Working symlink is not supported: ${JSON.stringify(file)}`);
      }
      if (!lstatSync(directory).isFile()) throw new Error(`Expected a regular working file: ${JSON.stringify(file)}`);
      files.push({ file, state: 'working', content: readFileSync(directory) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
}
