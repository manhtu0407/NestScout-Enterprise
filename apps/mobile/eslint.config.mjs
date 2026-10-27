import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const workspaceRequire = createRequire(import.meta.url);
const expoConfigRequire = createRequire(workspaceRequire.resolve('eslint-config-expo/package.json'));

const redirects = new Map([
  ['typescript', workspaceRequire.resolve('typescript')],
  ['@typescript-eslint/parser', expoConfigRequire.resolve('@typescript-eslint/parser')],
  ['eslint-import-resolver-typescript', expoConfigRequire.resolve('eslint-import-resolver-typescript')],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = redirects.get(specifier);
    if (target) return { url: pathToFileURL(target).href, format: 'commonjs', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { default: expoConfig } = await import('eslint-config-expo/flat.js');

export default [...expoConfig, { ignores: ['node_modules/**', '.expo/**', 'dist/**'] }];
