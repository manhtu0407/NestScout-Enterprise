import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';

export function checkReservedFiles(repository = root) {
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    if (file === 'AGENTS.md') continue;
    const name = path.posix.basename(file);
    // Match known instruction basenames, not arbitrary dotted technical filenames.
    if (/^(agents(?:\.override)?|claude(?:\.local)?)\.md$/i.test(name)
      || /^(docs\/ai-working-guide\.md|\.github\/copilot-instructions\.md)$/i.test(file)
      || /^(\.claude\/rules|\.github\/instructions)\//i.test(file)) {
      throw new Error(`Competing agent instruction file: ${file}`);
    }
    if (!file.includes('/') && /^readme\.md$/i.test(name) && file !== 'README.md') {
      throw new Error(`Root README filename must be exactly README.md: ${file}`);
    }
  }

  // Git's ignorecase can hide a working-tree-only case rename on Windows.
  const rootNames = readdirSync(repository);
  for (const file of ['AGENTS.md', 'README.md']) {
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

  const entries = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t');
    const [mode, blob, stage] = entry.slice(0, tab).split(' ');
    return { mode, blob, stage, file: entry.slice(tab + 1) };
  });
  for (const entry of entries.filter(entry => ['AGENTS.md', 'README.md'].includes(entry.file))) {
    if (!['100644', '100755'].includes(entry.mode) || entry.stage !== '0') {
      throw new Error(`Root policy/README must be a regular, resolved index entry: ${entry.file}`);
    }
    if (entry.file === 'AGENTS.md' && !git(['cat-file', 'blob', entry.blob]).trim()) {
      throw new Error('Staged AGENTS.md must not be empty.');
    }
  }
  const originalBlob = 'e5b4177c7175532f1f9fac63c42ffed2e7f483fc';
  if (git(['hash-object', '--path=README.md', 'README.md']).trim() !== originalBlob) {
    throw new Error('Original README.md changed. Separate owner permission is required.');
  }
  if (!entries.some(entry => entry.file === 'README.md' && entry.blob === originalBlob)) {
    throw new Error('Staged README.md differs from the owner-reserved original.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkReservedFiles();
  console.log('One canonical root policy; original README unchanged in index and working tree.');
}
