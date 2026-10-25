import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const tools = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8'));
export function tarPath(platform = process.platform, systemRoot = process.env.SystemRoot) {
  if (platform !== 'win32') return 'tar';
  if (!path.win32.isAbsolute(systemRoot ?? '')) throw new Error('Missing absolute Windows system root for native archive tooling.');
  return path.win32.join(systemRoot, 'System32', 'tar.exe');
}

export function toolPath(name) {
  const tool = tools[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return path.join(root, '.cache', 'tools', `${name}-${tool.version}`, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
}
