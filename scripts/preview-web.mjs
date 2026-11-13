import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { localRuntime } from './supabase-local.mjs';
import { root } from './tool-path.mjs';

export const previews = {
  local: { port: 8085 },
  design: { port: 8086 },
};

export function previewEnvironment(mode, source, readLocalStack = () => {
  const runtime = localRuntime();
  return { origin: runtime.verify().endpoints['rest.http'].url.replace(/\/$/, ''), key: runtime.status().env.PUBLISHABLE_KEY };
}) {
  if (!Object.hasOwn(previews, mode)) throw new Error(`Unknown preview "${mode}"; use ${Object.keys(previews).join(' or ')}.`);
  const base = { ...source, BROWSER: 'none', CI: '1' };
  if (mode === 'design') return { ...base, EXPO_PUBLIC_DESIGN_SHOWCASE: '1', EXPO_PUBLIC_HORIZON_PREVIEW: '1' };
  const { origin, key } = readLocalStack();
  if (!key?.startsWith('sb_publishable_')) throw new Error('The local publishable key is unavailable; run npm run db:start first.');
  return { ...base, EXPO_PUBLIC_NESTSCOUT_TARGET: 'local', EXPO_PUBLIC_SUPABASE_URL: origin, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2] ?? 'local';
  const env = previewEnvironment(mode, process.env);
  const child = spawn('npm', ['run', 'start', '--workspace', 'apps/mobile', '--', '--web', '--localhost', '--clear', '--port', String(previews[mode].port)], {
    cwd: root, env, stdio: 'inherit', shell: true,
  });
  child.on('exit', code => process.exit(code ?? 1));
}
