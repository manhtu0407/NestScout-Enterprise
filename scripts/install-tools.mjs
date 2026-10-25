import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod, mkdtemp, rm, rename, realpath, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, tools, toolPath } from './tool-path.mjs';

export function selectTools(args, platform = process.platform, arch = process.arch) {
  if (arch !== 'x64' || !['win32', 'linux'].includes(platform)) {
    throw new Error('Pinned binaries support Windows/Linux x64 only. Add verified hashes before supporting another platform.');
  }
  if (args.length && (args.length !== 2 || args[0] !== '--tool' || !Object.hasOwn(tools, args[1]))) throw new Error('Use no arguments or --tool <pinned-tool-name>.');
  return Object.entries(tools).filter(([name, tool]) => args.length ? name === args[1] : !tool.optional);
}

export async function installTool(name, tool, download = fetch) {
  const asset = tool[process.platform];
  const url = `https://github.com/${tool.repository}/releases/download/${tool.tagPrefix ?? 'v'}${tool.version}/${asset.asset}`;
  const response = await download(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed: ${name} HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`Checksum mismatch: ${name}; refusing to extract or execute.`);
  }
  const staging = await mkdtemp(path.join(tmpdir(), 'nestscout-tool-install-'));
  try {
    let binary = bytes;
    if (tool.format !== 'binary') {
      const archive = path.join(staging, 'download');
      await writeFile(archive, bytes);
      const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim().split(/\r?\n/);
      const detail = execFileSync('tar', ['-tvf', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
      validateArchive(entries, detail);
      const expected = asset.binary ?? `${name}${process.platform === 'win32' ? '.exe' : ''}`;
      const candidates = entries.filter(entry => entry.replace(/^\.\//, '').split('/').slice(asset.stripComponents ?? 0).join('/') === expected);
      if (candidates.length !== 1) throw new Error('Archive must contain exactly one expected binary.');
      binary = execFileSync('tar', ['-xOf', archive, '--', candidates[0]], { maxBuffer: 256 * 1024 * 1024 });
    }
    validateBinary(binary);
    const directory = path.dirname(toolPath(name));
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.install-${path.basename(staging)}`);
    try {
      await writeFile(temporary, binary, { flag: 'wx' });
      if (process.platform !== 'win32') await chmod(temporary, 0o755);
      await rename(temporary, toolPath(name));
    } finally { await rm(temporary, { force: true }); }
  } finally {
    if (path.dirname(await realpath(staging)) !== await realpath(tmpdir()) || (await lstat(staging)).isSymbolicLink()) throw new Error('Unsafe installation temporary root.');
    await rm(staging, { recursive: true });
  }
  console.log(`${name} ${tool.version}: SHA-256 verified; files installed. Use tools:doctor to verify execution.`);
}

export function validateArchive(entries, detail) {
  if (!entries.length || new Set(entries).size !== entries.length
    || entries.some(entry => !entry || /[\\:\x00-\x1f]/.test(entry) || entry.startsWith('/')
      || entry.split('/').includes('..'))
    || detail.trim().split(/\r?\n/).some(line => !/^[-d]/.test(line))) {
    throw new Error('Unsafe archive path, duplicate, link or special entry.');
  }
}

export function validateBinary(bytes, platform = process.platform) {
  const magic = platform === 'win32' ? Buffer.from('MZ') : Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
  if (bytes.length < 64 || !bytes.subarray(0, magic.length).equals(magic)) throw new Error('Unexpected native executable header.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [name, tool] of selectTools(process.argv.slice(2))) await installTool(name, tool);
}
