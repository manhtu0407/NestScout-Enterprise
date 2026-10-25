import { execFileSync } from 'node:child_process';
import { toolPath } from './tool-path.mjs';
import { checkTestArtifacts } from './check-test-artifacts.mjs';

export function scanStaged(repository, stdio = 'inherit') {
  checkTestArtifacts(repository);
  execFileSync(toolPath('gitleaks'), ['git', '--pre-commit', '--staged', '--no-banner', '--redact', repository], { cwd: repository, stdio });
}
