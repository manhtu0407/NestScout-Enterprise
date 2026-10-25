import { execFileSync } from 'node:child_process';
import { root } from './tool-path.mjs';

export function checkTestArtifacts(repository = root) {
  const files = execFileSync('git', ['ls-files', '--cached', '-z'], {
    cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\0').filter(Boolean);
  const artifacts = files.filter(file => /^(?:\.cache|coverage)(?:\/|$)/i.test(file));
  if (artifacts.length) {
    throw new Error(`EPHEMERAL artifacts must not be tracked: ${artifacts.map(file => JSON.stringify(file)).join(', ')}`);
  }
}
