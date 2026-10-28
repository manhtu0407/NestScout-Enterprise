import path from 'node:path';
import { SyntaxKind } from 'typescript/unstable/ast';
import { boundNames, sameNode, squash, withSources } from './review-syntax.mjs';

const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json'];
const sourceSwaps = new Map([['.js', ['.ts', '.tsx']], ['.jsx', ['.tsx']], ['.mjs', ['.mts']], ['.cjs', ['.cts']]]);
const mockCalls = new Set(['mock', 'doMock', 'requireActual', 'requireMock', 'unmock', 'dontMock', 'setMock', 'createMockFromModule']);
const literalKinds = new Set([SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral]);

function describe(source, text) {
  const slice = node => squash(text.slice(node.getStart(source), node.end));
  const lineOf = node => text.slice(0, node.getStart(source)).split('\n').length;
  const exported = new Map();
  const uses = [];
  let star = false;

  for (const statement of source.statements) {
    if (statement.kind === SyntaxKind.ExportDeclaration) {
      const clause = statement.exportClause;
      if (!clause) star = true;
      else if (clause.kind === SyntaxKind.NamespaceExport) exported.set(clause.name.text, null);
      else for (const element of clause.elements) exported.set(element.name.text, null);
      continue;
    }
    if (statement.kind === SyntaxKind.ExportAssignment) {
      exported.set('default', slice(statement));
      continue;
    }
    const modifiers = statement.modifiers ? [...statement.modifiers].map(modifier => modifier.kind) : [];
    if (!modifiers.includes(SyntaxKind.ExportKeyword)) continue;
    if (modifiers.includes(SyntaxKind.DefaultKeyword)) exported.set('default', slice(statement));
    else if (statement.declarationList) {
      for (const declaration of statement.declarationList.declarations) for (const name of boundNames(declaration.name)) exported.set(name, slice(statement));
    } else if (statement.name) exported.set(statement.name.text, slice(statement));
  }

  const use = (node, specifier, names) => uses.push({ specifier, names, line: lineOf(node) });
  const importedNames = clause => {
    const names = new Set();
    if (!clause) return names;
    if (clause.name) names.add('default');
    const bindings = clause.namedBindings;
    if (bindings?.kind === SyntaxKind.NamespaceImport) names.add('*');
    else if (bindings) for (const element of bindings.elements) names.add((element.propertyName ?? element.name).text);
    return names;
  };
  const requiredNames = call => {
    const parent = call.parent;
    if (parent?.kind !== SyntaxKind.VariableDeclaration || !parent.initializer || !sameNode(parent.initializer, call) || parent.name.kind !== SyntaxKind.ObjectBindingPattern) return new Set(['*']);
    return new Set([...parent.name.elements].map(element => (element.propertyName ?? element.name)?.text ?? '*'));
  };
  const visit = node => {
    if (node.kind === SyntaxKind.ImportDeclaration) use(node, node.moduleSpecifier.text, importedNames(node.importClause));
    else if (node.kind === SyntaxKind.ExportDeclaration && node.moduleSpecifier) {
      const clause = node.exportClause;
      const names = !clause || clause.kind === SyntaxKind.NamespaceExport ? new Set(['*']) : new Set([...clause.elements].map(element => (element.propertyName ?? element.name).text));
      use(node, node.moduleSpecifier.text, names);
    } else if (node.kind === SyntaxKind.ImportEqualsDeclaration && node.moduleReference.kind === SyntaxKind.ExternalModuleReference) {
      use(node, node.moduleReference.expression.text, new Set(['*']));
    } else if (node.kind === SyntaxKind.CallExpression) {
      const callee = node.expression;
      const loads = callee.kind === SyntaxKind.ImportKeyword || (callee.kind === SyntaxKind.Identifier && callee.text === 'require');
      const mocks = callee.kind === SyntaxKind.PropertyAccessExpression && mockCalls.has(callee.name.text);
      const argument = node.arguments[0];
      if ((loads || mocks) && argument && literalKinds.has(argument.kind)) use(node, argument.text, loads ? requiredNames(node) : new Set(['*']));
    }
    node.forEachChild(visit);
  };
  visit(source);
  return { exports: exported, star, uses };
}

export function describeModules(entries) {
  return withSources(entries, sources => sources.map((source, index) => (source ? describe(source, entries[index].text) : null)));
}

function candidatePaths(target) {
  const swapped = [...sourceSwaps].flatMap(([from, replacements]) => (target.endsWith(from) ? replacements.map(replacement => target.slice(0, -from.length) + replacement) : []));
  return [target, ...swapped, ...extensions.map(extension => target + extension), ...extensions.map(extension => `${target}/index${extension}`)];
}

function aliasTargets(view, importer, specifier) {
  for (let directory = path.posix.dirname(importer); ; directory = path.posix.dirname(directory)) {
    const configPath = directory === '.' ? 'tsconfig.json' : `${directory}/tsconfig.json`;
    if (view.has(configPath)) {
      let options;
      try {
        options = JSON.parse(view.read(configPath)).compilerOptions ?? {};
      } catch {
        return [];
      }
      if (options.paths) {
        const baseDirectory = path.posix.join(directory, options.baseUrl ?? '.');
        for (const [pattern, replacements] of Object.entries(options.paths)) {
          const star = pattern.indexOf('*');
          const prefix = star < 0 ? pattern : pattern.slice(0, star);
          const suffix = star < 0 ? '' : pattern.slice(star + 1);
          const matches = star < 0 ? specifier === pattern : specifier.length >= pattern.length - 1 && specifier.startsWith(prefix) && specifier.endsWith(suffix);
          if (!matches) continue;
          const captured = star < 0 ? '' : specifier.slice(prefix.length, specifier.length - suffix.length);
          return replacements.map(replacement => path.posix.join(baseDirectory, replacement.replaceAll('*', () => captured)));
        }
      }
      return [];
    }
    if (directory === '.') return [];
  }
}

export function resolveModule(view, importer, specifier) {
  const targets = specifier.startsWith('.') ? [path.posix.join(path.posix.dirname(importer), specifier)] : aliasTargets(view, importer, specifier);
  if (!targets.length) return null;
  const candidates = targets.flatMap(candidatePaths);
  return { candidates, found: candidates.filter(candidate => view.has(candidate)) };
}
