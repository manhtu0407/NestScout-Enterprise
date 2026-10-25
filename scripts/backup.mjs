import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { root } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';

const run = (command, args, cwd) => execFileSync(command, args, {
  cwd, env: gitEnvironment(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

export function backupDestination(repository, requested) {
  if (!requested || !path.isAbsolute(requested)) throw new Error('Provide an absolute NEW backup directory outside this checkout.');
  const absolute = path.resolve(requested);
  const directory = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));
  const relative = path.relative(realpathSync(repository), directory);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Backup must be outside the checkout, including through symlinks.');
  }
  return directory;
}

export function createGitBackup(repository, requested) {
  const directory = backupDestination(repository, requested);
  const git = (args, cwd = repository) => run('git', args, cwd);
  if (git(['status', '--porcelain', '--untracked-files=all'])) throw new Error('Commit or preserve pending work before backing up; the bundle only covers committed refs.');
  const sourceHead = git(['rev-parse', 'HEAD']);
  const refs = () => git(['for-each-ref', '--format=%(refname) %(objectname)']).split('\n').filter(Boolean);
  const sourceRefs = refs();
  mkdirSync(directory); // Refuse to overwrite an existing backup; parent must exist.
  const bundle = path.join(directory, 'source.bundle');
  git(['bundle', 'create', bundle, '--all']);
  git(['bundle', 'verify', bundle]);
  const restore = path.join(directory, 'restore-proof.git');
  git(['clone', '--mirror', bundle, restore]);
  git(['fsck', '--full'], restore);
  const restoredHead = git(['rev-parse', 'HEAD'], restore);
  const restoredRefs = git(['for-each-ref', '--format=%(refname) %(objectname)'], restore).split('\n').filter(Boolean);
  if (sourceHead !== restoredHead || JSON.stringify(sourceRefs) !== JSON.stringify(restoredRefs)) {
    throw new Error('Restored HEAD or refs differ from the source snapshot.');
  }
  if (sourceHead !== git(['rev-parse', 'HEAD']) || JSON.stringify(sourceRefs) !== JSON.stringify(refs())) {
    throw new Error('Source refs changed during backup; retry after coordinating concurrent writers.');
  }
  return { directory, sourceHead, restoredHead, sourceRefs, gitRestore: 'PASS' };
}

const repo = 'repos/manhtu0407/NestScout-Enterprise';
const githubRead = (endpoint, paginated) => {
  const result = spawnSync('gh', ['api', endpoint, ...(paginated ? ['--paginate', '--slurp'] : [])], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`GitHub metadata read failed; exit ${result.status ?? 'unavailable'}. Check API access separately.`);
  }
  return JSON.parse(result.stdout);
};

export function exportMetadata(directory, read = githubRead) {
  const statuses = [];
  function exportEndpoint(label, endpoint, paginated = false) {
    let value;
    try {
      value = read(repo + endpoint, paginated);
    } catch {
      // Do not copy credential-bearing upstream error text into the archive.
      statuses.push({ label, status: 'UNVERIFIED', reason: 'API export failed; inspect endpoint access separately.' });
      return null;
    }
    writeFileSync(path.join(directory, `${label}.json`), JSON.stringify(value, null, 2) + '\n');
    statuses.push({ label, status: 'PASS' });
    return value;
  }
  const branches = exportEndpoint('branches', '/branches?per_page=100', true);
  for (const endpoint of ['', '/labels', '/milestones?state=all', '/releases', '/actions/permissions', '/actions/permissions/selected-actions', '/actions/permissions/workflow', '/rulesets', '/private-vulnerability-reporting']) {
    const label = endpoint ? endpoint.replace(/^\//, '').replaceAll('/', '-').split('?')[0] : 'repository';
    exportEndpoint(label, endpoint, ['/labels', '/milestones?state=all', '/releases', '/rulesets'].includes(endpoint));
  }
  for (const branch of branches?.flat() ?? []) {
    if (branch.protected) exportEndpoint(`branch-protection-${encodeURIComponent(branch.name)}`, `/branches/${encodeURIComponent(branch.name)}/protection`);
  }
  const issues = exportEndpoint('issues-and-prs', '/issues?state=all&per_page=100', true);
  exportEndpoint('pulls', '/pulls?state=all&per_page=100', true);
  for (const issue of issues?.flat() ?? []) {
    exportEndpoint(`issue-${issue.number}-comments`, `/issues/${issue.number}/comments?per_page=100`, true);
    if (issue.pull_request) {
      exportEndpoint(`pr-${issue.number}-reviews`, `/pulls/${issue.number}/reviews?per_page=100`, true);
      exportEndpoint(`pr-${issue.number}-review-comments`, `/pulls/${issue.number}/comments?per_page=100`, true);
    }
  }
  statuses.push({ label: 'project-views-and-workflows', status: 'UNVERIFIED', reason: 'Export separately with authorized Projects access; not included by this repository exporter.' });
  return statuses;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Provide exactly one NEW absolute backup directory.');
  run(process.execPath, [path.join(root, 'scripts/verify-repository.mjs')], root);
  const proof = createGitBackup(root, process.argv[2]);
  const exports = exportMetadata(proof.directory);
  writeFileSync(path.join(proof.directory, 'manifest.json'), JSON.stringify({
    repositoryId: 1432052547, createdAt: new Date().toISOString(), platform: process.platform,
    node: process.version, ...proof, exports,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ ...proof, exports }, null, 2));
}
