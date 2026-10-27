import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';
import { checkAttribution } from './check-hygiene.mjs';
import { repositoryIdentity, acceptedOriginUrls } from './verify-repository.mjs';

const slug = '[a-z0-9]+(?:-[a-z0-9]+)*';
const featureBranch = new RegExp(`^(?:(?:feat|fix|docs|chore)/[1-9][0-9]*-${slug}|(?:codex|claude)/${slug})$`);
const dependencyBranch = /^dependabot\/(?:github_actions|npm_and_yarn)\/[a-z0-9][a-z0-9._/-]*$/;

export function checkBranch(branch, { allowMain = false, automation = false } = {}) {
  if ((allowMain && branch === 'main') || featureBranch.test(branch) || (automation && dependencyBranch.test(branch))) return;
  throw new Error('Branch must use feat|fix|docs|chore/<issue>-<kebab-name> or codex|claude/<kebab-name>.');
}

export function checkMessage(message, { automation = false, merge = false } = {}) {
  checkAttribution(message, 'delivery metadata');
  checkAttribution(message.replace(/\r?\n[ \t]+/g, ' '), 'unfolded delivery metadata');
  checkAttribution(message.split(/\r?\n/)[0].replace(/^[a-z]+(?:\([a-z0-9-]+\))?!?:\s*/, ''), 'delivery title');
  if (/\[(?:(?:skip|no)[ -](?:ci|actions)|(?:ci|actions)[ -]skip)\]|^\s*skip-checks\s*:\s*true\s*$/im.test(message)) {
    throw new Error('CI-skip directives are prohibited.');
  }
  const title = message.split(/\r?\n/)[0];
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(message.replace(/[\r\n\t]/g, ''))) throw new Error('Invisible/control characters in delivery metadata.');
  if (title.length > 100 || title !== title.trim()) throw new Error('Delivery title must be trimmed and at most 100 characters.');
  if (/^(?:feat|fix|docs|chore|test|refactor|perf|build|ci|revert)(?:\([a-z0-9-]+\))?!?: \S.*$/.test(title)) return;
  if (automation && /^Bump \S.+/.test(title)) return;
  if (merge && /^Merge (?:branch|remote-tracking branch) '.+'(?: into .+)?$/.test(title)) return;
  if (/^Revert ".+"$/.test(title) && /^This reverts commit [a-f0-9]{40}\.$/m.test(message)) return;
  throw new Error('Use an outcome-focused conventional title, for example chore: enforce repository hygiene.');
}

export function checkCommitRange(repository, base, head, options = {}) {
  for (const sha of git(repository, ['rev-list', `${base}..${head}`]).trim().split('\n').filter(Boolean)) {
    const parents = git(repository, ['show', '-s', '--format=%P', sha]).trim().split(' ').filter(Boolean);
    const author = git(repository, ['show', '-s', '--format=%an <%ae>', sha]).trim();
    const automation = options.automation || author === 'dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>';
    try {
      checkMessage(git(repository, ['show', '-s', '--format=%B', sha]), { automation, merge: parents.length > 1 });
    } catch (error) {
      throw new Error(`Commit ${sha}: ${error.message}`);
    }
  }
}

export function checkPullRequest(event) {
  const pr = event.pull_request;
  if (event.repository?.id !== repositoryIdentity.id || event.repository?.full_name !== repositoryIdentity.fullName
    || pr?.base?.repo?.id !== repositoryIdentity.id || pr.base.repo.full_name !== repositoryIdentity.fullName || pr.base.ref !== repositoryIdentity.defaultBranch) {
    throw new Error('Unexpected pull request repository or base.');
  }
  const automation = pr.user?.login === 'dependabot[bot]' && pr.user?.type === 'Bot'
    && pr.head?.repo?.id === repositoryIdentity.id && dependencyBranch.test(pr.head.ref);
  checkBranch(pr.head?.ref ?? '', { automation });
  if (typeof pr.title !== 'string' || typeof pr.body !== 'string') throw new Error('PR title and body are required.');
  checkMessage(`${pr.title}\n\n${pr.body}`, { automation });
  if (!/\b(?:Closes|Fixes|Resolves)\s+#([1-9][0-9]*)\b/i.test(pr.body) && !automation) throw new Error('PR body must link an Issue with Closes/Fixes/Resolves #N.');
  for (const key of ['base', 'head']) {
    if (!/^[a-f0-9]{40}$/.test(pr[key]?.sha ?? '')) throw new Error(`Missing PR ${key} SHA.`);
  }
  return { base: pr.base.sha, head: pr.head.sha, automation };
}

export function metadataRange(repository, environment = process.env) {
  if (environment.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(environment.GITHUB_EVENT_PATH, 'utf8'));
    if (environment.GITHUB_EVENT_NAME === 'pull_request') {
      const { base, head, automation } = checkPullRequest(event);
      git(repository, ['merge-base', '--is-ancestor', head, 'HEAD']);
      return { base, head, automation };
    }
    if (environment.GITHUB_EVENT_NAME === 'push') {
      if (event.repository?.id !== repositoryIdentity.id || event.repository?.full_name !== repositoryIdentity.fullName || event.ref !== `refs/heads/${repositoryIdentity.defaultBranch}`
        || !/^[a-f0-9]{40}$/.test(event.before ?? '') || /^0+$/.test(event.before)
        || !/^[a-f0-9]{40}$/.test(event.after ?? '') || git(repository, ['rev-parse', 'HEAD']).trim() !== event.after) {
        throw new Error('Unexpected push event or revision.');
      }
      return { base: event.before, head: event.after };
    }
    throw new Error('Unsupported metadata event; use pull_request or push.');
  }
  git(repository, ['rev-parse', '--verify', 'refs/remotes/origin/main']);
  return { base: 'refs/remotes/origin/main', head: 'HEAD' };
}

export function checkMetadata(repository = root, environment = process.env) {
  if (!environment.GITHUB_EVENT_PATH) checkBranch(git(repository, ['branch', '--show-current']).trim(), { allowMain: true });
  const { base, head, automation } = metadataRange(repository, environment);
  checkCommitRange(repository, base, head, { automation });
}

export function checkRemote([name, url] = []) {
  if (name !== 'origin' || !acceptedOriginUrls.has(url)) {
    throw new Error('Push target must be the origin remote of manhtu0407/NestScout-Enterprise.');
  }
}

export function checkPush(repository, input, remote) {
  const current = git(repository, ['branch', '--show-current']).trim();
  checkBranch(current);
  if (remote) checkRemote(remote);
  if (git(repository, ['status', '--porcelain=v1', '--untracked-files=no', '-z']).length) {
    throw new Error('Tracked changes exist, so local checks would not describe the pushed commit. Commit them or push from a clean task worktree.');
  }
  for (const line of input.trim().split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    const [localRef, localSha, remoteRef] = fields;
    if (fields.length !== 4 || localRef !== `refs/heads/${current}` || remoteRef !== localRef
      || localSha !== git(repository, ['rev-parse', 'HEAD']).trim()) {
      throw new Error('Optional pre-push hook supports only the current feature branch at HEAD, with the same remote name.');
    }
    checkCommitRange(repository, 'refs/remotes/origin/main', localSha);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, file] = process.argv.slice(2);
  if (mode === '--commit-msg' && file && process.argv.length === 4) {
    const mergeHead = git(root, ['rev-parse', '--git-path', 'MERGE_HEAD']).trim();
    checkMessage(readFileSync(file, 'utf8'), { merge: existsSync(path.resolve(root, mergeHead)) });
  } else if (mode === '--pre-push' && process.argv.length === 5) checkPush(root, readFileSync(0, 'utf8'), process.argv.slice(3));
  else if (mode === undefined) checkMetadata();
  else throw new Error('Use no arguments, --commit-msg <file>, or --pre-push <remote> <url>.');
  console.log('Branch and delivery metadata passed.');
}
