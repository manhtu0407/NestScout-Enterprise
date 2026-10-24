import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { root } from './tool-path.mjs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
let failed = false;
for (const file of [...new Set(files)].filter(file => /\.ya?ml$/.test(file))) {
  const document = parseDocument(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { uniqueKeys: true });
  for (const error of document.errors) {
    console.error(`${file}: ${error.message}`);
    failed = true;
  }
  if (file.startsWith('.github/ISSUE_TEMPLATE/') && !file.endsWith('/config.yml') && !document.errors.length) {
    const form = document.toJS();
    if (!form.name || !form.description || !Array.isArray(form.body)) {
      console.error(`${file}: missing Issue Form name, description, or body.`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
else console.log('YAML syntax, unique keys, and Issue Form basics passed.');
