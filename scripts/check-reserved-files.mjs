import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root } from './tool-path.mjs';

const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
for (const file of new Set(files)) {
  if (!/^(agents|readme)\.md$/i.test(path.posix.basename(file))) continue;
  if (file !== 'README.md') throw new Error(`Owner-reserved filename requires separate permission: ${file}`);
}
const originalBlob = 'e5b4177c7175532f1f9fac63c42ffed2e7f483fc';
if (git(['hash-object', '--path=README.md', 'README.md']) !== originalBlob) {
  throw new Error('Original README.md changed. Separate owner permission is required.');
}
const indexEntry = git(['ls-files', '--stage', '--', 'README.md']);
if (!indexEntry.split(/\s+/).includes(originalBlob)) {
  throw new Error('Staged README.md differs from the owner-reserved original.');
}
console.log('Reserved filenames respected; original README unchanged in index and working tree.');
