import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { repositoryFiles } from './repository-files.mjs';

const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const fields = ['id', 'name', 'tier', 'documentation', 'officialReference', 'versionSource', 'canonicalScripts'];

export function validateCapabilities(catalog, manifest, files) {
  if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.capabilities)
    || Object.keys(catalog).sort().join() !== 'capabilities,schemaVersion') throw new Error('Invalid capability catalog.');
  const seen = new Set();
  for (const entry of catalog.capabilities) {
    if (!entry || Object.keys(entry).sort().join() !== [...fields].sort().join()
      || !identifier.test(entry.id) || seen.has(entry.id)
      || !['A', 'B', 'C', 'D'].includes(entry.tier)
      || !['name', 'versionSource'].every(key => typeof entry[key] === 'string' && entry[key].trim() && !/[\x00-\x1f]/.test(entry[key]))) {
      throw new Error('Invalid or duplicate capability entry.');
    }
    seen.add(entry.id);
    if (!/^docs\/tool-library\/[a-z][a-z0-9-]*\.md$/.test(entry.documentation)
      || !files.has(entry.documentation) || !files.get(entry.documentation).trim()) throw new Error('Invalid or missing capability documentation.');
    let url;
    try { url = new URL(entry.officialReference); } catch { throw new Error('Invalid official reference.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid official reference.');
    if (!Array.isArray(entry.canonicalScripts) || new Set(entry.canonicalScripts).size !== entry.canonicalScripts.length
      || entry.canonicalScripts.some(name => !/^[a-z][a-z0-9:-]*$/.test(name) || !Object.hasOwn(manifest.scripts ?? {}, name))) {
      throw new Error('Missing or invalid canonical npm script.');
    }
  }
  if (!seen.size) throw new Error('Empty capability catalog.');
  return catalog.capabilities;
}

export function checkCapabilities(repository = root) {
  const snapshots = repositoryFiles(repository);
  for (const state of ['index', 'working']) {
    const files = new Map(snapshots.filter(item => item.state === state).map(item => [item.file, item.content.toString('utf8')]));
    const catalog = files.get('scripts/tool-capabilities.json');
    if (!catalog) throw new Error(`${state}: capability catalog missing.`);
    validateCapabilities(JSON.parse(catalog), JSON.parse(files.get('package.json')), files);
  }
}

export function capabilities() {
  const catalog = JSON.parse(readFileSync(path.join(root, 'scripts/tool-capabilities.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const files = new Map(catalog.capabilities.map(entry => {
    if (!/^docs\/tool-library\/[a-z][a-z0-9-]*\.md$/.test(entry?.documentation)) throw new Error('Invalid documentation path.');
    return [entry.documentation, readFileSync(path.join(root, entry.documentation), 'utf8')];
  }));
  return validateCapabilities(catalog, manifest, files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--validate') {
    checkCapabilities();
    console.log('Capability catalog validated in index and working tree.');
  } else {
    if (args.length > 1 || (args.length && !identifier.test(args[0]))) throw new Error('Use no arguments, a tool ID, or --validate.');
    const entries = capabilities().filter(entry => !args.length || entry.id === args[0]);
    if (!entries.length) throw new Error('Unknown tool ID.');
    for (const entry of entries) console.log(`${entry.tier} ${entry.id}: ${entry.name}\n  ${entry.documentation}\n  ${entry.officialReference}\n  version: ${entry.versionSource}\n  npm: ${entry.canonicalScripts.join(', ') || 'none; native help and activation prerequisites in runbook'}`);
  }
}
