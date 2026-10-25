import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolPath } from './tool-path.mjs';
import { probe } from './tool-doctor.mjs';

const families = {
  trivy: ['', 'image', 'filesystem', 'config', 'rootfs', 'sbom', 'clean'],
  k6: ['', 'run', 'inspect', 'archive', 'version'],
  docker: ['', 'container', 'container ls', 'container inspect', 'container logs', 'container stats', 'container exec',
    'image', 'image inspect', 'network', 'volume', 'system', 'system df', 'context', 'events'],
  compose: ['', 'config', 'ps', 'logs', 'up', 'down', 'build', 'run', 'wait'],
  buildx: ['', 'ls', 'inspect', 'build', 'du', 'prune', 'imagetools', 'bake'],
  jq: [''], shellcheck: [''], hadolint: [''], gitleaks: ['', 'git', 'dir', 'stdin'],
  actionlint: [''], 'osv-scanner': ['', 'scan', 'scan source', 'scan image', 'fix'],
};

export function helpCommand(args) {
  const [tool, ...words] = args;
  if (!Object.hasOwn(families, tool ?? '') || !families[tool].includes(words.join(' '))
    || words.some(word => !/^[a-z]+$/.test(word))) throw new Error('Use a known tool and documented help family; no flags, paths or shell strings.');
  const docker = ['docker', 'compose', 'buildx'].includes(tool);
  return [docker ? 'docker' : toolPath(tool), [
    ...(docker && tool !== 'docker' ? [tool] : []), ...words, tool === 'actionlint' ? '-help' : '--help',
  ]];
}

export function nativeHelp(args, run = probe) {
  const [executable, argv] = helpCommand(args);
  const result = run(executable, argv);
  if (result.error || result.signal || result.status !== 0) throw new Error(`HELP_UNAVAILABLE: exit ${result.status ?? result.error?.code ?? result.signal}`);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(nativeHelp(process.argv.slice(2)));
}
