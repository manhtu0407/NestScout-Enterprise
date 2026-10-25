import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAlias, parseDocument, visit } from 'yaml';
import { repositoryFiles } from './repository-files.mjs';
import { checkPath } from './check-hygiene.mjs';
import { root } from './tool-path.mjs';

const skillPath = /^\.(?:agents|claude)\/skills\//i;
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedNames = new Set(['synced', 'anthropic-skills']);
const fields = new Set(['name', 'description', 'license', 'compatibility', 'metadata']);

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function checkLinks(text, file, available, label) {
  // Check inline/image, reference-definition and HTML destinations; never fetch them.
  const destinations = [
    ...text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+[^\n)]*)?\)/g),
    ...text.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/gm),
    ...text.matchAll(/\b(?:href|src)\s*=\s*["']([^"'\n]+)["']/gi),
  ];
  for (const match of destinations) {
    let destination;
    try { destination = decodeURIComponent(match[1].replace(/^<|>$/g, '')); }
    catch { fail(label, 'invalid resource URL encoding'); }
    if (/^https:\/\//i.test(destination)) continue;
    if (destination.startsWith('#')) continue;
    destination = destination.split(/[?#]/)[0];
    if (!destination || /[:\\\s\u0000-\u001f\u007f]/u.test(destination)
      || destination.startsWith('/') || destination.split('/').some(part => !part || part === '..' || part === '.')) {
      fail(label, 'unsafe resource destination');
    }
    const target = path.posix.join(path.posix.dirname(file), destination);
    if (!available.has(target)) fail(label, 'missing or incorrectly cased resource destination');
  }
}

function checkManifest(content, file, available, label) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content); }
  catch { fail(label, 'expected UTF-8'); }
  if (/[\r\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(text)
    || !text.endsWith('\n')) fail(label, 'expected LF, final newline and no hidden control characters');
  const frontmatter = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(text);
  if (!frontmatter || !frontmatter[2].trim()) fail(label, 'missing frontmatter delimiters or body');
  const document = parseDocument(frontmatter[1], { schema: 'failsafe', uniqueKeys: true });
  if (document.errors.length || document.warnings.length) fail(label, 'invalid or ambiguous YAML');
  visit(document, (_key, node) => {
    if (isAlias(node) || node?.anchor || node?.tag) fail(label, 'YAML aliases, anchors and tags are unsupported');
  });
  const manifest = document.toJS({ maxAliasCount: 0 });
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail(label, 'expected a frontmatter mapping');
  if (Object.keys(manifest).some(key => !fields.has(key))) fail(label, 'unsupported frontmatter field; review runtime extensions separately');
  const name = file.split('/')[2];
  if (typeof manifest.name !== 'string' || manifest.name !== name || name.length > 64
    || !namePattern.test(name) || reservedNames.has(name)) fail(label, 'invalid, reserved or mismatched skill name');
  if (typeof manifest.description !== 'string' || !manifest.description.trim() || manifest.description.length > 1024) {
    fail(label, 'description must be a nonempty string of at most 1024 characters');
  }
  if (/\b(?:every|all|any)\s+(?:task|request|prompt)s?\b|\balways\s+(?:use|activate|invoke)\b/i.test(manifest.description)) {
    fail(label, 'universal activation description; use specific triggers');
  }
  for (const [field, limit] of [['license', 1024], ['compatibility', 500]]) {
    if (manifest[field] !== undefined && (typeof manifest[field] !== 'string' || !manifest[field].trim() || manifest[field].length > limit)) {
      fail(label, `invalid ${field}`);
    }
  }
  if (manifest.metadata !== undefined && (!manifest.metadata || typeof manifest.metadata !== 'object'
    || Array.isArray(manifest.metadata) || Object.entries(manifest.metadata).some(([key, value]) => !key.trim() || typeof value !== 'string'))) {
    fail(label, 'metadata must map string keys to strings');
  }
  if (text.split('\n').length - 1 > 500) fail(label, 'SKILL.md exceeds the local 500-line limit');
  checkLinks(text, file, available, label);
  return name;
}

export function checkSkills(repository = root) {
  const files = repositoryFiles(repository).filter(item => skillPath.test(item.file));
  const inventory = [];
  for (const state of ['index', 'working']) {
    const current = files.filter(item => item.state === state);
    const available = new Set(current.map(item => item.file));
    const names = new Set();
    for (const { file, content } of current) {
      const label = `${state} ${file}`;
      checkPath(file);
      // No resource type is needed yet; extend canonical hygiene with reviewed fixtures first.
      if (!/^\.(?:agents|claude)\/skills\/[^/]+\/SKILL\.md$/.test(file)) fail(label, 'unsupported skill package file');
      const name = checkManifest(content, file, available, label);
      if (names.has(name)) fail(label, 'colliding project skill name across native roots');
      names.add(name);
      inventory.push({ state, file, name });
    }
  }
  return inventory;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Use no arguments.');
  const inventory = checkSkills();
  console.log(`Skill format and paths passed for index and working tree (${inventory.length} manifests). Behavioral and personal-skill review remain separate.`);
}
