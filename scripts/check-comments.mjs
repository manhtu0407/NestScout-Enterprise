import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { git, readBlobs, repositoryFiles, indexEntries, checkHookIndex, headRevision } from './repository-files.mjs';
import { commentRecords, hasCommentGrammar, generatedFiles } from './check-hygiene.mjs';

const regularMode = mode => mode === '100644' || mode === '100755';
const decode = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const inspected = file => hasCommentGrammar(file) || file === 'package.json';

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

function unsupportedExceptions(text) {
  try {
    return JSON.parse(text).repositoryHygiene?.commentExceptions !== undefined;
  } catch {
    return false;
  }
}

export function commentViolations(sources, label) {
  const found = [];
  for (const { file, text } of sources) {
    if (generatedFiles.includes(file)) continue;
    if (file === 'package.json') {
      if (unsupportedExceptions(text)) found.push(`${label} package.json repositoryHygiene.commentExceptions: exceptions are not supported`);
      continue;
    }
    for (const record of commentRecords(file, text) ?? []) {
      if (isMandatoryComment(file, record.text, text, record.start)) continue;
      found.push(`${label} ${file}:${text.slice(0, record.start).split('\n').length} ${commentCategory(record.text)}: ${normalizeComment(record.text).slice(0, 80)}`);
    }
  }
  return found;
}

function report(found) {
  if (found.length) {
    throw new Error(`Source comments are prohibited (${found.length}):\n  ${found.slice(0, 10).join('\n  ')}\n`
      + 'Remove them. Only technically mandatory directives (a shebang, TypeScript triple-slash references, JSX pragmas, the Dependabot version tag after a '
      + 'SHA-pinned action), legally required copyright or SPDX notices and the generated database types pass. No baseline, history or exception approves a comment.');
  }
}

function blobSources(repository, entries) {
  const contents = readBlobs(repository, entries.map(entry => entry.blob));
  return entries.map(entry => ({ file: entry.file, text: decode(contents.get(entry.blob)) }));
}

function committedEntries(repository) {
  return git(repository, ['ls-tree', '-r', '-z', '--full-tree', headRevision(repository)]).split('\0').filter(Boolean).map(entry => {
    const tab = entry.indexOf('\t');
    const [mode, , blob] = entry.slice(0, tab).split(' ');
    return { mode, blob, file: entry.slice(tab + 1) };
  });
}

function stagedEntries(repository) {
  const entries = indexEntries(repository);
  const unmerged = entries.find(entry => entry.stage !== '0');
  if (unmerged) throw new Error(`Unmerged index entry: ${JSON.stringify(unmerged.file)}`);
  return entries;
}

const sourceEntries = entries => entries.filter(entry => regularMode(entry.mode) && inspected(entry.file));

export function checkCommittedComments(repository = root) {
  report(commentViolations(blobSources(repository, sourceEntries(committedEntries(repository))), 'HEAD'));
}

export function checkStagedComments(repository = root) {
  report(commentViolations(blobSources(repository, sourceEntries(stagedEntries(repository))), 'index'));
}

export function checkWorkingComments(repository = root) {
  const working = repositoryFiles(repository).filter(item => item.state === 'working' && inspected(item.file));
  report(commentViolations(working.map(item => ({ file: item.file, text: decode(item.content) })), 'working tree'));
}

export function checkComments(repository = root) {
  checkCommittedComments(repository);
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
  console.log(`Source comments passed for the ${staged ? 'staged index' : 'committed tree, staged index and working tree'}.`);
}
