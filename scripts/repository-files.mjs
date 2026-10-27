import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { gitEnvironment } from './git-environment.mjs';

export const blobByteLimit = 32 * 1024 * 1024;
const snapshotByteLimit = 128 * 1024 * 1024;

export function git(repository, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repository, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024, ...options, env: gitEnvironment(options.env ?? process.env),
  });
}

export function checkHookIndex(repository, environment = process.env) {
  if (!environment.GIT_INDEX_FILE) return;
  const expected = path.resolve(git(repository, ['rev-parse', '--path-format=absolute', '--git-path', 'index']).trim());
  const selected = path.resolve(repository, environment.GIT_INDEX_FILE);
  const normalize = value => {
    const canonical = path.join(realpathSync.native(path.dirname(value)), path.basename(value));
    return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  };
  if (normalize(selected) !== normalize(expected)) {
    throw new Error('Alternate Git indexes are unsupported by repository hooks. Stage the intended files and use an ordinary commit.');
  }
}

export function indexEntries(repository) {
  return git(repository, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t');
    const [mode, blob, stage] = entry.slice(0, tab).split(' ');
    return { mode, blob, stage, file: entry.slice(tab + 1) };
  });
}

export function readBlobs(repository, objects) {
  const blobs = [...new Set(objects)];
  const contents = new Map();
  if (blobs.length) {
    const input = blobs.join('\n') + '\n';
    const sizes = git(repository, ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input }).trim().split('\n');
    let total = 0;
    for (let i = 0; i < sizes.length; i++) {
      const [blob, type, bytes] = sizes[i].split(' ');
      if (blob !== blobs[i] || type !== 'blob' || !/^\d+$/.test(bytes) || Number(bytes) > blobByteLimit || (total += Number(bytes)) > snapshotByteLimit) {
        throw new Error('Index blob is missing, exceeds 32 MiB, or the unique index snapshot exceeds 128 MiB.');
      }
    }
    const output = git(repository, ['cat-file', '--batch'], { input, encoding: null, maxBuffer: total + blobs.length * 128 });
    let offset = 0;
    for (const blob of blobs) {
      const newline = output.indexOf(10, offset);
      const header = output.subarray(offset, newline).toString('ascii');
      const expected = sizes[contents.size];
      if (newline < 0 || header !== expected) throw new Error('Unexpected Git batch blob header.');
      const length = Number(header.split(' ')[2]);
      const start = newline + 1;
      if (start + length >= output.length || output[start + length] !== 10) throw new Error('Truncated Git batch blob.');
      contents.set(blob, output.subarray(start, start + length));
      offset = start + length + 1;
    }
    if (offset !== output.length) throw new Error('Unexpected trailing Git batch data.');
  }
  return contents;
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
  }
  const contents = readBlobs(repository, entries.map(entry => entry.blob));
  for (const entry of entries) files.push({ file: entry.file, state: 'index', content: contents.get(entry.blob) });
  const directories = new Map();
  let workingBytes = 0;
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
      const stat = lstatSync(directory);
      if (!stat.isFile()) throw new Error(`Expected a regular working file: ${JSON.stringify(file)}`);
      if (stat.size > blobByteLimit || (workingBytes += stat.size) > snapshotByteLimit) throw new Error('Working blob exceeds 32 MiB or working snapshot exceeds 128 MiB.');
      files.push({ file, state: 'working', content: readFileSync(directory) });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
}
