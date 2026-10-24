import { execFileSync } from 'node:child_process';
import { toolPath } from './tool-path.mjs';

export function scanStaged(repository, stdio = 'inherit') {
  execFileSync(toolPath('gitleaks'), ['git', '--pre-commit', '--staged', '--no-banner', '--redact', repository], { cwd: repository, stdio });
}
