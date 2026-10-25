import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { root, tools, toolPath } from './tool-path.mjs';
import { gitEnvironment } from './git-environment.mjs';
import { capabilities } from './tool-library.mjs';
import { validateDockerEndpoint } from './supabase-local.mjs';

const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

export function nodeVersionSupported(version, range = manifest.engines.node) {
  const bounds = /^>=([0-9]+) <([0-9]+)$/.exec(range);
  const major = /^v?([0-9]+)\./.exec(version);
  if (!bounds) throw new Error('Review doctor support for the changed Node engines range syntax.');
  return Boolean(major && Number(major[1]) >= Number(bounds[1]) && Number(major[1]) < Number(bounds[2]));
}

export function discoveryEnvironment(source = process.env) {
  return { ...gitEnvironment(source), SUPABASE_TELEMETRY_DISABLED: '1', SUPABASE_NO_UPDATE_NOTIFIER: '1',
    DO_NOT_TRACK: '1', GH_TELEMETRY: 'false', GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1' };
}

export function probe(executable, args, options = {}) {
  return spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', timeout: 15000, maxBuffer: 256 * 1024, ...options,
    env: discoveryEnvironment(options.env ?? process.env), shell: false, windowsHide: true,
  });
}

export function probeCondition(result) {
  if (result.error?.code === 'ENOENT') return 'MISSING_BINARY';
  if (result.error?.code === 'ETIMEDOUT') return 'TIMEOUT';
  return result.error || result.status !== 0 || result.signal ? 'PROBE_FAILED' : 'AVAILABLE';
}

export function dockerTarget(run = probe, environment = process.env, expectedContext) {
  if (Object.keys(environment).some(key => /^(DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|BUILDX_BUILDER|BUILDKIT_HOST)$/i.test(key) && environment[key])) {
    throw new Error('TARGET_OVERRIDE: unset Docker target overrides for this invocation.');
  }
  const selected = run('docker', ['context', 'show']);
  if (probeCondition(selected) !== 'AVAILABLE') throw new Error('CONTEXT_UNAVAILABLE');
  const context = selected.stdout.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$/.test(context) || (expectedContext && context !== expectedContext)) throw new Error('CONTEXT_MISMATCH');
  const target = run('docker', ['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}']);
  if (probeCondition(target) !== 'AVAILABLE') throw new Error('CONTEXT_UNAVAILABLE');
  let endpoint;
  try { endpoint = JSON.parse(target.stdout); validateDockerEndpoint(endpoint); } catch { throw new Error('NON_LOCAL_CONTEXT'); }
  return { context, endpoint };
}

const native = {
  docker: ['docker', ['--version']], compose: ['docker', ['compose', 'version']], buildx: ['docker', ['buildx', 'version']],
  git: ['git', ['--version']], gh: ['gh', ['--version']], node: [process.execPath, ['--version']],
  rg: ['rg', ['--version']], jq: ['jq', ['--version']], 'osv-scanner': ['osv-scanner', ['--version']],
  shellcheck: ['shellcheck', ['--version']], hadolint: ['hadolint', ['--version']], trivy: ['trivy', ['--version']],
  postgresql: ['psql', ['--version']],
  typescript: [process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--version']],
  supabase: [process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), '--version']],
};

export function diagnose(entry, run = probe, platform = { os: process.platform, arch: process.arch }, environment = process.env) {
  const start = performance.now();
  const result = { id: entry.id, configured: true, installed: false, available: false, verified: false, condition: 'NOT_APPLICABLE', probes: [] };
  function check(label, executable, args) {
    const response = run(executable, args);
    const condition = probeCondition(response);
    result.probes.push({ probe: label, condition, exitCode: response.status ?? null,
      errorCode: ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', 'UNKNOWN'].includes(response.error?.code) ? response.error.code : null });
    return response;
  }
  if (entry.tier === 'C' || entry.tier === 'D') return { ...result, elapsedMs: Math.round(performance.now() - start) };
  if (!['win32', 'linux'].includes(platform.os) || platform.arch !== 'x64') return { ...result, condition: 'UNSUPPORTED_PLATFORM', elapsedMs: 0 };
  let command = native[entry.id];
  if (['actionlint', 'gitleaks'].includes(entry.id)) command = [toolPath(entry.id), [entry.id === 'actionlint' ? '-version' : 'version']];
  if (entry.id === 'osv-scanner') {
    result.binaryPresent = existsSync(toolPath(entry.id));
    if (result.binaryPresent) command = [toolPath(entry.id), ['--version']];
  }
  if (entry.id === 'npm') {
    const cli = environment.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    command = [process.execPath, [cli, '--version']];
  }
  if (entry.id === 'repository-checks') {
    result.installed = ['markdownlint-cli2', 'yaml', '@modelcontextprotocol/sdk'].every(name => existsSync(path.join(root, 'node_modules', name, 'package.json')));
    return { ...result, available: result.installed, condition: result.installed ? 'CHECKS_NOT_RUN' : 'MISSING_DEPENDENCY', elapsedMs: Math.round(performance.now() - start) };
  }
  if (!command) throw new Error('No compiled-in probe for capability.');
  if (command[0] === process.execPath && command[1].length > 1 && !existsSync(command[1][0])) {
    return { ...result, condition: 'MISSING_DEPENDENCY', elapsedMs: Math.round(performance.now() - start) };
  }
  const version = check('version', ...command);
  result.condition = probeCondition(version);
  result.installed = result.available = result.condition === 'AVAILABLE';
  if (result.installed) result.version = String(version.stdout).match(/\b(?:v?\d+\.\d+(?:\.\d+)?(?:[-.][a-zA-Z0-9]+)*)\b/)?.[0] ?? 'UNPARSED';
  const pinnedVersion = ['typescript', 'supabase'].includes(entry.id) ? manifest.devDependencies[entry.id]
    : ['actionlint', 'gitleaks'].includes(entry.id) || (entry.id === 'osv-scanner' && result.binaryPresent) ? tools[entry.id].version : undefined;
  if (result.installed && ((entry.id === 'node' && !nodeVersionSupported(result.version))
    || (pinnedVersion && result.version.replace(/^v/, '') !== pinnedVersion))) {
    result.available = false; result.condition = 'VERSION_MISMATCH';
  }
  if (entry.id === 'gh' && result.installed) {
    const auth = check('auth-status', 'gh', ['auth', 'status']);
    if (probeCondition(auth) !== 'AVAILABLE') { result.available = false; result.condition = 'AUTH_BLOCKED'; }
  }
  if (entry.id === 'docker' && result.installed) {
    try {
      const target = dockerTarget(run, environment);
      result.localContext = true;
      const daemon = check('engine', 'docker', ['--context', target.context, 'version', '--format', '{{.Server.Version}}']);
      const info = check('engine-info', 'docker', ['--context', target.context, 'info', '--format', '{{.OSType}}']);
      result.available = probeCondition(daemon) === 'AVAILABLE' && probeCondition(info) === 'AVAILABLE';
      result.condition = result.available ? 'AVAILABLE' : 'NO_DAEMON';
      if (result.available) result.engineVersion = daemon.stdout.match(/^\d+\.\d+\.\d+/)?.[0] ?? 'UNPARSED';
    } catch (error) {
      result.available = false;
      result.condition = ['TARGET_OVERRIDE', 'CONTEXT_UNAVAILABLE', 'CONTEXT_MISMATCH', 'NON_LOCAL_CONTEXT'].find(code => error.message.startsWith(code)) ?? 'PROBE_FAILED';
    }
  }
  return { ...result, elapsedMs: Math.round(performance.now() - start) };
}

export function doctorExitCode(entries, results) {
  return results.some(result => {
    const tier = entries.find(entry => entry.id === result.id)?.tier;
    return !result.available && (tier === 'A' || (tier === 'B' && !['MISSING_BINARY', 'UNSUPPORTED_PLATFORM'].includes(result.condition)));
  }) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--tool' || !/^[a-z][a-z0-9-]*$/.test(args[1]))) throw new Error('Use no arguments or --tool <tool-id>.');
  const entries = capabilities().filter(entry => !args.length || entry.id === args[1]);
  if (!entries.length) throw new Error('Unknown tool ID.');
  const results = entries.map(entry => diagnose(entry));
  console.log(JSON.stringify({ platform: process.platform, arch: process.arch, node: process.version, results, note: 'Version/auth/engine probes only. VERIFIED requires the runbook smoke or relevant checks; no installs or stack starts.' }, null, 2));
  process.exitCode = doctorExitCode(entries, results);
}
