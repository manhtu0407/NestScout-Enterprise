import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, lstatSync } from 'node:fs';
import { tmpdir, freemem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { probe, probeCondition, dockerTarget } from './tool-doctor.mjs';

const label = 'nestscout.tool-smoke';
const imageId = /^sha256:[a-f0-9]{64}$/;
const containerId = /^[a-f0-9]{64}$/;

export function assertOwned(object, owner, id, type) {
  if (object?.Id !== id || object?.Config?.Labels?.[label] !== owner
    || (type === 'container' && object.Name !== `/${owner}`)) throw new Error('OWNERSHIP_MISMATCH: refusing cleanup.');
}

export function assertBuilder(text, context) {
  const driver = /^Driver:\s+(\S+)\s*$/m.exec(text)?.[1];
  const endpoints = [...text.matchAll(/^Endpoint:\s+(\S+)\s*$/gm)].map(match => match[1]);
  if (driver !== 'docker' || endpoints.length !== 1 || endpoints[0] !== context
    || !/^Status:\s+running\s*$/m.test(text)) throw new Error('NON_LOCAL_BUILDER');
}

export function smoke({ context, image, run = probe, environment = process.env, hostMemory = freemem(), platform = process.platform }) {
  if (!['win32', 'linux'].includes(platform)) throw new Error('UNSUPPORTED_PLATFORM');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$/.test(context ?? '') || !imageId.test(image ?? '')) throw new Error('Use an explicit context and existing immutable local image ID.');
  if (hostMemory < 256 * 1024 * 1024) throw new Error('RESOURCE_BLOCKED');
  const started = performance.now();
  const target = dockerTarget(run, environment, context);
  const owner = `nestscout-tool-smoke-${randomUUID()}`;
  const composeOwner = `${owner}-compose`;
  const tag = `${owner}:local`;
  const prefix = ['--context', context];
  const steps = [];
  function command(args, mutation = false, options = {}) {
    if (mutation && dockerTarget(run, environment, context).endpoint !== target.endpoint) throw new Error('CONTEXT_CHANGED');
    const result = run('docker', [...prefix, ...args], options);
    if (probeCondition(result) !== 'AVAILABLE') throw new Error(`DOCKER_OPERATION_FAILED: ${args[0]}/${args[1] ?? ''}; ${probeCondition(result)}; exit ${result.status ?? 'none'}.`);
    return result.stdout.trim();
  }
  function inspect(type, id) {
    const format = type === 'image'
      ? '{"Id":{{json .Id}},"Os":{{json .Os}},"Config":{"Labels":{{json (index .Config "Labels")}},"Volumes":{{json (index .Config "Volumes")}}}}'
      : '{"Id":{{json .Id}},"Name":{{json .Name}},"Config":{"Labels":{{json (index .Config "Labels")}}},"State":{"Running":{{json .State.Running}},"ExitCode":{{json .State.ExitCode}}}}';
    try { return JSON.parse(command([type, 'inspect', id, '--format', format])); }
    catch { throw new Error('INSPECTION_FAILED: no unsafe cleanup attempted.'); }
  }
  let engine;
  try { engine = JSON.parse(command(['info', '--format', '{"OSType":{{json .OSType}},"MemTotal":{{json .MemTotal}},"NCPU":{{json .NCPU}}}'])); }
  catch { throw new Error('ENGINE_INFO_UNAVAILABLE'); }
  if (engine.OSType !== 'linux' || engine.MemTotal < 256 * 1024 * 1024 || engine.NCPU < 1) throw new Error('RESOURCE_OR_ENGINE_BLOCKED');
  const localImage = inspect('image', image);
  if (localImage.Id !== image || localImage.Os !== 'linux' || Object.keys(localImage.Config?.Volumes ?? {}).length) throw new Error('UNSUITABLE_IMAGE: use an inspected Linux image without declared volumes.');
  command(['compose', 'version']);
  command(['buildx', 'version']);
  assertBuilder(command(['buildx', 'inspect', context]), context);
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-tool-smoke-'));
  let created = false;
  let composed = false;
  let built = false;
  let failure;
  const cleanup = [];
  try {
    const composeArgs = ['compose', '--project-name', owner, '--file', path.join(directory, 'compose.yaml')];
    writeFileSync(path.join(directory, 'compose.yaml'), `services:\n  smoke:\n    image: ${image}\n    container_name: ${composeOwner}\n    labels:\n      ${label}: ${composeOwner}\n    network_mode: none\n    read_only: true\n    user: "65534:65534"\n    cap_drop: [ALL]\n    security_opt: [no-new-privileges:true]\n    pids_limit: 32\n    mem_limit: 32m\n    memswap_limit: 32m\n    cpus: 0.25\n    entrypoint: ["/bin/sh"]\n    command: ["-c", "printf nestscout-tool-smoke"]\n`);
    const services = command([...composeArgs, 'config', '--services']);
    if (services !== 'smoke') throw new Error('COMPOSE_MODEL_FAILED');
    steps.push('compose-config');
    writeFileSync(path.join(directory, 'payload.txt'), 'nestscout-tool-smoke\n');
    writeFileSync(path.join(directory, 'Dockerfile'), `FROM scratch\nLABEL ${label}="${owner}"\nCOPY payload.txt /payload.txt\n`);
    built = true;
    command(['buildx', '--builder', context, 'build', '--network', 'none', '--pull=false', '--load', '--tag', tag, directory], true, { timeout: 60000 });
    const builtImage = inspect('image', tag);
    if (!imageId.test(builtImage.Id)) throw new Error('INVALID_BUILT_IMAGE');
    assertOwned(builtImage, owner, builtImage.Id, 'image');
    steps.push('buildx-scratch-build');
    // Mark the exact unique name before create: a timed-out client may leave the container behind.
    created = true;
    const id = command(['container', 'create', '--name', owner, '--label', `${label}=${owner}`, '--pull', 'never',
      '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--user', '65534:65534', '--pids-limit', '32', '--memory', '32m', '--memory-swap', '32m', '--cpus', '0.25',
      '--entrypoint', '/bin/sh', image, '-c', 'printf nestscout-tool-smoke'], true);
    if (!containerId.test(id)) throw new Error('INVALID_CONTAINER_ID');
    assertOwned(inspect('container', id), owner, id, 'container');
    const output = command(['container', 'start', '--attach', id], true);
    const finished = inspect('container', id);
    assertOwned(finished, owner, id, 'container');
    if (finished.State?.Running !== false || finished.State?.ExitCode !== 0 || output !== 'nestscout-tool-smoke') throw new Error('CONTAINER_SMOKE_FAILED');
    steps.push('bounded-container-execution');
    composed = true;
    command([...composeArgs, 'up', '--pull', 'never', '--no-build', '--abort-on-container-exit', '--exit-code-from', 'smoke', '--no-log-prefix'], true, { timeout: 30000 });
    const composedContainer = inspect('container', composeOwner);
    if (!containerId.test(composedContainer.Id)) throw new Error('INVALID_COMPOSE_CONTAINER_ID');
    assertOwned(composedContainer, composeOwner, composedContainer.Id, 'container');
    if (composedContainer.State?.Running !== false || composedContainer.State?.ExitCode !== 0
      || command(['container', 'logs', composedContainer.Id]) !== 'nestscout-tool-smoke') throw new Error('COMPOSE_SMOKE_FAILED');
    steps.push('bounded-compose-lifecycle');
  } catch (error) {
    failure = error;
  } finally {
    for (const [type, attempted, reference, expectedOwner] of [['container', created, owner, owner],
      ['container', composed, composeOwner, composeOwner], ['image', built, tag, owner]]) {
      if (!attempted) continue;
      try {
        // Listing uses exact equality after parsing; an inspect failure never authorizes removal.
        const names = command([type, 'ls', ...(type === 'container' ? ['--all'] : []), '--format', type === 'container' ? '{{.Names}}' : '{{.Repository}}:{{.Tag}}']).split('\n');
        if (!names.includes(reference)) continue;
        const object = inspect(type, reference);
        if (!(type === 'container' ? containerId : imageId).test(object.Id)) throw new Error('INVALID_OBJECT_ID');
        assertOwned(object, expectedOwner, object.Id, type);
        command([type, 'rm', ...(type === 'container' ? ['--force'] : []), object.Id], true);
        cleanup.push(type);
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Smoke and cleanup failed; inspect the exact task name.') : error;
      }
    }
    try {
      if (path.dirname(realpathSync(directory)) !== realpathSync(tmpdir()) || lstatSync(directory).isSymbolicLink()) throw new Error('UNSAFE_TEMP_DIRECTORY');
      rmSync(directory, { recursive: true });
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'Smoke and temporary cleanup failed.') : error;
    }
  }
  if (failure) throw Object.assign(failure, { owner });
  return { status: 'PASS', owner, steps, cleanup, networkPulls: 0, elapsedMs: Math.round(performance.now() - started),
    limitations: 'Synthetic Compose/container and scratch build only. Small shared BuildKit cache may remain; no prune. No product/native integration.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--context' || args[2] !== '--image') throw new Error('Use --context <observed-local-context> --image sha256:<existing-local-id>.');
  try { console.log(JSON.stringify(smoke({ context: args[1], image: args[3] }), null, 2)); }
  catch (error) {
    console.error(JSON.stringify({ status: 'FAIL', reason: error.message, owner: error.owner, causes: error.errors?.map(item => item.message) }));
    process.exitCode = 1;
  }
}
