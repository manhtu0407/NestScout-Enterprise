import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync, lstatSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateCapabilities, checkCapabilities } from './tool-library.mjs';
import { diagnose, doctorExitCode, dockerTarget, probe, probeCondition, nodeVersionSupported, discoveryEnvironment, dockerEngineCondition } from './tool-doctor.mjs';
import { smoke, assertOwned, assertBuilder } from './tool-smoke.mjs';
import { selectTools, installTool } from './install-tools.mjs';
import { root, tools, toolPath } from './tool-path.mjs';
import { git } from './repository-files.mjs';

const entry = { id: 'docker', name: 'Docker', tier: 'A', documentation: 'docs/tool-library/docker.md',
  officialReference: 'https://docs.docker.com/reference/cli/docker/', versionSource: 'host version', canonicalScripts: ['tools:doctor'] };
const manifest = { scripts: { 'tools:doctor': 'node scripts/tool-doctor.mjs' } };
const valid = () => ({ schemaVersion: 1, capabilities: [structuredClone(entry)] });
const documents = () => new Map([[entry.documentation, '# Docker\n']]);
const ok = stdout => ({ status: 0, stdout, stderr: '', signal: null });

test('catalog accepts valid references and rejects malformed, traversal, duplicate, missing and injection metadata', () => {
  assert.equal(validateCapabilities(valid(), manifest, documents()).length, 1);
  for (const change of [
    item => { item.id = '../docker'; }, item => { item.id = 'docker; echo unsafe'; },
    item => { item.documentation = '../outside.md'; }, item => { item.documentation = 'docs/tool-library/../outside.md'; },
    item => { item.documentation = 'docs/tool-library/missing.md'; }, item => { item.documentation = '/absolute.md'; },
    item => { item.canonicalScripts = ['missing']; }, item => { item.canonicalScripts = ['tools:doctor; echo unsafe']; },
    item => { item.officialReference = 'file:///secret'; }, item => { item.officialReference = 'https://user:password@example.invalid'; },
    item => { item.version = 'duplicate-pin'; }, item => { item.command = 'touch sentinel'; },
    item => { item.executionClass = 'READ_ONLY_DISCOVERY'; },
    item => { item.tier = 'unknown'; }, item => { item.canonicalScripts = 'tools:doctor'; },
  ]) {
    const catalog = valid(); change(catalog.capabilities[0]);
    assert.throws(() => validateCapabilities(catalog, manifest, documents()));
  }
  assert.throws(() => validateCapabilities({ ...valid(), schemaVersion: 2 }, manifest, documents()));
  assert.throws(() => validateCapabilities({ schemaVersion: 1, capabilities: [entry, entry] }, manifest, documents()));
  assert.throws(() => validateCapabilities({ schemaVersion: 1, capabilities: [] }, manifest, documents()));
  assert.throws(() => validateCapabilities(null, manifest, documents()));
});

test('catalog checks the staged snapshot even when working metadata is repaired or deleted', () => {
  const repository = mkdtempSync(path.join(tmpdir(), 'nestscout-capabilities-'));
  const write = (file, content) => { mkdirSync(path.dirname(path.join(repository, file)), { recursive: true }); writeFileSync(path.join(repository, file), content); };
  try {
    git(repository, ['init', '--quiet']);
    write('package.json', JSON.stringify(manifest));
    write(entry.documentation, '# Docker\n');
    write('scripts/tool-capabilities.json', JSON.stringify(valid()));
    git(repository, ['add', '--', 'package.json', entry.documentation, 'scripts/tool-capabilities.json']);
    checkCapabilities(repository);
    const invalid = valid(); invalid.capabilities[0].canonicalScripts = ['missing'];
    write('scripts/tool-capabilities.json', JSON.stringify(invalid));
    git(repository, ['add', '--', 'scripts/tool-capabilities.json']);
    write('scripts/tool-capabilities.json', JSON.stringify(valid()));
    assert.throws(() => checkCapabilities(repository), /canonical npm script/);
    rmSync(path.join(repository, 'scripts/tool-capabilities.json'));
    assert.throws(() => checkCapabilities(repository), /canonical npm script/);
  } finally {
    assert.equal(path.dirname(realpathSync(repository)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(repository).isSymbolicLink());
    rmSync(repository, { recursive: true });
  }
});

test('all foundation and optional capabilities remain discoverable without executable pins in catalog', () => {
  const catalog = JSON.parse(readFileSync(path.join(root, 'scripts/tool-capabilities.json')));
  for (const id of ['docker', 'compose', 'buildx', 'git', 'gh', 'node', 'npm', 'typescript', 'rg', 'supabase', 'gitleaks', 'actionlint', 'repository-checks', 'jq', 'osv-scanner', 'shellcheck', 'hadolint', 'trivy', 'postgresql']) {
    assert.ok(catalog.capabilities.some(item => item.id === id));
  }
  for (const id of Object.keys(tools)) assert.equal(catalog.capabilities.find(item => item.id === id).versionSource, 'scripts/tools.json via scripts/tool-path.mjs');
  const scripts = JSON.parse(readFileSync(path.join(root, 'package.json'))).scripts;
  assert.ok(scripts.check.split(' && ').includes('npm run check:capabilities'));
  assert.ok(scripts['verify:negative'].endsWith(' scripts/tool-library.test.mjs'));
});

function dockerFixture({ daemon = true, failStart = false, wrongOwner = false, remoteBuilder = false } = {}) {
  const calls = [];
  let owner;
  let created = false;
  let composed = false;
  let built = false;
  const source = `sha256:${'b'.repeat(64)}`;
  const builtId = `sha256:${'c'.repeat(64)}`;
  const id = 'a'.repeat(64);
  const removed = [];
  const run = (executable, original, options) => {
    calls.push({ executable, args: original, options });
    const args = original[0] === '--context' ? original.slice(2) : original;
    if (args[0] === '--version') return ok('Docker version 29.9.2');
    if (args.join(' ') === 'context show') return ok('desktop-linux');
    if (args[0] === 'context') {
      if (args[2] === 'remote') return ok(JSON.stringify('ssh://remote'));
      return ok(JSON.stringify('npipe:////./pipe/dockerDesktopLinuxEngine'));
    }
    if (args[0] === 'version') return daemon ? ok('29.9.2') : { status: 1, stderr: 'connection refused' };
    if (args[0] === 'info') return daemon ? ok(args.at(-1) === '{{.OSType}}' ? 'linux' : JSON.stringify({ ID: 'fixture-engine-id', OSType: 'linux', MemTotal: 1024 ** 3, NCPU: 2 })) : { status: 1 };
    if (args[0] === 'compose') {
      if (args.includes('up')) { composed = true; return ok(''); }
      return ok(args.includes('--services') ? 'smoke' : 'Docker Compose version v5.6.1');
    }
    if (args[0] === 'buildx') {
      if (args[1] === 'version') return ok('v0.38.1');
      if (args[1] === 'inspect') return ok(`Driver: docker\nEndpoint: ${remoteBuilder ? 'remote' : 'desktop-linux'}\nStatus: running\n`);
      owner = args[args.indexOf('--tag') + 1].split(':')[0]; built = true;
      return ok('');
    }
    if (args[1] === 'create') {
      owner = args[args.indexOf('--name') + 1]; created = true; return ok(id);
    }
    if (args[1] === 'start') return failStart ? { status: 1 } : ok('nestscout-tool-smoke');
    if (args[1] === 'logs') return ok('nestscout-tool-smoke');
    if (args[1] === 'inspect') {
      if (args[0] === 'image' && args[2] === source) {
        if (args.at(-1).includes('.Config.Labels') || args.at(-1).includes('.Config.Volumes')) return { status: 1 };
        return ok(JSON.stringify({ Id: source, Os: 'linux', Config: {} }));
      }
      const isCompose = args[2] === `${owner}-compose` || args[2] === 'd'.repeat(64);
      const objectOwner = isCompose ? `${owner}-compose` : owner;
      return ok(JSON.stringify({ Id: args[0] === 'image' ? builtId : isCompose ? 'd'.repeat(64) : id, Name: `/${objectOwner}`,
        Config: { Labels: { 'nestscout.tool-smoke': wrongOwner ? 'another-task' : objectOwner } }, State: { Running: false, ExitCode: 0 } }));
    }
    if (args[1] === 'ls') return ok(`another-task\n${args[0] === 'container' && created ? owner : args[0] === 'image' && built ? owner + ':local' : ''}\n${args[0] === 'container' && composed ? owner + '-compose' : ''}`);
    if (args[1] === 'rm') { removed.push(args); return ok(''); }
    throw new Error('Unexpected fixture command');
  };
  return { run, calls, source, removed };
}

test('doctor separates client, daemon, plugins, authentication and optional absence', () => {
  const fixture = dockerFixture({ daemon: false });
  const engine = diagnose(entry, fixture.run, { os: 'win32', arch: 'x64' }, {});
  assert.equal(engine.installed, true); assert.equal(engine.available, false); assert.equal(engine.condition, 'NO_DAEMON');
  for (const id of ['compose', 'buildx']) assert.equal(diagnose({ ...entry, id }, fixture.run, { os: 'win32', arch: 'x64' }, {}).available, true);
  const missing = () => ({ error: { code: 'ENOENT' }, status: null });
  const optional = diagnose({ ...entry, id: 'jq', tier: 'B' }, missing, { os: 'win32', arch: 'x64' }, {});
  assert.equal(optional.condition, 'MISSING_BINARY'); assert.equal(optional.configured, true); assert.equal(optional.verified, false);
  assert.equal(doctorExitCode([{ ...entry, id: 'jq', tier: 'B' }], [optional]), 0);
  assert.equal(doctorExitCode([{ ...entry, id: 'jq', tier: 'B' }], [{ ...optional, condition: 'PROBE_FAILED' }]), 1);
  assert.equal(doctorExitCode([entry], [engine]), 1);
  assert.equal(diagnose(entry, missing, { os: 'darwin', arch: 'arm64' }, {}).condition, 'UNSUPPORTED_PLATFORM');
  const auth = diagnose({ ...entry, id: 'gh' }, (_exe, args) => args[0] === '--version' ? ok('gh version 2.0.0') : { status: 1 }, { os: 'win32', arch: 'x64' }, {});
  assert.equal(auth.condition, 'AUTH_BLOCKED');
  assert.equal(probeCondition({ error: { code: 'ETIMEDOUT' } }), 'TIMEOUT');
  assert.equal(probeCondition({ status: 0, signal: 'SIGTERM' }), 'PROBE_FAILED');
});

test('native probe arguments are never shell evaluated and subprocess output is not disclosed by doctor', () => {
  const response = probe(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', '; $() `echo unsafe`']);
  assert.equal(response.stdout, '; $() `echo unsafe`');
  const result = diagnose({ ...entry, id: 'git' }, () => ok('git version 2.0.0 token=private-value'), { os: 'win32', arch: 'x64' }, {});
  assert.ok(!JSON.stringify(result).includes('private-value'));
  assert.equal(result.version, '2.0.0');
  assert.equal(nodeVersionSupported('v24.1.0', '>=24 <25'), true);
  assert.equal(nodeVersionSupported('v25.1.0', '>=24 <25'), false);
  assert.equal(nodeVersionSupported('v30.1.0', '>=30 <31'), true);
  assert.throws(() => nodeVersionSupported('v24.1.0', '^24'), /engines range/);
  const mismatchedPin = diagnose({ ...entry, id: 'actionlint' }, () => ok('actionlint 0.0.1'), { os: 'win32', arch: 'x64' }, {});
  assert.equal(mismatchedPin.installed, true);
  assert.equal(mismatchedPin.available, false);
  assert.equal(mismatchedPin.condition, 'VERSION_MISMATCH');
});

test('Docker targets reject remote, malformed, override and unexpected contexts before mutation', () => {
  const fixture = dockerFixture();
  assert.equal(dockerTarget(fixture.run, {}, 'desktop-linux').context, 'desktop-linux');
  assert.throws(() => dockerTarget(fixture.run, { DOCKER_HOST: 'tcp://remote:2375' }), /TARGET_OVERRIDE/);
  assert.throws(() => dockerTarget(fixture.run, { BUILDKIT_HOST: 'tcp://remote' }), /TARGET_OVERRIDE/);
  assert.throws(() => dockerTarget(fixture.run, { DOCKER_CONTEXT: 'desktop-linux' }, 'default'), /CONTEXT_MISMATCH/);
  assert.equal(dockerTarget(fixture.run, {}, 'default').context, 'default');
  for (const endpoint of ['tcp://127.0.0.1:2375', 'ssh://remote', 'tcp://remote:2375', 'garbage']) {
    const run = (exe, args) => args.includes('context') && args.includes('inspect') ? ok(JSON.stringify(endpoint)) : fixture.run(exe, args);
    assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, run, environment: {} }), /NON_LOCAL_CONTEXT/);
  }
  const target = { context: 'desktop-linux', endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine' };
  assert.throws(() => assertBuilder('Driver: docker-container\nEndpoint: desktop-linux\nStatus: running', target), /NON_LOCAL_BUILDER/);
  assert.throws(() => assertBuilder('Driver: docker\nEndpoint: remote\nStatus: running', target), /NON_LOCAL_BUILDER/);
});

test('smoke is bounded, never pulls, removes only inspected owned IDs, and preserves failure after cleanup', () => {
  for (const failStart of [false, true]) {
    const fixture = dockerFixture({ failStart });
    const operation = () => smoke({ context: 'desktop-linux', image: fixture.source, run: fixture.run, environment: {}, hostMemory: 1024 ** 3 });
    if (failStart) assert.throws(operation, /DOCKER_OPERATION_FAILED/);
    else assert.equal(operation().steps.length, 4);
    const create = fixture.calls.find(call => call.args.includes('create')).args;
    for (const flag of ['--read-only', '--pids-limit', '--memory', '--memory-swap', '--cpus', '--cap-drop', '--security-opt', '--user']) assert.ok(create.includes(flag));
    assert.equal(create[create.indexOf('--network') + 1], 'none');
    assert.equal(create[create.indexOf('--pull') + 1], 'never');
    assert.equal(fixture.removed.length, failStart ? 2 : 3);
    assert.deepEqual(fixture.removed.map(args => args.at(-1)), ['a'.repeat(64), ...(failStart ? [] : ['d'.repeat(64)]), `sha256:${'c'.repeat(64)}`]);
    assert.ok(!fixture.calls.some(call => call.args.includes('prune') || call.args.includes('volume') || call.args.includes('pull')));
    assert.ok(fixture.calls.filter(call => call.args.includes('rm')).every(call => call.args[0] === '--context'));
  }
});

test('smoke rejects ownership mismatch, remote builder, missing resources and unsafe image arguments', () => {
  assert.throws(() => assertOwned({ Id: 'id', Config: { Labels: {} } }, 'owner', 'id', 'image'), /OWNERSHIP_MISMATCH/);
  for (const flags of [{ wrongOwner: true }, { remoteBuilder: true }]) {
    const fixture = dockerFixture(flags);
    assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, run: fixture.run, environment: {}, hostMemory: 1024 ** 3 }));
    assert.equal(fixture.removed.length, 0);
  }
  const fixture = dockerFixture();
  assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, run: fixture.run, environment: {}, hostMemory: 1 }), /RESOURCE_BLOCKED/);
  assert.throws(() => smoke({ context: 'desktop-linux', image: 'alpine:latest; echo unsafe', run: fixture.run }), /immutable/);
  assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, run: fixture.run, platform: 'darwin' }), /UNSUPPORTED_PLATFORM/);
});

test('absent Engine and context change stop mutation; failed create is cleaned only after ownership inspection', () => {
  const noDaemon = dockerFixture({ daemon: false });
  assert.throws(() => smoke({ context: 'desktop-linux', image: noDaemon.source, run: noDaemon.run, environment: {}, hostMemory: 1024 ** 3 }), /ENGINE_INFO_UNAVAILABLE/);
  assert.ok(!noDaemon.calls.some(call => call.args.includes('create') || call.args.includes('up')));
  for (const condition of ['timeout', 'inspection', 'context']) {
    const fixture = dockerFixture();
    let attempted = false;
    const run = (exe, args, options) => {
      if (condition === 'context' && attempted && args.includes('context') && args.includes('inspect')) return ok(JSON.stringify('npipe:////./pipe/anotherEngine'));
      if (condition === 'inspection' && attempted && args.includes('inspect') && args.includes('container')) return { status: 1 };
      const result = fixture.run(exe, args, options);
      if (args.includes('create')) {
        attempted = true;
        if (condition === 'timeout') return { error: { code: 'ETIMEDOUT' }, status: null };
      }
      return result;
    };
    assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, run, environment: {}, hostMemory: 1024 ** 3 }));
    if (condition === 'timeout') assert.equal(fixture.removed.filter(args => args[0] === 'container').length, 1);
    else assert.equal(fixture.removed.filter(args => args[0] === 'container').length, 0);
  }
});

test('installer keeps default mandatory pins, optional selection, hashes and platform boundary', () => {
  assert.deepEqual(selectTools([], 'win32', 'x64').map(([name]) => name), ['actionlint', 'gitleaks']);
  assert.equal(selectTools(['--tool', 'osv-scanner'], 'linux', 'x64')[0][1].format, 'binary');
  for (const args of [['--tool', '../other'], ['--tool', 'osv-scanner; echo unsafe'], ['--tool'], ['--all']]) assert.throws(() => selectTools(args, 'win32', 'x64'));
  assert.throws(() => selectTools([], 'darwin', 'arm64'), /Windows\/Linux x64/);
  for (const tool of Object.values(tools)) for (const os of ['win32', 'linux']) assert.match(tool[os].sha256, /^[a-f0-9]{64}$/);
});

test('local context overrides, explicit non-current contexts and rootless sockets keep target identity', () => {
  for (const endpoint of ['unix:///var/run/docker.sock', 'unix:///run/user/1000/docker.sock', 'npipe:////./pipe/docker_engine']) {
    const fixture = dockerFixture();
    const run = (exe, args, options) => args.includes('context') && args.includes('inspect') ? ok(JSON.stringify(endpoint)) : fixture.run(exe, args, options);
    for (const context of ['default', 'desktop-linux', 'local+work']) {
      assert.deepEqual(dockerTarget(run, { DOCKER_CONTEXT: context, DOCKER_HOST: endpoint }, context), { context, endpoint });
      assert.equal(dockerTarget(run, {}, context).context, context);
    }
    assert.throws(() => dockerTarget(run, { DOCKER_HOST: 'unix:///another/socket' }, 'default'), /TARGET_OVERRIDE/);
    assert.throws(() => dockerTarget(run, { DOCKER_CONTEXT: 'default', docker_context: 'another' }), /TARGET_OVERRIDE/);
  }
  const fixture = dockerFixture();
  assert.throws(() => dockerTarget(fixture.run, {}, 'default; echo unsafe'), /CONTEXT_MISMATCH/);
  assert.throws(() => dockerTarget(fixture.run, { DOCKER_HOST: 'tcp://localhost:2375' }, 'default'), /TARGET_OVERRIDE/);
  assert.equal(fixture.calls.length, 0);
});

test('smoke accepts named embedded builders and same-Engine local aliases but rejects a different Engine', () => {
  for (const builderEndpoint of ['desktop-linux', 'default', 'unix:///var/run/docker.sock', 'local+alias']) {
    for (const matching of [true, false]) {
      const fixture = dockerFixture();
      const run = (exe, args, options) => {
        if (args[0] === '--host') {
          assert.ok(!Object.keys(options.env).some(name => /^(DOCKER_HOST|DOCKER_CONTEXT)$/i.test(name)));
          return ok(matching ? 'fixture-engine-id' : 'another-engine-id');
        }
        if (args.includes('context') && args.includes('inspect') && args.includes('local+alias')) return ok(JSON.stringify('unix:///run/user/1000/docker.sock'));
        if (args.includes('context') && args.includes('inspect') && args.includes('default')) return ok(JSON.stringify('npipe:////./pipe/docker_engine'));
        if (args.includes('buildx') && args.includes('inspect')) return ok(`Driver: docker\nEndpoint: ${builderEndpoint}\nStatus: running\n`);
        return fixture.run(exe, args, options);
      };
      const operation = () => smoke({ context: 'desktop-linux', image: fixture.source, builder: 'named-builder',
        environment: { DOCKER_CONTEXT: 'desktop-linux', BUILDX_BUILDER: 'named-builder' }, hostMemory: 1024 ** 3, run });
      if (matching || builderEndpoint === 'desktop-linux') {
        assert.equal(operation().status, 'PASS');
        const build = fixture.calls.find(call => call.args.includes('build'));
        assert.equal(build.args[build.args.indexOf('--builder') + 1], 'named-builder');
        assert.equal(build.args[1], ['default', 'local+alias'].includes(builderEndpoint) ? builderEndpoint : 'desktop-linux');
      } else {
        assert.throws(operation, /NON_LOCAL_BUILDER/);
        assert.equal(fixture.removed.length, 0);
        assert.ok(!fixture.calls.some(call => call.args.includes('create') || call.args.includes('build')));
      }
    }
  }
  const fixture = dockerFixture();
  assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, builder: 'named-builder', environment: { BUILDX_BUILDER: 'other-builder' }, run: fixture.run }), /BUILDER_MISMATCH/);
});

test('unprobed and unsupported capabilities do not assert missing installation; malformed Engine data cannot start smoke', () => {
  const fail = () => { throw new Error('Unexpected execution'); };
  for (const tier of ['C', 'D']) {
    const result = diagnose({ ...entry, tier }, fail);
    assert.equal(result.installed, null); assert.equal(result.available, null); assert.equal(result.documentationOnly, true);
  }
  const denied = diagnose({ ...entry, id: 'trivy', tier: 'B' }, () => ({ error: { code: 'EACCES' }, status: null }));
  assert.equal(denied.installed, null); assert.equal(denied.available, false);
  for (const malformed of [{ OSType: 'linux' }, { ID: 'fixture-engine-id', OSType: 'linux', MemTotal: 'unknown', NCPU: 2 }]) {
    const fixture = dockerFixture();
    const run = (exe, args, options) => args.includes('info') ? ok(JSON.stringify(malformed)) : fixture.run(exe, args, options);
    assert.throws(() => smoke({ context: 'desktop-linux', image: fixture.source, run, environment: {}, hostMemory: 1024 ** 3 }), /RESOURCE_OR_ENGINE_BLOCKED/);
    assert.ok(!fixture.calls.some(call => call.args.includes('create') || call.args.includes('build')));
  }
});

test('Engine access denial is distinct from a stopped daemon, timeout or unknown connection failure', () => {
  assert.equal(dockerEngineCondition(ok('version'), { status: 1, stderr: 'permission denied while connecting to the API' }), 'ENGINE_ACCESS_BLOCKED');
  assert.equal(dockerEngineCondition({ status: null, error: { code: 'EPERM' } }), 'ENGINE_ACCESS_BLOCKED');
  assert.equal(dockerEngineCondition({ status: 1, stderr: 'The system cannot find the file specified.' }), 'NO_DAEMON');
  assert.equal(dockerEngineCondition({ error: { code: 'ETIMEDOUT' } }), 'TIMEOUT');
  assert.equal(dockerEngineCondition({ status: 1, stderr: 'Unclassified native failure' }), 'ENGINE_UNREACHABLE');
  const fixture = dockerFixture();
  const run = (exe, args, options) => args.includes('version') && args.includes('{{.Server.Version}}')
    ? { status: 1, stderr: 'access is denied' } : fixture.run(exe, args, options);
  const result = diagnose(entry, run, { os: 'win32', arch: 'x64' }, {});
  assert.equal(result.installed, true); assert.equal(result.available, false); assert.equal(result.condition, 'ENGINE_ACCESS_BLOCKED');
});

test('checksum mismatch rejects optional installation before changing any existing binary or cache directory', async () => {
  const target = toolPath('jq');
  const before = existsSync(target) ? readFileSync(target) : null;
  const directoryExists = existsSync(path.dirname(target));
  let requested;
  const tool = structuredClone(tools.jq);
  tool[process.platform].sha256 = '0'.repeat(64);
  await assert.rejects(() => installTool('jq', tool, async url => {
    requested = url;
    return { ok: true, arrayBuffer: async () => Buffer.from('invalid archive') };
  }), /Checksum mismatch/);
  assert.equal(requested, `https://github.com/${tools.jq.repository}/releases/download/${tools.jq.tagPrefix}${tools.jq.version}/${tools.jq[process.platform].asset}`);
  assert.deepEqual(existsSync(target) ? readFileSync(target) : null, before);
  assert.equal(existsSync(path.dirname(target)), directoryExists);
});

test('read-only Supabase discovery suppresses telemetry and update-cache writes without changing parent settings', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-discovery-'));
  const source = { ...process.env, SUPABASE_HOME: directory, SUPABASE_TELEMETRY_DISABLED: '0', SUPABASE_NO_UPDATE_NOTIFIER: '0' };
  const before = { ...source };
  try {
    assert.equal(discoveryEnvironment({ ...source, GIT_DIR: 'other-repository' }).GIT_DIR, undefined);
    assert.equal(discoveryEnvironment(source).SUPABASE_TELEMETRY_DISABLED, '1');
    assert.equal(discoveryEnvironment(source).SUPABASE_NO_UPDATE_NOTIFIER, '1');
    assert.equal(discoveryEnvironment(source).GH_NO_UPDATE_NOTIFIER, '1');
    assert.equal(discoveryEnvironment(source).GH_NO_EXTENSION_UPDATE_NOTIFIER, '1');
    for (const args of [['--version'], ['--agent', 'no', 'db', 'diff', '--help']]) {
      const result = probe(process.execPath, [path.join(root, 'node_modules/supabase/dist/supabase.js'), ...args], { env: source });
      assert.equal(probeCondition(result), 'AVAILABLE', `Native discovery failed: ${probeCondition(result)}.`);
      if (args.includes('--help')) assert.match(result.stdout, /USAGE/);
      assert.deepEqual(readdirSync(directory), [], 'Discovery wrote global telemetry or an update cache.');
    }
    assert.deepEqual(source, before);
  } finally {
    assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
    assert.ok(!lstatSync(directory).isSymbolicLink());
    rmSync(directory, { recursive: true });
  }
});
