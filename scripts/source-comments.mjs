import path from 'node:path';
import { parse as parseJavaScript } from 'acorn';
import { Parser as YamlParser } from 'yaml';
import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { SyntaxKind } from 'typescript/unstable/ast';
import { root } from './tool-path.mjs';

const lineEnd = (text, index) => {
  const end = text.indexOf('\n', index);
  return end === -1 ? text.length : end;
};
const span = (text, start, end) => ({ offset: start, text: text.slice(start, end) });
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function unterminated(file, text, index, what) {
  return new Error(`Unterminated ${what} in ${file} at line ${lineOf(text, index)}.`);
}

function endOfString(file, text, start, quote, { escapes = false, newlines = false, closingRun = false } = {}) {
  let index = start + quote.length;
  while (index < text.length) {
    if (escapes && text[index] === '\\') {
      index += 2;
      continue;
    }
    if (!newlines && text[index] === '\n') break;
    if (text.startsWith(quote, index)) {
      if (!closingRun) return index + quote.length;
      let run = 0;
      while (text[index + run] === quote[0]) run++;
      return index + run;
    }
    index++;
  }
  throw unterminated(file, text, start, 'string literal');
}

function javaScriptComments(file, text) {
  const spans = [];
  try {
    parseJavaScript(text, {
      ecmaVersion: 'latest',
      sourceType: file.endsWith('.cjs') ? 'script' : 'module',
      allowHashBang: true,
      onComment: (block, value, start, end) => {
        if (start !== 0 || !text.startsWith('#!')) spans.push(span(text, start, end));
      },
    });
  } catch (error) {
    throw new Error(`Invalid JavaScript in ${file} at ${error.loc?.line}:${error.loc?.column}.`);
  }
  return spans;
}

function typeScriptComments(file, text) {
  const directory = path.resolve(root, '.cache/hygiene-types').replaceAll('\\', '/');
  const sourcePath = `${directory}/input${file.match(/(?:\.d)?\.(?:[cm]?ts|tsx)$/)[0]}`;
  const configPath = `${directory}/tsconfig.json`;
  const fs = createVirtualFileSystem({
    [sourcePath]: text,
    [configPath]: JSON.stringify({ compilerOptions: { noLib: true, noResolve: true, jsx: 'preserve' }, files: [sourcePath] }),
  });
  const api = new API({ cwd: root, fs });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath] });
    const program = snapshot.getProjects()[0]?.program;
    const source = program?.getSourceFile(sourcePath);
    if (!source || program.getSyntacticDiagnostics(sourcePath).length) throw new Error(`Invalid TypeScript syntax in ${file}.`);
    const literals = [];
    function visit(node) {
      if ([SyntaxKind.StringLiteral, SyntaxKind.RegularExpressionLiteral, SyntaxKind.JsxText,
        SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail].includes(node.kind)) {
        literals.push([node.getStart(source), node.end]);
      }
      node.forEachChild(visit);
    }
    visit(source);
    literals.sort((a, b) => a[0] - b[0]);
    const spans = [];
    let start = 0;
    for (const [end, next] of [...literals, [text.length, text.length]]) {
      const scanner = createScanner(false, source.languageVariant, text, start, end - start);
      for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
        if ([SyntaxKind.SingleLineCommentTrivia, SyntaxKind.MultiLineCommentTrivia].includes(token)) {
          spans.push(span(text, scanner.getTokenStart(), scanner.getTokenStart() + scanner.getTokenText().length));
        }
      }
      start = next;
    }
    return spans;
  } finally {
    api.close();
  }
}

function yamlComments(file, text) {
  const offsets = new Map();
  const visit = value => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      if (value.type === 'comment' && Number.isInteger(value.offset)) offsets.set(value.offset, value.source);
      else Object.values(value).forEach(visit);
    }
  };
  try {
    for (const token of new YamlParser().parse(text)) visit(token);
  } catch {
    throw new Error(`Invalid YAML in ${file}.`);
  }
  return [...offsets].sort((a, b) => a[0] - b[0]).map(([offset, source]) => span(text, offset, offset + source.length));
}

function cStyleComments(file, text) {
  const spans = [];
  for (let index = 0; index < text.length;) {
    if (text[index] === '"') {
      index = endOfString(file, text, index, '"', { escapes: true });
    } else if (text.startsWith('//', index)) {
      const end = lineEnd(text, index);
      spans.push(span(text, index, end));
      index = end;
    } else if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      if (close === -1) throw unterminated(file, text, index, 'block comment');
      spans.push(span(text, index, close + 2));
      index = close + 2;
    } else {
      index++;
    }
  }
  return spans;
}

function tomlComments(file, text) {
  const spans = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (char === '#') {
      const end = lineEnd(text, index);
      spans.push(span(text, index, end));
      index = end;
    } else if (char === '"' || char === "'") {
      const multiline = text.startsWith(char.repeat(3), index);
      index = endOfString(file, text, index, multiline ? char.repeat(3) : char, {
        escapes: char === '"', newlines: multiline, closingRun: multiline,
      });
    } else {
      index++;
    }
  }
  return spans;
}

function sqlComments(file, text) {
  const spans = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (text.startsWith('--', index)) {
      const end = lineEnd(text, index);
      spans.push(span(text, index, end));
      index = end;
    } else if (text.startsWith('/*', index)) {
      let depth = 0;
      let cursor = index;
      do {
        if (text.startsWith('/*', cursor)) {
          depth++;
          cursor += 2;
        } else if (text.startsWith('*/', cursor)) {
          depth--;
          cursor += 2;
        } else {
          cursor++;
        }
      } while (depth > 0 && cursor < text.length);
      if (depth !== 0) throw unterminated(file, text, index, 'block comment');
      spans.push(span(text, index, cursor));
      index = cursor;
    } else if (char === "'" || char === '"') {
      const escapes = char === "'" && /[eE]/.test(text[index - 1] ?? '') && !/[A-Za-z0-9_]/.test(text[index - 2] ?? '');
      index = endOfString(file, text, index, char, { escapes, newlines: true });
    } else if (char === '$') {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 64))?.[0];
      if (tag && !/[A-Za-z0-9_$]/.test(text[index - 1] ?? '')) {
        const close = text.indexOf(tag, index + tag.length);
        if (close === -1) throw unterminated(file, text, index, 'dollar-quoted string');
        index = close + tag.length;
      } else {
        index++;
      }
    } else {
      index++;
    }
  }
  return spans;
}

function shellComments(file, text) {
  const spans = [];
  let quote = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote === "'") {
      if (char === "'") quote = null;
    } else if (quote === '"') {
      if (char === '\\') index++;
      else if (char === '"') quote = null;
    } else if (char === '\\') {
      index++;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '#' && (index === 0 ? text[1] !== '!' : /[\s;&|()]/.test(text[index - 1]))) {
      const end = lineEnd(text, index);
      spans.push(span(text, index, end));
      index = end - 1;
    }
  }
  if (quote) throw unterminated(file, text, text.length, 'quoted string');
  return spans;
}

function lineComments(text, pattern) {
  return [...text.matchAll(pattern)].map(match => {
    const start = match.index + match[0].length - match[0].trimStart().length;
    return span(text, start, match.index + match[0].length);
  });
}

function commentRule(file) {
  if (/\.[cm]?js$/.test(file)) return javaScriptComments;
  if (/\.(?:[cm]?ts|tsx)$/.test(file)) return typeScriptComments;
  if (/\.ya?ml$/.test(file)) return yamlComments;
  if (/\.toml$/.test(file)) return tomlComments;
  if (/\.sql$/.test(file)) return sqlComments;
  if (/\.(?:json|jsonc|lock)$/.test(file)) return cStyleComments;
  if (/(?:^|\/)\.(?:gitignore|gitattributes)$/.test(file)) return (name, text) => lineComments(text, /^[ \t]*#[^\n]*$/gm);
  if (/(?:^|\/)\.editorconfig$/.test(file)) return (name, text) => lineComments(text, /^[ \t]*[#;][^\n]*$/gm);
  if (/^\.githooks\//.test(file)) return shellComments;
  return null;
}

export const hasCommentRule = file => commentRule(file) !== null;

export function commentSpans(file, text) {
  if (text.length === 0) return [];
  const rule = commentRule(file);
  if (rule) return rule(file, text);
  if (/\.md$/.test(file)) return [];
  throw new Error(`No comment rule for source format: ${file}`);
}
