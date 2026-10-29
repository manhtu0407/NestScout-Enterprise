import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const visualNumbers = new Set([
  'fontSize', 'lineHeight', 'letterSpacing', 'opacity', 'elevation', 'gap', 'rowGap', 'columnGap',
  'width', 'height', 'minHeight', 'minWidth', 'maxHeight', 'maxWidth', 'top', 'bottom', 'left', 'right', 'start', 'end',
]);
const visualStrings = new Set(['fontFamily', 'fontWeight']);
const colorProps = new Set(['color', 'backgroundColor', 'borderColor', 'shadowColor', 'tintColor', 'textShadowColor', 'placeholderTextColor', 'selectionColor', 'cursorColor', 'underlineColorAndroid']);
const numericProperty = (name: string) => visualNumbers.has(name) || /^(padding|margin|border.*(?:Width|Radius)|shadow(?:Opacity|Radius)|textShadowRadius)/.test(name);
const colorProperty = (name: string) => colorProps.has(name) || /^border.*Color$/.test(name);

type StyleException = Readonly<{ file: string; property: string; value: string; reason: string }>;
const approvedExceptions: readonly StyleException[] = [];

function literals(source: string, filePath = '', exceptions: readonly StyleException[] = []): string[] {
  const file = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, ts.Expression>();
  const assignments = new Map<string, ts.Expression[]>();
  const propertyAssignments = new Map<string, { property: string; value: ts.Expression }[]>();
  const sheetNames = new Set(['StyleSheet']);
  const createNames = new Set<string>();
  const themeNames = new Set<string>();
  const unreviewedThemeNames = new Set<string>();
  const violations: string[] = [];
  function collect(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (node.moduleSpecifier.text === 'react-native' && (element.propertyName?.text ?? element.name.text) === 'StyleSheet') sheetNames.add(element.name.text);
          if (node.moduleSpecifier.text.startsWith('@/theme/')) {
            const original = element.propertyName?.text ?? element.name.text;
            if (node.moduleSpecifier.text === '@/theme/layout' && ['layout', 'typography'].includes(original)) themeNames.add(element.name.text);
            else if (original !== 'usePalette') unreviewedThemeNames.add(element.name.text);
          }
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer);
      if (ts.isObjectBindingPattern(node.name) && ts.isIdentifier(node.initializer) && sheetNames.has(node.initializer.text)) {
        for (const element of node.name.elements) if ((element.propertyName?.getText(file) ?? element.name.getText(file)) === 'create' && ts.isIdentifier(element.name)) createNames.add(element.name.text);
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
      assignments.set(node.left.text, [...(assignments.get(node.left.text) ?? []), node.right]);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) {
      const name = node.left.expression.text;
      propertyAssignments.set(name, [...(propertyAssignments.get(name) ?? []), { property: node.left.name.text, value: node.right }]);
    }
    ts.forEachChild(node, collect);
  }
  collect(file);
  for (const [name, expression] of declarations) {
    if (ts.isIdentifier(expression) && sheetNames.has(expression.text)) sheetNames.add(name);
  }
  collect(file);
  for (const [name, expression] of declarations) {
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'create' && ts.isIdentifier(expression.expression) && sheetNames.has(expression.expression.text)) createNames.add(name);
  }
  function isCreate(expression: ts.Expression): boolean {
    if (ts.isIdentifier(expression)) return createNames.has(expression.text);
    return ts.isPropertyAccessExpression(expression) && expression.name.text === 'create' && ts.isIdentifier(expression.expression) && sheetNames.has(expression.expression.text);
  }
  function report(property: string, value: ts.Node) {
    const literal = value.getText(file);
    if (!exceptions.some((entry) => entry.file === filePath && entry.property === property && entry.value === literal && entry.reason.trim())) violations.push(`${property}: ${literal}`);
  }
  function inspectValue(property: string, value: ts.Node, seen: Set<string>) {
    if (ts.isIdentifier(value)) {
      if (themeNames.has(value.text) || seen.has(value.text)) return;
      if (unreviewedThemeNames.has(value.text)) { report(property, value); return; }
      const next = new Set(seen).add(value.text);
      const found = declarations.get(value.text);
      if (found) inspectValue(property, found, next);
      for (const assigned of assignments.get(value.text) ?? []) inspectValue(property, assigned, next);
      return;
    }
    if (ts.isPropertyAccessExpression(value)) {
      let root: ts.Expression = value;
      while (ts.isPropertyAccessExpression(root)) root = root.expression;
      if (ts.isIdentifier(root) && unreviewedThemeNames.has(root.text)) { report(property, value); return; }
      if (ts.isIdentifier(root) && themeNames.has(root.text)) return;
      if (ts.isIdentifier(value.expression)) {
        const object = declarations.get(value.expression.text);
        if (object && ts.isObjectLiteralExpression(object)) {
          const entry = object.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(file).replace(/^['\"]|['\"]$/g, '') === value.name.text);
          if (entry && ts.isPropertyAssignment(entry)) inspectValue(property, entry.initializer, seen);
        }
      }
      return;
    }
    if (ts.isCallExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === 'PlatformColor') return;
    if (ts.isPrefixUnaryExpression(value) && ts.isNumericLiteral(value.operand)) {
      if (numericProperty(property) && Number(value.getText(file)) !== 0) report(property, value);
      return;
    }
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      if (colorProperty(property) && value.text.toLowerCase() !== 'transparent') report(property, value);
      else if (visualStrings.has(property) || numericProperty(property)) report(property, value);
      return;
    }
    if (ts.isNumericLiteral(value)) {
      const number = Number(value.text);
      if (numericProperty(property) && number !== 0 && !(property === 'opacity' && number === 1)) report(property, value);
      return;
    }
    if (ts.isTemplateExpression(value) && colorProperty(property)) { report(property, value); return; }
    ts.forEachChild(value, (child) => inspectValue(property, child, seen));
  }
  function inspectStyle(node: ts.Node, seen = new Set<string>()) {
    if (ts.isIdentifier(node)) {
      if (themeNames.has(node.text) || seen.has(node.text)) return;
      if (unreviewedThemeNames.has(node.text)) { report('style', node); return; }
      const next = new Set(seen).add(node.text);
      const found = declarations.get(node.text);
      if (found) inspectStyle(found, next);
      for (const assigned of assignments.get(node.text) ?? []) inspectStyle(assigned, next);
      for (const entry of propertyAssignments.get(node.text) ?? []) {
        if (numericProperty(entry.property) || colorProperty(entry.property) || visualStrings.has(entry.property)) inspectValue(entry.property, entry.value, new Set());
        else inspectStyle(entry.value, next);
      }
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(file).replace(/^['\"]|['\"]$/g, '');
      if (numericProperty(name) || colorProperty(name) || visualStrings.has(name)) inspectValue(name, node.initializer, new Set());
      else inspectStyle(node.initializer, seen);
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) { inspectValue(node.name.text, node.name, new Set()); return; }
    ts.forEachChild(node, (child) => inspectStyle(child, seen));
  }
  function visit(node: ts.Node) {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(file);
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (value && /style$/i.test(name)) inspectStyle(value);
      else if (value && colorProperty(name)) inspectValue(name, value, new Set());
    }
    if (ts.isCallExpression(node) && isCreate(node.expression)) node.arguments.forEach((arg) => inspectStyle(arg));
    ts.forEachChild(node, visit);
  }
  visit(file);
  return [...new Set(violations)];
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

test.each([
  ["<View style={{ color: 'red', backgroundColor: 'white' }} />", ['color:', 'backgroundColor:']],
  ['<ActivityIndicator color="#f00" placeholderTextColor="red" tintColor="white" />', ['color:', 'placeholderTextColor:', 'tintColor:']],
  ['<List contentContainerStyle={{ paddingStart: 4 }} columnWrapperStyle={{ marginEnd: 3 }} />', ['paddingStart:', 'marginEnd:']],
  ["<View style={{ borderTopLeftRadius: 8, borderTopRightRadius: 4, borderTopColor: 'red', borderBottomColor: 'blue', shadowColor: 'black', shadowRadius: 2, elevation: 4, textShadowColor: 'red', fontFamily: 'Arial', fontWeight: '700' }} />", ['borderTopLeftRadius:', 'borderTopRightRadius:', 'borderTopColor:', 'borderBottomColor:', 'shadowColor:', 'shadowRadius:', 'elevation:', 'textShadowColor:', 'fontFamily:', 'fontWeight:']],
  ['<View style={{ padding: 8 * 2, margin: (12), gap: cond ? 12 : 16, width: x || 12 }} />', ['padding:', 'margin:', 'gap:', 'width:']],
  ['<View style={{ color: `#f00` }} />', ['color:']],
  ['const padding = 12; const local = { padding }; <View style={local} />', ['padding:']],
  ['import { StyleSheet as SS } from "react-native"; const { create: make } = SS; const a = SS.create({ x: { padding: 4 } }); const b = make({ x: { margin: 8 } });', ['padding:', 'margin:']],
  ['let local; local = { padding: 8 }; <View style={local} />', ['padding:']],
  ['const local = {}; local.padding = 8; <View style={local} />', ['padding:']],
  ['const SS = StyleSheet; const createStyles = SS.create; const x = createStyles({ row: { padding: 4 } });', ['padding:']],
  ["import { colors } from '@/theme/new-colors'; <View style={{ color: colors.primary }} />", ['color:']],
  ["import { customStyle } from '@/theme/new-styles'; <View style={customStyle} />", ['style:']],
  ["const c = 'red'; const colors = { accent: c }; <View style={{ backgroundColor: colors.accent, shadowOffset: { width: 2, height: 3 }, opacity: -1 }} />", ['backgroundColor:', 'width:', 'height:', 'opacity:']],
])('guard catches reviewed bypass %s', (source, expected) => {
  const found = literals(source);
  for (const prefix of expected) expect(found.some((entry) => entry.startsWith(prefix))).toBe(true);
});

test('guard accepts theme values, neutral styles and non-style text', () => {
  expect(literals("import { layout, typography } from '@/theme/layout'; const copy = 'red'; <View testID=\"red\" style={{ color: palette.text, backgroundColor: 'transparent', borderColor: PlatformColor('separator'), padding: 0.0, opacity: 1, gap: layout.screen.gap, ...typography.body, flex: 1 }} />"))
    .toEqual([]);
});

test('a reviewed exception is restricted to its exact file, property and value', () => {
  const exception = { file: 'access/example.tsx', property: 'width', value: '7', reason: 'Optical alignment for a supplied asset' };
  expect(literals('const s = StyleSheet.create({ x: { width: 7, height: 7 } });', 'access/example.tsx', [exception])).toEqual(['height: 7']);
  expect(literals('const s = StyleSheet.create({ x: { width: 7 } });', 'worker/example.tsx', [exception])).toEqual(['width: 7']);
  expect(literals('const s = StyleSheet.create({ x: { width: 8 } });', 'access/example.tsx', [exception])).toEqual(['width: 8']);
  expect(literals('const s = StyleSheet.create({ x: { width: 7 } });', 'access/example.tsx', [{ ...exception, reason: '' }])).toEqual(['width: 7']);
});

test('feature styles use theme values for guarded visual properties', () => {
  const root = path.resolve(__dirname, '../features');
  const violations = sourceFiles(root).flatMap((file) => {
    const relative = path.relative(root, file).split(path.sep).join('/');
    return literals(readFileSync(file, 'utf8'), relative, approvedExceptions).map((value) => `${relative}: ${value}`);
  });
  expect(violations).toEqual([]);
});
