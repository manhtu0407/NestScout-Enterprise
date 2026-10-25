import { root } from './tool-path.mjs';
import { git } from './repository-files.mjs';

export function checkTestArtifacts(repository = root) {
  const files = git(repository, ['ls-files', '--cached', '-z']).split('\0').filter(Boolean);
  const artifacts = files.filter(file => /^(?:\.cache|coverage)(?:\/|$)/i.test(file));
  if (artifacts.length) {
    throw new Error(`EPHEMERAL artifacts must not be tracked: ${artifacts.map(file => JSON.stringify(file)).join(', ')}`);
  }
}
