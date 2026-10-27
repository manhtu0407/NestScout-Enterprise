import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { git, readBlobs, repositoryFiles, checkHookIndex } from './repository-files.mjs';
import { commentRecords, hasCommentGrammar, checkPath, generatedFiles } from './check-hygiene.mjs';
import { metadataRange } from './check-metadata.mjs';

const zeroObject = /^0+$/;
const regularMode = mode => mode === '100644' || mode === '100755';
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

export const normalizeComment = text => text.replace(/\s+/g, ' ').trim();

const commentBody = text => text.replace(/^(?:\/\/+|\/\*+!?|#+|--+)/, '').replace(/\*+\/$/, '')
  .split(/\r?\n/).map(line => line.replace(/^\s*\*+\s?/, '')).join(' ').replace(/\s+/g, ' ').trim();

const suppression = /@ts-(?:ignore|expect-error|nocheck)|(?:eslint|biome|oxlint|tslint|stylelint)[-\s]?(?:disable|enable|ignore)|(?:istanbul|c8|v8) ignore|prettier-ignore|nosemgrep|NOSONAR|noqa|nolint|noinspection|gitleaks:allow|shellcheck disable|sqlfluff:/i;

export function commentCategory(text) {
  if (suppression.test(commentBody(text))) return 'suppression';
  if (/\b(?:TODO|FIXME|HACK|XXX)\b/i.test(commentBody(text))) return 'annotation';
  if (text.startsWith('/**')) return 'documentation';
  return text.startsWith('/*') ? 'block' : 'inline';
}

const scriptFile = /\.(?:[cm]?js|[cm]?ts|tsx)$/;
const shebangFile = /\.(?:[cm]?js|[cm]?ts)$|^\.githooks\//;
const shebang = /^#!(?:\/[\w.-]+)+(?: [-\w=./]+){0,2}$/;
const tripleSlash = /^\/\/\/\s*<(?:reference|amd-module|amd-dependency)\b[^<>]*\/>\s*$/;
const jsxPragma = /^(?:@jsx(?:Frag|ImportSource|Runtime)? \S+ ?)+$/;
const copyright = /^Copyright(?: \(c\)| ©)? (?:19|20)\d{2}(?:[-, ]+(?:19|20)\d{2})* \S.*$/i;
const spdx = /^SPDX-License-Identifier: [A-Za-z0-9.+-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+-]+)*$/;
const versionTag = /^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/;
const shaPinnedUse = /^\s*(?:-\s+)?uses:\s*\S+@[a-f0-9]{40}\s+$/;
const leadingComments = /^(?:\s|\/\/[^\n]*\n)*$/;

export function isMandatoryComment(file, text, source, start) {
  const body = commentBody(text);
  if (start === 0 && shebangFile.test(file) && shebang.test(text)) return true;
  if (scriptFile.test(file)) {
    if (tripleSlash.test(text) && leadingComments.test(source.slice(0, start))) return true;
    if (text.startsWith('/*') && jsxPragma.test(body)) return true;
  }
  if (/\.ya?ml$/.test(file) && text.startsWith('#') && versionTag.test(body)) {
    return shaPinnedUse.test(source.slice(source.lastIndexOf('\n', start - 1) + 1, start));
  }
  return text.length <= 200 && !text.includes('\n') && (copyright.test(body) || spdx.test(body))
    && !['annotation', 'suppression'].includes(commentCategory(text));
}

export function addedComments(file, baseText, text) {
  const available = new Map();
  for (const record of baseText ? commentRecords(file, baseText) : []) {
    const key = normalizeComment(record.text);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  return commentRecords(file, text).filter(record => {
    const key = normalizeComment(record.text);
    const remaining = available.get(key) ?? 0;
    if (remaining) available.set(key, remaining - 1);
    return !remaining;
  });
}

export function approvedExceptions(manifest, label) {
  if (manifest === null) return [];
  let entries;
  try {
    entries = JSON.parse(manifest).repositoryHygiene?.commentExceptions ?? [];
  } catch {
    throw new Error(`Invalid package.json in ${label}.`);
  }
  if (!Array.isArray(entries)) throw new Error('repositoryHygiene.commentExceptions must be an array.');
  return entries.map(item => {
    if (!item || ['file', 'text', 'reason', 'approval'].some(key => typeof item[key] !== 'string' || !item[key].trim())) {
      throw new Error('Each comment exception needs file, text, reason and owner approval.');
    }
    checkPath(item.file);
    return { file: item.file, text: normalizeComment(item.text) };
  });
}

export function commentViolations(changes, exceptions, label) {
  const remaining = [...exceptions];
  const found = [];
  for (const { file, text, baseText } of changes) {
    if (generatedFiles.includes(file)) continue;
    for (const record of addedComments(file, baseText, text)) {
      if (isMandatoryComment(file, record.text, text, record.start)) continue;
      const key = normalizeComment(record.text);
      const approved = remaining.findIndex(item => item.file === file && item.text === key);
      if (approved >= 0) {
        remaining.splice(approved, 1);
        continue;
      }
      found.push(`${label} ${file}:${text.slice(0, record.start).split('\n').length} ${commentCategory(record.text)}: ${key.slice(0, 80)}`);
    }
  }
  return found;
}

function report(found) {
  if (found.length) {
    throw new Error(`Added source comments are prohibited (${found.length}):\n  ${found.slice(0, 10).join('\n  ')}\n`
      + 'Remove them. Only technically mandatory, legally required and generated content passes automatically; '
      + 'an owner-approved exception belongs in repositoryHygiene.commentExceptions.');
  }
}

function rawChanges(repository, args, label) {
  const fields = git(repository, args).split('\0');
  const changes = [];
  for (let index = 0; index < fields.length - 1;) {
    const [, mode, oldBlob, newBlob, status] = fields[index++].slice(1).split(' ');
    const oldPath = fields[index++];
    const file = status[0] === 'R' ? fields[index++] : oldPath;
    if (status[0] === 'U') throw new Error(`Unmerged ${label} entry: ${JSON.stringify(file)}`);
    changes.push({ status: status[0], mode, oldBlob, newBlob, file });
  }
  return changes.filter(change => change.status !== 'D' && regularMode(change.mode) && hasCommentGrammar(change.file));
}

function blobChanges(repository, args, label) {
  const changes = rawChanges(repository, args, label);
  const contents = readBlobs(repository, changes.flatMap(change => [change.newBlob, change.oldBlob]).filter(blob => !zeroObject.test(blob)));
  return changes.map(change => ({
    file: change.file, text: decode(contents.get(change.newBlob)),
    baseText: zeroObject.test(change.oldBlob) ? '' : decode(contents.get(change.oldBlob)),
  }));
}

function optionalText(repository, spec) {
  let blob;
  try {
    blob = git(repository, ['rev-parse', '--verify', '--quiet', spec]).trim();
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
  return decode(readBlobs(repository, [blob]).get(blob));
}

function baseRevision(repository) {
  try {
    return git(repository, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
    return git(repository, ['hash-object', '-t', 'tree', '--stdin'], { input: '' }).trim();
  }
}

const rawArguments = ['-M', '--raw', '-z', '--no-abbrev'];

export function checkCommentRevision(repository, base, head) {
  const mergeBase = git(repository, ['merge-base', base, head]).trim();
  const changes = blobChanges(repository, ['diff-tree', '-r', ...rawArguments, mergeBase, head], 'revision');
  report(commentViolations(changes, approvedExceptions(optionalText(repository, `${head}:package.json`), 'revision'), 'revision'));
}

export function checkStagedComments(repository) {
  const changes = blobChanges(repository, ['diff-index', '--cached', ...rawArguments, baseRevision(repository)], 'index');
  report(commentViolations(changes, approvedExceptions(optionalText(repository, ':package.json'), 'index'), 'index'));
}

export function checkWorkingComments(repository) {
  const base = baseRevision(repository);
  const working = new Map(repositoryFiles(repository).filter(item => item.state === 'working').map(item => [item.file, item.content]));
  const tracked = rawChanges(repository, ['diff-index', ...rawArguments, base], 'working tree');
  const bases = readBlobs(repository, tracked.map(change => change.oldBlob).filter(blob => !zeroObject.test(blob)));
  const changes = tracked.filter(change => working.has(change.file)).map(change => ({
    file: change.file, text: decode(working.get(change.file)),
    baseText: zeroObject.test(change.oldBlob) ? '' : decode(bases.get(change.oldBlob)),
  }));
  const seen = new Set(changes.map(change => change.file));
  const untracked = git(repository, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  for (const file of untracked.filter(file => !seen.has(file) && hasCommentGrammar(file) && working.has(file))) {
    changes.push({ file, text: decode(working.get(file)), baseText: '' });
  }
  const manifest = working.has('package.json') ? decode(working.get('package.json')) : null;
  report(commentViolations(changes, approvedExceptions(manifest, 'working tree'), 'working tree'));
}

export function checkComments(repository = root, environment = process.env) {
  const { base, head } = metadataRange(repository, environment);
  checkCommentRevision(repository, base, head);
  checkStagedComments(repository);
  checkWorkingComments(repository);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const staged = process.argv[2] === '--staged';
  if (process.argv.length > 3 || (process.argv.length === 3 && !staged)) throw new Error('Use no arguments or --staged.');
  if (staged) {
    checkHookIndex(root);
    checkStagedComments(root);
  } else checkComments();
  console.log(`Added source comments passed for the ${staged ? 'staged index' : 'committed range, staged index and working tree'}.`);
}
