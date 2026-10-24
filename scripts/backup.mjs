import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './tool-path.mjs';

const requested = process.argv[2];
if (!requested || !path.isAbsolute(requested)) throw new Error('Provide an absolute NEW backup directory outside this checkout.');
const directory = path.resolve(requested);
const relative = path.relative(root, directory);
if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
  throw new Error('Backup must be outside the checkout.');
}
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
run(process.execPath, [path.join(root, 'scripts/verify-repository.mjs')]);
if (run('git', ['status', '--porcelain'])) throw new Error('Commit or preserve pending work before backing up; the bundle only covers committed refs.');
mkdirSync(directory); // Refuse to overwrite an existing backup; parent must exist.
const bundle = path.join(directory, 'source.bundle');
run('git', ['bundle', 'create', bundle, '--all']);
run('git', ['bundle', 'verify', bundle]);
const restore = path.join(directory, 'restore-proof');
run('git', ['clone', '--no-hardlinks', bundle, restore]);
run('git', ['fsck', '--full'], restore);
const sourceHead = run('git', ['rev-parse', 'HEAD']);
const restoredHead = run('git', ['rev-parse', 'HEAD'], restore);
if (sourceHead !== restoredHead) throw new Error('Restored HEAD differs from source HEAD.');
const repo = 'repos/manhtu0407/NestScout-Enterprise';
const statuses = [];
function exportEndpoint(label, endpoint, paginated = false) {
  const result = spawnSync('gh', ['api', endpoint, ...(paginated ? ['--paginate', '--slurp'] : [])], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    statuses.push({ label, status: 'UNVERIFIED', reason: result.stderr.trim() });
    return null;
  }
  const value = JSON.parse(result.stdout);
  writeFileSync(path.join(directory, `${label}.json`), JSON.stringify(value, null, 2) + '\n');
  statuses.push({ label, status: 'PASS' });
  return value;
}
for (const endpoint of ['', '/branches', '/labels', '/milestones?state=all', '/releases', '/actions/permissions', '/actions/permissions/selected-actions', '/actions/permissions/workflow', '/rulesets']) {
  const label = endpoint ? endpoint.replace(/^\//, '').replaceAll('/', '-').split('?')[0] : 'repository';
  exportEndpoint(label, repo + endpoint, ['/branches', '/labels', '/milestones?state=all', '/releases'].includes(endpoint));
}
const issues = exportEndpoint('issues-and-prs', `${repo}/issues?state=all&per_page=100`, true);
exportEndpoint('pulls', `${repo}/pulls?state=all&per_page=100`, true);
for (const issue of issues?.flat() ?? []) {
  exportEndpoint(`issue-${issue.number}-comments`, `${repo}/issues/${issue.number}/comments?per_page=100`, true);
  if (issue.pull_request) {
    exportEndpoint(`pr-${issue.number}-reviews`, `${repo}/pulls/${issue.number}/reviews?per_page=100`, true);
    exportEndpoint(`pr-${issue.number}-review-comments`, `${repo}/pulls/${issue.number}/comments?per_page=100`, true);
  }
}
statuses.push({ label: 'project-views-and-workflows', status: 'UNVERIFIED', reason: 'Export separately through Projects UI/API with authorized project scope; repository token has no Projects scope.' });
writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ repositoryId: 1432052547, createdAt: new Date().toISOString(), sourceHead, restoredHead, gitRestore: 'PASS', exports: statuses }, null, 2) + '\n');
console.log(JSON.stringify({ directory, sourceHead, restoredHead, exports: statuses }, null, 2));
