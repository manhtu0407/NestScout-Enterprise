import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
export const repositoryIdentity = Object.freeze({
  fullName: 'manhtu0407/NestScout-Enterprise', id: 1432052547,
  account: 'manhtu0407', defaultBranch: 'main', private: false,
});
export function verifyRepository() {
  const expected = repositoryIdentity.fullName;
  const accepted = new Set([`https://github.com/${expected}.git`, `https://github.com/${expected}`, `git@github.com:${expected}.git`]);
  for (const direction of [[], ['--push']]) {
    const urls = run('git', ['remote', 'get-url', ...direction, '--all', 'origin']).split(/\r?\n/);
    if (urls.some(url => !accepted.has(url))) throw new Error('Unexpected origin URL; stop before any remote write.');
  }
  const repo = JSON.parse(run('gh', ['api', `repos/${expected}`]));
  const user = JSON.parse(run('gh', ['api', 'user']));
  // The owner explicitly approved making this exact repository public on 2026-10-24.
  if (repo.id !== repositoryIdentity.id || repo.full_name !== expected || repo.private !== repositoryIdentity.private || repo.default_branch !== repositoryIdentity.defaultBranch) {
    throw new Error('Repository identity, visibility, or default branch changed; investigate before writing.');
  }
  if (user.login !== repositoryIdentity.account || !repo.permissions?.admin) throw new Error('Unexpected account or missing admin permission.');
  console.log(JSON.stringify({ repository: repo.full_name, id: repo.id, private: repo.private, account: user.login, branch: run('git', ['branch', '--show-current']) }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyRepository();
