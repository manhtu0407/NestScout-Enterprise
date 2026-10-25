import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryFiles } from './repository-files.mjs';
import { parseDocument } from 'yaml';
import { root } from './tool-path.mjs';

export function checkYaml(repository = root) {
  for (const { file, state, content } of repositoryFiles(repository).filter(item => /\.ya?ml$/.test(item.file))) {
    const label = `${state} ${file}`;
    const document = parseDocument(new TextDecoder('utf-8', { fatal: true }).decode(content), { uniqueKeys: true });
    if (document.errors.length) {
      throw new Error(`${label}: invalid YAML (${document.errors.map(error => error.code).join(', ')}).`);
    }
    if (file.startsWith('.github/ISSUE_TEMPLATE/') && !/\/config\.ya?ml$/.test(file)) {
      const form = document.toJS();
      if (!form || !['name', 'description'].every(key => typeof form[key] === 'string' && form[key].trim()) || !Array.isArray(form.body)) {
        throw new Error(`${label}: missing Issue Form name, description, or body.`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) throw new Error('Use no arguments.');
  checkYaml();
  console.log('Index and working YAML syntax, unique keys, and Issue Form basics passed.');
}
