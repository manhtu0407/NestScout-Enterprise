import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { git, repositoryFiles, indexEntries, readBlobs, checkHookIndex, headRevision } from './repository-files.mjs';
import { generatedFiles } from './check-hygiene.mjs';

const binaryFile = /\.(?:png|jpe?g|zip|gz|bundle|pdf)$/i;

export function formatViolations(content) {
  if (content.includes(0)) return [];
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    return ['1: invalid UTF-8'];
  }
  const found = [];
  if (text.startsWith('﻿')) found.push('1: byte order mark');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.includes('\r')) found.push(`${index + 1}: carriage return instead of LF`);
    else if (/[ \t]$/.test(line)) found.push(`${index + 1}: trailing whitespace`);
    if (/^ *\t/.test(line)) found.push(`${index + 1}: tab indentation`);
  });
  if (!text.endsWith('\n')) found.push(`${lines.length}: missing final newline`);
  return found;
}

function report(files) {
  const problems = [];
  const inspected = new Map();
  for (const { file, state, content } of files) {
    if (binaryFile.test(file) || generatedFiles.includes(file) || !content.length || inspected.get(file)?.equals(content)) continue;
    inspected.set(file, content);
    for (const problem of formatViolations(content)) problems.push(`${state} ${file}:${problem}`);
  }
  if (problems.length) {
    throw new Error(`.editorconfig violations (${problems.length}):\n  ${problems.slice(0, 10).join('\n  ')}`);
  }
}

export function checkFormat(repository = root) {
  report(repositoryFiles(repository));
}

export function checkStagedFormat(repository = root) {
  const changed = new Set(git(repository, ['diff-index', '--cached', '--name-only', '--diff-filter=d', '-z', headRevision(repository)]).split('\0').filter(Boolean));
  const entries = indexEntries(repository).filter(entry => changed.has(entry.file));
  for (const entry of entries) {
    if (!['100644', '100755'].includes(entry.mode) || entry.stage !== '0') {
      throw new Error(`Expected a regular resolved index entry: ${JSON.stringify(entry.file)}`);
    }
  }
  const contents = readBlobs(repository, entries.map(entry => entry.blob));
  report(entries.map(entry => ({ file: entry.file, state: 'index', content: contents.get(entry.blob) })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const staged = process.argv[2] === '--staged';
  if (process.argv.length > 3 || (process.argv.length === 3 && !staged)) throw new Error('Use no arguments or --staged.');
  if (staged) {
    checkHookIndex(root);
    checkStagedFormat();
  } else checkFormat();
  console.log(staged
    ? 'Changed staged text files use UTF-8, LF, a final newline, no trailing whitespace and no tab indentation.'
    : 'Index and working text files use UTF-8, LF, a final newline, no trailing whitespace and no tab indentation.');
}
