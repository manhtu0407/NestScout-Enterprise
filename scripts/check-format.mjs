import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { repositoryFiles } from './repository-files.mjs';
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

export function checkFormat(repository = root) {
  const problems = [];
  const inspected = new Map();
  for (const { file, state, content } of repositoryFiles(repository)) {
    if (binaryFile.test(file) || generatedFiles.includes(file) || !content.length || inspected.get(file)?.equals(content)) continue;
    inspected.set(file, content);
    for (const problem of formatViolations(content)) problems.push(`${state} ${file}:${problem}`);
  }
  if (problems.length) {
    throw new Error(`.editorconfig violations (${problems.length}):\n  ${problems.slice(0, 10).join('\n  ')}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Use no arguments.');
  checkFormat();
  console.log('Index and working text files use UTF-8, LF, a final newline, no trailing whitespace and no tab indentation.');
}
