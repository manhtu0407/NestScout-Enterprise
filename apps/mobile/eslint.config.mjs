import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const workspaceRequire = createRequire(import.meta.url);
const expoConfigRequire = createRequire(workspaceRequire.resolve('eslint-config-expo/package.json'));

// The repository root pins the native-port TypeScript 7 for its own tooling,
// which exposes no JS compiler API. typescript-eslint needs the Expo SDK's
// TypeScript 6 from this workspace, and its parser and import resolver are
// nested under eslint-config-expo, so only this lint process redirects those.
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

// Imported after the hook is registered so typescript-eslint resolves TypeScript 6.
const { default: expoConfig } = await import('eslint-config-expo/flat.js');

export default [...expoConfig, { ignores: ['node_modules/**', '.expo/**', 'dist/**'] }];
