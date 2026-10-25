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

export function dockerEngineCondition(...responses) {
  const failed = responses.filter(response => probeCondition(response) !== 'AVAILABLE');
  if (!failed.length) return 'AVAILABLE';
  if (failed.some(response => ['EACCES', 'EPERM'].includes(response.error?.code)
    || /permission denied|access (?:is )?denied/i.test(String(response.stderr)))) return 'ENGINE_ACCESS_BLOCKED';
  if (failed.some(response => probeCondition(response) === 'TIMEOUT')) return 'TIMEOUT';
  if (failed.some(response => /connection refused|daemon is not running|cannot find the file specified|no such file or directory/i.test(String(response.stderr)))) return 'NO_DAEMON';
  return 'ENGINE_UNREACHABLE';
}

export const dockerName = /^[a-zA-Z0-9][a-zA-Z0-9_.+-]{0,127}$/;

export function dockerOverride(environment, key) {
  const values = [...new Set(Object.entries(environment).filter(([name, value]) => name.toUpperCase() === key && value).map(([, value]) => value))];
  if (values.length > 1) throw new Error('TARGET_OVERRIDE: conflicting environment key casing.');
  return values[0];
}

export function inspectDockerContext(context, run = probe, environment = process.env) {
  if (!dockerName.test(context ?? '')) throw new Error('CONTEXT_MISMATCH');
  const target = run('docker', ['--context', context, 'context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}'], { env: environment });
  if (probeCondition(target) !== 'AVAILABLE') throw new Error('CONTEXT_UNAVAILABLE');
  let endpoint;
  try { endpoint = JSON.parse(target.stdout); validateDockerEndpoint(endpoint); } catch { throw new Error('NON_LOCAL_CONTEXT'); }
  return endpoint;
}

export function dockerTarget(run = probe, environment = process.env, expectedContext) {
  if (['DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'BUILDKIT_HOST'].some(key => dockerOverride(environment, key))) throw new Error('TARGET_OVERRIDE: unsupported TLS or BuildKit target override.');
  const host = dockerOverride(environment, 'DOCKER_HOST');
  if (host) {
    try { validateDockerEndpoint(host); } catch { throw new Error('TARGET_OVERRIDE: only local sockets/pipes are supported.'); }
  }
  const configured = dockerOverride(environment, 'DOCKER_CONTEXT');
  if (expectedContext && configured && expectedContext !== configured) throw new Error('CONTEXT_MISMATCH');
  let context = expectedContext || configured;
  if (!context) {
    const selected = run('docker', ['context', 'show'], { env: environment });
    if (probeCondition(selected) !== 'AVAILABLE') throw new Error('CONTEXT_UNAVAILABLE');
    context = selected.stdout.trim();
  }
  const endpoint = inspectDockerContext(context, run, environment);
  if (host && host !== endpoint) throw new Error('TARGET_OVERRIDE: local host differs from inspected context.');
  return { context, endpoint };
}

const native = {
  docker: ['docker', ['--version']], compose: ['docker', ['compose', 'version']], buildx: ['docker', ['buildx', 'version']],
  git: ['git', ['--version']], gh: ['gh', ['--version']], node: [process.execPath, ['--version']],
  rg: ['rg', ['--version']], jq: ['jq', ['--version']], 'osv-scanner': ['osv-scanner', ['--version']],
  shellcheck: ['shellcheck', ['--version']], hadolint: ['hadolint', ['--version']], trivy: ['trivy', ['--version']],
  k6: ['k6', ['version']],
  postgresql: ['psql', ['--version']],
  typescript: [process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--version']],
  supabase: [process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), '--version']],
};

export function diagnose(entry, run = probe, platform = { os: process.platform, arch: process.arch }, environment = process.env) {
  const start = performance.now();
  const result = { id: entry.id, configured: true, installed: null, available: null, verified: false,
    documentationOnly: ['C', 'D'].includes(entry.tier), condition: 'NOT_APPLICABLE', probes: [] };
  function check(label, executable, args) {
    const response = run(executable, args, { env: environment });
    const condition = probeCondition(response);
    result.probes.push({ probe: label, condition, exitCode: response.status ?? null,
      errorCode: ['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ENOBUFS', 'UNKNOWN'].includes(response.error?.code) ? response.error.code : null });
    return response;
  }
  if (entry.tier === 'C' || entry.tier === 'D') return { ...result, elapsedMs: Math.round(performance.now() - start) };
  if (!['win32', 'linux'].includes(platform.os) || platform.arch !== 'x64') return { ...result, condition: 'UNSUPPORTED_PLATFORM', elapsedMs: 0 };
  let command = native[entry.id];
  if (['actionlint', 'gitleaks'].includes(entry.id)) command = [toolPath(entry.id), [entry.id === 'actionlint' ? '-version' : 'version']];
  if (tools[entry.id] && tools[entry.id].optional) {
    result.binaryPresent = existsSync(toolPath(entry.id));
    if (result.binaryPresent) command = [toolPath(entry.id), [entry.id === 'k6' ? 'version' : '--version']];
  }
  if (entry.id === 'npm') {
    const cli = environment.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
    command = [process.execPath, [cli, '--version']];
  }
  if (entry.id === 'repository-checks') {
    result.installed = Object.entries(manifest.devDependencies).every(([name, version]) => {
      const file = path.join(root, 'node_modules', name, 'package.json');
      return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).version === version;
    });
    return { ...result, available: result.installed, condition: result.installed ? 'CHECKS_NOT_RUN' : 'MISSING_DEPENDENCY', elapsedMs: Math.round(performance.now() - start) };
  }
  if (!command) throw new Error('No compiled-in probe for capability.');
  if (command[0] === process.execPath && command[1].length > 1 && !existsSync(command[1][0])) {
    return { ...result, installed: false, available: false, condition: 'MISSING_DEPENDENCY', elapsedMs: Math.round(performance.now() - start) };
  }
  const version = check('version', ...command);
  result.condition = probeCondition(version);
  result.available = result.condition === 'AVAILABLE';
  result.installed = result.binaryPresent === true || result.available ? true : result.condition === 'MISSING_BINARY' ? false : null;
  if (result.available) result.version = String(version.stdout).match(/\b(?:v?\d+\.\d+(?:\.\d+)?(?:[-.][a-zA-Z0-9]+)*)\b/)?.[0] ?? 'UNPARSED';
  const pinnedVersion = ['typescript', 'supabase'].includes(entry.id) ? manifest.devDependencies[entry.id]
    : tools[entry.id] && (!tools[entry.id].optional || result.binaryPresent) ? tools[entry.id].version : undefined;
  if (result.available && ((entry.id === 'node' && !nodeVersionSupported(result.version))
    || (pinnedVersion && result.version.replace(/^v/, '') !== pinnedVersion))) {
    result.available = false; result.condition = 'VERSION_MISMATCH';
  }
  if (entry.id === 'trivy') {
    const metadata = path.join(root, '.cache/trivy/db/metadata.json');
    result.database = existsSync(metadata) ? 'PRESENT_NOT_VERIFIED: metadata only; freshness/scan not tested' : 'DATABASE_MISSING: project .cache/trivy/db';
    result.rules = 'NOT_RUN: use tools:trivy:smoke to test embedded checks';
    result.scan = 'NOT_RUN';
  }
  if (entry.id === 'postgresql') {
    result.hostNativeInstalled = result.installed;
    result.localStack = 'NOT_RUN: use tools:postgresql; requires canonical local ownership verification';
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
      result.condition = dockerEngineCondition(daemon, info);
      result.available = result.condition === 'AVAILABLE';
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
