import path from 'node:path';
import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { SyntaxKind } from 'typescript/unstable/ast';
import { root } from './tool-path.mjs';

export const squash = value => value.replace(/\s+/g, ' ').replace(/ ?([.,;()[\]{}]) ?/g, '$1').trim();

export const sameNode = (left, right) => left.kind === right.kind && left.pos === right.pos && left.end === right.end;

export const boundNames =name => (name.kind === SyntaxKind.Identifier ? [name.text] : name.elements.flatMap(element => (element.name ? boundNames(element.name) : [])));

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
