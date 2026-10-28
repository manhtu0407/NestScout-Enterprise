import path from 'node:path';
import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { SyntaxKind } from 'typescript/unstable/ast';
import { root } from './tool-path.mjs';

const regexPrefix = /(?:[(,=:[!&|?{};+\-*%<>~^]|\b(?:return|typeof|case|void|in|of))$/;

function literalEnd(text, start) {
  const quote = text[start];
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === quote) return index + 1;
    else if (quote !== '`' && text[index] === '\n') return index;
    else if (quote === '`' && text[index] === '$' && text[index + 1] === '{') {
      let depth = 1;
      index += 2;
      while (index < text.length && depth) {
        if (text[index] === '{') depth += 1;
        else if (text[index] === '}') depth -= 1;
        else if ('\'"`'.includes(text[index])) index = literalEnd(text, index) - 1;
        index += 1;
      }
      index -= 1;
    }
  }
  return text.length;
}

function regexEnd(text, start) {
  let inClass = false;
  for (let index = start + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '[') inClass = true;
    else if (text[index] === ']') inClass = false;
    else if (text[index] === '/' && !inClass) return index + 1;
    else if (text[index] === '\n') return -1;
  }
  return -1;
}

export function squash(value) {
  const literals = [];
  let code = '';
  for (let index = 0; index < value.length;) {
    const char = value[index];
    let end = -1;
    if (char === "'" || char === '"' || char === '`') end = literalEnd(value, index);
    else if (char === '/' && value[index + 1] !== '/' && value[index + 1] !== '*' && (code.trimEnd() === '' || regexPrefix.test(code.trimEnd()))) {
      end = regexEnd(value, index);
      while (end > 0 && /[a-z]/.test(value[end] ?? '')) end += 1;
    }
    if (end > 0) {
      code += `\u0000${literals.push(value.slice(index, end)) - 1}\u0000`;
      index = end;
    } else {
      code += char;
      index += 1;
    }
  }
  return code.replace(/\s+/g, ' ').replace(/ ?([.,;()[\]{}]) ?/g, '$1').trim().replace(/\u0000(\d+)\u0000/g, (_, number) => literals[Number(number)]);
}

export const sameNode = (left, right) => left.kind === right.kind && left.pos === right.pos && left.end === right.end;

export const boundNames = name => (name.kind === SyntaxKind.Identifier ? [name.text] : name.elements.flatMap(element => (element.name ? boundNames(element.name) : [])));

export function withSources(entries, use) {
  const directory = path.resolve(root, '.cache/review-diff-types').replaceAll('\\', '/');
  const named = entries.map((entry, index) => ({ ...entry, sourcePath: `${directory}/input${index}${/x$/.test(entry.file) ? '.tsx' : '.ts'}` }));
  const configPath = `${directory}/tsconfig.json`;
  const api = new API({
    cwd: root,
    fs: createVirtualFileSystem({
      ...Object.fromEntries(named.map(entry => [entry.sourcePath, entry.text])),
      [configPath]: JSON.stringify({ compilerOptions: { noLib: true, noResolve: true, jsx: 'preserve' }, files: named.map(entry => entry.sourcePath) }),
    }),
  });
  try {
    const program = api.updateSnapshot({ openProjects: [configPath] }).getProjects()[0]?.program;
    return use(named.map(entry => {
      const source = program?.getSourceFile(entry.sourcePath);
      return source && !program.getSyntacticDiagnostics(entry.sourcePath).length ? source : null;
    }));
  } finally {
    api.close();
  }
}

export function withSource(file, text, use) {
  return withSources([{ file, text }], ([source]) => {
    if (!source) throw new Error(`Invalid syntax in ${file}.`);
    return use(source);
  });
}
