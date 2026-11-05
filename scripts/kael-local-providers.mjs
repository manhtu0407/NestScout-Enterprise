import { execFileSync } from 'node:child_process';
import { closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const settings = {
  DEEPSEEK_API_KEY: /^[A-Za-z0-9_-]+$/,
  ANTHROPIC_API_KEY: /^[A-Za-z0-9_-]+$/,
  KAEL_ANTHROPIC_MODEL: /^claude-[A-Za-z0-9._-]{1,72}$/,
  KAEL_MODEL_ROUTE: /^(deepseek|anthropic|deepseek,anthropic|anthropic,deepseek)$/,
};
const maxBytes = 4096;
const windowsPrivateAcl = Buffer.from(`
  $ErrorActionPreference = 'Stop'
  $sidType = [System.Security.Principal.SecurityIdentifier]
  $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $trusted = @($userSid, 'S-1-5-18', 'S-1-5-32-544')
  foreach ($path in @($env:NESTSCOUT_PROVIDER_DIRECTORY, $env:NESTSCOUT_PROVIDER_FILE)) {
    $acl = Get-Acl -LiteralPath $path
    if ($acl.GetOwner($sidType).Value -ne $userSid) { exit 1 }
    $allow = @($acl.GetAccessRules($true, $true, $sidType) | Where-Object { $_.AccessControlType -eq 'Allow' })
    if ($allow.Count -eq 0) { exit 1 }
    foreach ($rule in $allow) {
      if ($rule.IdentityReference.Value -notin $trusted) { exit 1 }
    }
  }
`, 'utf16le').toString('base64');

export function parseLocalProviders(contents) {
  const env = {};
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^([A-Z_]+)=(.+)$/.exec(line);
    if (!match) return null;
    const [, name, value] = match;
    if (!Object.hasOwn(settings, name) || Object.hasOwn(env, name) || !settings[name].test(value)) return null;
    env[name] = value;
  }
  return env;
}

export function discoverLocalProviders(home = os.homedir()) {
  const directory = path.join(home, '.codex', 'private', 'kael-server');
  const file = path.join(directory, 'providers.env');
  const rejected = status => ({ status, env: {} });
  let metadata;
  try {
    metadata = lstatSync(file, { throwIfNoEntry: false });
    if (!metadata) return rejected('credential_missing');
    const folder = lstatSync(directory);
    const expectedDirectory = path.join(realpathSync(home), '.codex', 'private', 'kael-server');
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > maxBytes || !folder.isDirectory()
      || path.relative(expectedDirectory, realpathSync(directory))) {
      return rejected('source_invalid');
    }
    if (process.platform === 'win32') {
      execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', windowsPrivateAcl], {
          env: { SystemRoot: process.env.SystemRoot, NESTSCOUT_PROVIDER_DIRECTORY: directory, NESTSCOUT_PROVIDER_FILE: file },
          stdio: 'ignore', windowsHide: true, timeout: 10_000,
        });
    } else if (![folder, metadata].every(item => item.uid === process.getuid() && (item.mode & 0o077) === 0)) {
      return rejected('source_inaccessible');
    }
    const fd = openSync(file, 'r');
    let env;
    try {
      const opened = fstatSync(fd);
      if (opened.dev !== metadata.dev || opened.ino !== metadata.ino || opened.nlink !== 1) return rejected('source_invalid');
      const bytes = Buffer.alloc(maxBytes + 1);
      const length = readSync(fd, bytes);
      if (length > maxBytes || length !== opened.size) return rejected('source_invalid');
      env = parseLocalProviders(bytes.toString('utf8', 0, length));
    } finally {
      closeSync(fd);
    }
    if (!env) return rejected('source_invalid');
    if (!env.DEEPSEEK_API_KEY && !env.ANTHROPIC_API_KEY) return rejected('credential_missing');
    return { status: 'source_loaded', env };
  } catch {
    return rejected('source_inaccessible');
  }
}

export function providerSourceReport({ status, env }) {
  return { source: status, deepseek: env.DEEPSEEK_API_KEY ? 'present' : 'absent',
    anthropic: env.ANTHROPIC_API_KEY ? 'present' : 'absent', paid_probe: 'not_run' };
}
