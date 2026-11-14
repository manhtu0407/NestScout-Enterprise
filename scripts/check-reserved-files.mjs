import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { git as repositoryGit, indexEntries } from './repository-files.mjs';

export function checkReservedFiles(repository = root) {
  const git = args => repositoryGit(repository, args);
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    if (file === 'AGENTS.md') continue;
    const name = path.posix.basename(file);
    if (/^(agents(?:\.override)?|claude(?:\.local)?)\.md$/i.test(name)
      || /^(docs\/ai-working-guide\.md|\.github\/copilot-instructions\.md)$/i.test(file)
      || /^(\.claude\/rules|\.github\/instructions)\//i.test(file)) {
      throw new Error(`Competing agent instruction file: ${file}`);
    }
    if (!file.includes('/') && /^readme\.md$/i.test(name) && file !== 'README.md') {
      throw new Error(`Root README filename must be exactly README.md: ${file}`);
    }
  }

  const rootNames = readdirSync(repository);
  const protectedDocuments = new Map([
    ['README.md', 'f59ad05425193eceefd6986f00d0eb5df82f99f8'],
    ['ROOM.md', '2943538e79eec5e97bb36522738fa44f2e7bb7d1'],
    ['ARCHITECTURE.md', 'c14d81ccea81d3fd369965eb50fadee30e1d6c88'],
  ]);
  for (const file of ['AGENTS.md', ...protectedDocuments.keys()]) {
    if (!rootNames.includes(file) || !lstatSync(path.join(repository, file)).isFile()) {
      throw new Error(`Required regular root file missing or incorrectly cased: ${file}`);
    }
  }
  if (!readFileSync(path.join(repository, 'AGENTS.md'), 'utf8').trim()) {
    throw new Error('Root AGENTS.md must not be empty.');
  }
  if (git(['diff', '--cached', '--diff-filter=D', '--name-only', '-z']).split('\0').includes('AGENTS.md')) {
    throw new Error('Root AGENTS.md must not be deleted from the index.');
  }

  const entries = indexEntries(repository);
  for (const entry of entries.filter(entry => entry.file === 'AGENTS.md' || protectedDocuments.has(entry.file))) {
    if (!['100644', '100755'].includes(entry.mode) || entry.stage !== '0') {
      throw new Error(`Root policy/protected document must be a regular, resolved index entry: ${entry.file}`);
    }
    if (entry.file === 'AGENTS.md' && !git(['cat-file', 'blob', entry.blob]).trim()) {
      throw new Error('Staged AGENTS.md must not be empty.');
    }
  }
  for (const [file, approvedBlob] of protectedDocuments) {
    const label = file === 'README.md' ? 'Owner-approved README.md' : `Founder-approved ${file}`;
    if (git(['hash-object', `--path=${file}`, file]).trim() !== approvedBlob) {
      throw new Error(`${label} changed. Separate owner permission is required.`);
    }
    if (!entries.some(entry => entry.file === file && entry.blob === approvedBlob)) {
      throw new Error(`Staged ${file} differs from the owner-approved version.`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkReservedFiles();
  console.log('One canonical root policy; founder-approved product documents match their pinned index and working-tree blobs.');
}
