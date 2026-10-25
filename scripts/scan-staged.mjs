import { execFileSync } from 'node:child_process';
import { toolPath } from './tool-path.mjs';
import { checkTestArtifacts } from './check-test-artifacts.mjs';

export const secretScanOptions = ['--no-banner', '--redact', '--max-archive-depth=1'];

export function scanStaged(repository, stdio = 'inherit') {
  checkTestArtifacts(repository);
  execFileSync(toolPath('gitleaks'), ['git', '--pre-commit', '--staged', ...secretScanOptions, repository], { cwd: repository, stdio });
}
