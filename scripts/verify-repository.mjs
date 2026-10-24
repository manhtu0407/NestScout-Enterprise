import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
const expected = 'manhtu0407/NestScout-Enterprise';
const accepted = new Set([`https://github.com/${expected}.git`, `https://github.com/${expected}`, `git@github.com:${expected}.git`]);
for (const direction of [[], ['--push']]) {
  const urls = run('git', ['remote', 'get-url', ...direction, '--all', 'origin']).split(/\r?\n/);
  if (urls.some(url => !accepted.has(url))) throw new Error('Unexpected origin URL; stop before any remote write.');
}
const repo = JSON.parse(run('gh', ['api', `repos/${expected}`]));
const user = JSON.parse(run('gh', ['api', 'user']));
// The owner explicitly approved making this exact repository public on 2026-10-24.
if (repo.id !== 1432052547 || repo.full_name !== expected || repo.private !== false || repo.default_branch !== 'main') {
  throw new Error('Repository identity, visibility, or default branch changed; investigate before writing.');
}
if (user.login !== 'manhtu0407' || !repo.permissions?.admin) throw new Error('Unexpected account or missing admin permission.');
console.log(JSON.stringify({ repository: repo.full_name, id: repo.id, private: repo.private, account: user.login, branch: run('git', ['branch', '--show-current']) }, null, 2));
