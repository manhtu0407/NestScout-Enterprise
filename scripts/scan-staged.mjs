import { execFileSync } from 'node:child_process';
import { gitEnvironment } from './git-environment.mjs';
import { toolPath } from './tool-path.mjs';
import { checkTestArtifacts } from './check-test-artifacts.mjs';

export const secretScanOptions = ['--no-banner', '--redact', '--max-archive-depth=1', '--ignore-gitleaks-allow'];

export const secretScanEnvironment = (source = process.env) => Object.fromEntries(
  Object.entries(gitEnvironment(source)).filter(([name]) => !/^GITLEAKS_/i.test(name)));

export function scanStaged(repository, stdio = 'inherit') {
  checkTestArtifacts(repository);
  execFileSync(toolPath('gitleaks'), ['git', '--pre-commit', '--staged', ...secretScanOptions, repository], { cwd: repository, env: secretScanEnvironment(), stdio });
}
