import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
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
  const directory = path.dirname(toolPath(name));
  await mkdir(directory, { recursive: true });
  if (tool.format === 'binary') await writeFile(toolPath(name), bytes);
  else {
    const archive = path.join(directory, asset.asset);
    await writeFile(archive, bytes);
    execFileSync('tar', ['-xf', archive, '-C', directory, ...(asset.stripComponents ? ['--strip-components', String(asset.stripComponents)] : [])], { stdio: 'inherit' });
  }
  if (process.platform !== 'win32') await chmod(toolPath(name), 0o755);
  console.log(`${name} ${tool.version}: SHA-256 verified; files installed. Use tools:doctor to verify execution.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [name, tool] of selectTools(process.argv.slice(2))) await installTool(name, tool);
}
