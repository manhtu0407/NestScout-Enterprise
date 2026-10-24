import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const tools = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8'));
export function toolPath(name) {
  const tool = tools[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return path.join(root, '.cache', 'tools', `${name}-${tool.version}`, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
}
