import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseJavaScript } from 'acorn';
import { Parser as YamlParser, Scalar, isScalar, parseAllDocuments, visit as visitYaml } from 'yaml';
import { parse } from 'smol-toml';
import { API } from 'typescript/unstable/sync';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { SyntaxKind } from 'typescript/unstable/ast';
import { root } from './tool-path.mjs';
import { repositoryFiles, checkHookIndex } from './repository-files.mjs';
import { checkTestArtifacts } from './check-test-artifacts.mjs';
import { inspectArtifact, hasArtifactSignature } from './inspect-artifact.mjs';

const fixedPaths = new Set([
  'AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md',
  'LICENSE', 'LICENSE.md', 'NOTICE', 'AUTHORS', 'CONTRIBUTORS.md',
  '.editorconfig', '.gitattributes', '.gitignore', '.markdownlint-cli2.jsonc', '.mcp.json',
  'package.json', 'package-lock.json', '.env.example',
  '.codex/config.toml', '.claude/settings.json', '.cursor/mcp.json', '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/dependabot.yml', '.githooks/pre-commit', '.githooks/commit-msg', '.githooks/pre-push',
  'supabase/.gitignore', 'supabase/config.toml', 'supabase/database.types.ts',
  'supabase/seed.sql', 'supabase/supabase.lock', 'supabase/migrations/.gitkeep',
  'apps/mobile/package.json', 'apps/mobile/app.json', 'apps/mobile/eas.json', 'apps/mobile/tsconfig.json', 'apps/mobile/eslint.config.mjs',
  'apps/mobile/.env.example', 'docs/processes/.gitkeep',
]);
const word = '[a-z0-9]+(?:-[a-z0-9]+)*';
const segments = `(?:${word}/)*`;
const mobileSource = `apps/mobile/src/${segments}`;
const disposable = /^(?:todo|notes|plan|report|handoff|session-summary|debug|scratch)(?:[-.]|$)/i;
const approvedLogo = Object.freeze({
  path: 'docs/assets/nestscout-horizon-logo-light.png',
  sha256: 'b4dbdd2eb0c742e36f61b41f87744f32f709cbdfc4441c93f17a494a87fde446',
});

export const generatedFiles = Object.freeze(['supabase/database.types.ts']);

export function checkPath(file, artifacts = []) {
  if (file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f\u007f]/u.test(file)) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(file)}`);
  }
  if (fixedPaths.has(file) || file === approvedLogo.path) return;
  if (/\.(?:pdf|zip)$/i.test(file)) {
    if (!new RegExp(`^docs/artifacts/${word}\\.(?:pdf|zip)$`).test(file) || !artifacts.some(item => item.path === file)) {
      throw new Error(`Unregistered permanent artifact: ${JSON.stringify(file)}`);
    }
    return;
  }
  if (file.startsWith('docs/processes/')) throw new Error(`docs/processes must contain only an empty .gitkeep: ${JSON.stringify(file)}`);
  const name = path.posix.basename(file);
  if (disposable.test(name)) throw new Error(`Disposable document/source name: ${JSON.stringify(file)}`);
  if (new RegExp(`^scripts/${segments}${word}(?:(?:\\.integration)?\\.(?:test|spec))?\\.mjs$`).test(file)
    || new RegExp(`^scripts/${segments}${word}\\.json$`).test(file)
    || new RegExp(`^docs/${segments}${word}(?:\\.${word})*\\.md$`).test(file)
    || new RegExp(`^\\.github/(?:workflows/|ISSUE_TEMPLATE/)${word}\\.yml$`).test(file)
    || new RegExp(`^supabase/migrations/[0-9]{14}_[a-z0-9]+(?:_[a-z0-9]+)*\\.sql$`).test(file)
    || new RegExp(`^supabase/tests/database/${segments}${word}\\.test\\.sql$`).test(file)
    || new RegExp(`^apps/mobile/src/app/(?:(?:${word}|\\(${word}\\))/)*(?:${word}|_layout)\\.tsx$`).test(file)
    || (!file.startsWith('apps/mobile/src/app/') && new RegExp(`^${mobileSource}${word}(?:\\.test)?\\.tsx?$`).test(file))
    || new RegExp(`^(?:${word}/)+(?:README\\.md|LICENSE|NOTICE|AUTHORS|CONTRIBUTORS\\.md)$`).test(file)
    || new RegExp(`^\\.(?:agents|claude)/skills/${word}/(?:SKILL\\.md|references/${word}\\.md)$`).test(file)) return;
  throw new Error(`No approved naming convention for path: ${JSON.stringify(file)}`);
}

export function checkAttribution(text, label) {
  const normalized = text.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, '')
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, '$1');
  const ai = '(?:codex(?: cli)?|claude(?: code| (?:opus|sonnet|haiku)(?: [0-9.]+)?)?|chatgpt|openai(?: codex)?|anthropic|github copilot|an? AI(?: assistant)?|AI(?: assistant)?)';
  const lead = '^\\s*(?:(?://|/\\*+|\\*|#|--|<!--|>|[-+])\\s*)*(?:🤖\\s*)?';
  const identity = new RegExp(`^${ai}(?:\\s*<[^>]+>)?[.!]?$`, 'i');
  for (const line of normalized.split(/\r?\n/)) {
    const plain = line.replace(new RegExp(lead, 'u'), '').replace(/\s*(?:\*\/|-->)\s*$/, '').replace(/[*_`]/g, '').trim();
    const trailer = /^(?:co[ -]?authored[ -]?by|signed[ -]?off[ -]?by|author|created[ -]?by)\s*:\s*(.+)$/i.exec(plain);
    if ((trailer && (identity.test(trailer[1]) || /<noreply@(?:openai|anthropic)\.com>/i.test(trailer[1])))
      || /^(?:claude-session|codex-session)\s*:/i.test(plain)
      || new RegExp(`^(?:generated|created|authored|written|built|powered|assisted|co-authored)\\s+(?:by|with)\\s+${ai}(?:\\s*(?:$|[<(.!:]))`, 'i').test(plain)
      || new RegExp(`^${ai}\\s*(?:(?:is|as)\\s+(?:(?:the|a|your)\\s+)?|[-,:=(]\\s*)(?:founder|co-founder|cofounder|owner|maintainer)\\b`, 'i').test(plain)
      || new RegExp(`^(?:founder|co-founder|cofounder|owner|maintainer)\\s*[:=-]\\s*${ai}\\s*$`, 'i').test(plain)
      || /^(?:as an? AI(?: assistant)?\b|I am an? AI(?: assistant)?\b)/i.test(plain)) {
      throw new Error(`Unapproved AI attribution or role signature in ${label}`);
    }
  }
}

const lineEnd = (text, index) => {
  const end = text.indexOf('\n', index);
  return end < 0 ? text.length : end;
};

const span = (text, start, end) => ({ text: text.slice(start, end), start });

function skipQuoted(text, index, quote, { backslash = false, doubled = false, line = false, stop = text.length } = {}) {
  for (let cursor = index + 1; cursor < stop; cursor++) {
    const char = text[cursor];
    if (line && char === '\n') return cursor;
    if (backslash && char === '\\') cursor++;
    else if (char === quote) {
      if (doubled && text[cursor + 1] === quote) cursor++;
      else return cursor + 1;
    }
  }
  return stop;
}

function javaScriptComments(file, text) {
  const comments = [];
  try {
    parseJavaScript(text, {
      ecmaVersion: 'latest', sourceType: file.endsWith('.cjs') ? 'script' : 'module',
      onComment: (_block, _value, start, end) => comments.push(span(text, start, end)),
    });
  } catch (error) {
    throw new Error(`Invalid JavaScript in ${file} at ${error.loc?.line}:${error.loc?.column}.`);
  }
  return comments;
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
    const comments = [];
    let start = 0;
    for (const [end, next] of [...literals, [text.length, text.length]]) {
      const scanner = createScanner(false, source.languageVariant, text, start, end - start);
      for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
        if ([SyntaxKind.SingleLineCommentTrivia, SyntaxKind.MultiLineCommentTrivia].includes(token)) {
          comments.push({ text: scanner.getTokenText(), start: scanner.getTokenStart() });
        }
      }
      start = next;
    }
    return comments;
  } finally {
    api.close();
  }
}

function jsoncComments(_file, text) {
  const found = [];
  for (let index = 0; index < text.length;) {
    if (text[index] === '"') {
      index = skipQuoted(text, index, '"', { backslash: true });
    } else if (text.startsWith('//', index)) {
      const end = lineEnd(text, index);
      found.push(span(text, index, end));
      index = end;
    } else if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      const end = close < 0 ? text.length : close + 2;
      found.push(span(text, index, end));
      index = end;
    } else index++;
  }
  return found;
}

const sqlIdentifier = /[\p{L}\p{N}_$]/u;
const dollarTag = /\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/uy;

function sqlComments(file, text, from = 0, stop = text.length) {
  const found = [];
  for (let index = from; index < stop;) {
    const char = text[index];
    if (text.startsWith('--', index)) {
      const end = Math.min(lineEnd(text, index), stop);
      found.push(span(text, index, end));
      index = end;
    } else if (text.startsWith('/*', index)) {
      let depth = 1;
      let end = index + 2;
      while (end < stop && depth) {
        if (text.startsWith('/*', end)) {
          depth++;
          end += 2;
        } else if (text.startsWith('*/', end)) {
          depth--;
          end += 2;
        } else end++;
      }
      found.push(span(text, index, end));
      index = end;
    } else if (char === "'") {
      const escaped = /[eE]/.test(text[index - 1] ?? '') && !sqlIdentifier.test(text[index - 2] ?? '');
      index = skipQuoted(text, index, "'", { doubled: true, backslash: escaped, stop });
    } else if (char === '"') {
      index = skipQuoted(text, index, '"', { doubled: true, stop });
    } else if (char === '$' && !sqlIdentifier.test(text[index - 1] ?? '')) {
      dollarTag.lastIndex = index;
      const tag = dollarTag.exec(text)?.[0];
      if (!tag) {
        index++;
        continue;
      }
      const closing = text.indexOf(tag, index + tag.length);
      const terminated = closing >= 0 && closing + tag.length <= stop;
      found.push(...sqlComments(file, text, index + tag.length, terminated ? closing : stop));
      index = terminated ? closing + tag.length : stop;
    } else index++;
  }
  return found;
}

function tomlComments(_file, text) {
  const found = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (char === '#') {
      const end = lineEnd(text, index);
      found.push(span(text, index, end));
      index = end;
    } else if (char === '"' || char === "'") {
      const delimiter = char.repeat(3);
      if (!text.startsWith(delimiter, index)) {
        index = skipQuoted(text, index, char, { backslash: char === '"', line: true });
        continue;
      }
      let cursor = index + 3;
      while (cursor < text.length && !text.startsWith(delimiter, cursor)) cursor += char === '"' && text[cursor] === '\\' ? 2 : 1;
      cursor = Math.min(cursor + 3, text.length);
      for (let extra = 0; extra < 2 && text[cursor] === char; extra++) cursor++;
      index = cursor;
    } else index++;
  }
  return found;
}

function shellComments(_file, text) {
  const found = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (char === '\\') index += 2;
    else if (char === "'") index = skipQuoted(text, index, "'");
    else if (char === '"') index = skipQuoted(text, index, '"', { backslash: true });
    else if (char === '#' && (index === 0 || /[\s;&|()<>]/.test(text[index - 1]))) {
      const end = lineEnd(text, index);
      found.push(span(text, index, end));
      index = end;
    } else index++;
  }
  return found;
}

function lineComments(markers) {
  return (_file, text) => {
    const found = [];
    for (let index = 0; index < text.length;) {
      const end = lineEnd(text, index);
      const lead = text.slice(index, end).search(/\S/);
      if (lead >= 0 && markers.includes(text[index + lead])) found.push({ text: text.slice(index + lead, end).trimEnd(), start: index + lead });
      index = end + 1;
    }
    return found;
  };
}

function yamlComments(_file, text) {
  const found = [];
  const collect = token => {
    if (Array.isArray(token)) token.forEach(collect);
    else if (token && typeof token === 'object') {
      if (token.type === 'comment') found.push({ text: token.source, start: token.offset });
      for (const key of ['start', 'props', 'sep', 'end', 'items', 'key', 'value']) collect(token[key]);
    }
  };
  for (const token of new YamlParser().parse(text)) collect(token);
  for (const document of parseAllDocuments(text, { uniqueKeys: false })) {
    visitYaml(document, {
      Pair(_key, pair) {
        const block = isScalar(pair.value) && [Scalar.BLOCK_LITERAL, Scalar.BLOCK_FOLDED].includes(pair.value.type);
        if (block && isScalar(pair.key) && pair.key.value === 'run' && pair.value.range) {
          const [start, end] = pair.value.range;
          for (const record of shellComments('run', text.slice(start, end))) found.push({ text: record.text, start: start + record.start });
        }
      },
    });
  }
  return [...new Map(found.map(record => [record.start, record])).values()];
}

const commentGrammars = [
  [/\.(?:[cm]?ts|tsx)$/, typeScriptComments], [/\.[cm]?js$/, javaScriptComments], [/\.sql$/, sqlComments],
  [/\.toml$/, tomlComments], [/\.ya?ml$/, yamlComments], [/\.jsonc$/, jsoncComments], [/^\.githooks\//, shellComments],
  [/(?:^|\/)\.(?:gitignore|gitattributes)$/, lineComments('#')], [/(?:^|\/)\.editorconfig$/, lineComments('#;')],
  [/(?:^|\/)\.env\.example$/, shellComments],
];
const plainConfiguration = /(?:^|\/)\.(?:gitignore|gitattributes|editorconfig|env\.example)$/;

export const hasCommentGrammar = file => commentGrammars.some(([pattern]) => pattern.test(file));

export function commentRecords(file, text) {
  const grammar = commentGrammars.find(([pattern]) => pattern.test(file));
  return grammar ? grammar[1](file, text).sort((a, b) => a.start - b.start) : null;
}

export function sourceComments(file, text) {
  const records = plainConfiguration.test(file) ? null : commentRecords(file, text);
  if (records) return records.map(record => record.text).join('\n');
  if (file.endsWith('.json')) return text.split(/\r?\n/).filter(line => /^\s*(?:#|\/\/|\/\*|\*|--)/.test(line)).join('\n');
  return text;
}

function parseConfiguration(parser, text, label) {
  try {
    return parser(text);
  } catch {
    throw new Error(`Invalid configuration syntax in ${label}.`);
  }
}

function artifactManifest(files, state) {
  const manifest = files.find(item => item.file === 'package.json' && item.state === state);
  const artifacts = manifest ? parseConfiguration(JSON.parse, manifest.content.toString('utf8'), `${state} package.json`).repositoryHygiene?.artifacts ?? [] : [];
  if (!Array.isArray(artifacts)) throw new Error('repositoryHygiene.artifacts must be an array.');
  const names = new Set();
  for (const item of artifacts) {
    if (!item || typeof item.path !== 'string' || names.has(item.path) || !/^[a-f0-9]{64}$/.test(item.sha256)
      || !['purpose', 'source'].every(key => typeof item[key] === 'string' && item[key].trim().length > 0)) {
      throw new Error('Each permanent artifact needs a unique path, SHA-256, purpose and source.');
    }
    checkPath(item.path, [item]);
    if (!/\.(?:pdf|zip)$/.test(item.path)) throw new Error('Artifact manifests are only for PDF/ZIP files.');
    names.add(item.path);
    const artifact = files.find(file => file.file === item.path && file.state === state);
    if (!artifact || createHash('sha256').update(artifact.content).digest('hex') !== item.sha256) {
      throw new Error(`Missing or mismatched ${state} artifact: ${item.path}`);
    }
  }
  return artifacts;
}

export function checkHygiene(repository = root) {
  checkTestArtifacts(repository);
  const files = repositoryFiles(repository);
  const inspected = new Map();
  for (const state of ['index', 'working']) {
    const artifacts = artifactManifest(files, state);
    for (const required of ['.codex/config.toml', '.claude/settings.json']) {
      if (!files.some(item => item.file === required && item.state === state)) throw new Error(`Missing ${state} attribution configuration: ${required}`);
    }
    const seen = new Set();
    for (const { file, content } of files.filter(item => item.state === state)) {
      checkPath(file, artifacts);
      const folded = file.toLowerCase();
      if (seen.has(folded)) throw new Error(`Case-colliding repository path: ${JSON.stringify(file)}`);
      seen.add(folded);
      if (inspected.get(file)?.equals(content)) continue;
      if (file === approvedLogo.path) {
        if (createHash('sha256').update(content).digest('hex') !== approvedLogo.sha256) {
          throw new Error(`Owner-approved logo checksum mismatch: ${state} ${file}`);
        }
        inspected.set(file, content);
        continue;
      }
      if (/\.(?:pdf|zip)$/.test(file)) {
        for (const record of inspectArtifact(file, content)) {
          checkAttribution(record.metadata ? record.text : sourceComments(record.file, record.text), `${state} ${file}/${record.file}`);
        }
        inspected.set(file, content);
        continue;
      }
      if (file === 'docs/processes/.gitkeep' && content.length !== 0) {
        throw new Error(`docs/processes/.gitkeep must be exactly 0 bytes: ${state}`);
      }
      if (hasArtifactSignature(content)) throw new Error(`PDF/ZIP content requires its registered artifact extension: ${state} ${file}`);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
      if (text.includes('\0')) throw new Error(`Unexpected binary content: ${JSON.stringify(file)}`);
      if (file.endsWith('.json')) parseConfiguration(JSON.parse, text, `${state} ${file}`);
      if (file === '.codex/config.toml') {
        const config = parseConfiguration(parse, text, `${state} ${file}`);
        if (Object.hasOwn(config, 'commit_attribution') && config.commit_attribution !== '') throw new Error(`Configured Codex commit_attribution must be empty in ${state}.`);
      }
      if (file === '.claude/settings.json') {
        const attribution = parseConfiguration(JSON.parse, text, `${state} ${file}`).attribution;
        if (attribution !== false && (attribution?.commit !== '' || attribution?.pr !== '' || attribution?.sessionUrl !== false)) throw new Error(`Claude attribution must be disabled in ${state}.`);
      }
      checkAttribution(sourceComments(file, text), `${state} ${file}`);
      inspected.set(file, content);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === '--hook') checkHookIndex(root);
  else if (process.argv.length !== 2) throw new Error('Use no arguments or --hook.');
  checkHygiene();
  console.log('Repository paths, index/working content and attribution settings passed. Comment usefulness requires review.');
}
