import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { root, tools, toolPath } from './tool-path.mjs';

if (process.arch !== 'x64' || !['win32', 'linux'].includes(process.platform)) {
  throw new Error('Pinned binaries support Windows/Linux x64 only. Add verified hashes before supporting another platform.');
}
for (const [name, tool] of Object.entries(tools)) {
  const asset = tool[process.platform];
  const url = `https://github.com/${tool.repository}/releases/download/v${tool.version}/${asset.asset}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed: ${name} HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`Checksum mismatch: ${name}; refusing to extract or execute.`);
  }
  const directory = path.dirname(toolPath(name));
  await mkdir(directory, { recursive: true });
  const archive = path.join(directory, asset.asset);
  await writeFile(archive, bytes);
  execFileSync('tar', ['-xf', archive, '-C', directory], { stdio: 'inherit' });
  if (process.platform !== 'win32') await chmod(toolPath(name), 0o755);
  console.log(`${name} ${tool.version}: SHA-256 verified and installed.`);
}
