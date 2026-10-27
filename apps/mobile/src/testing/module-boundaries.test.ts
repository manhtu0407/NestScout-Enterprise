import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '..');
const features = ['access', 'client', 'worker', 'shared'] as const;
type Feature = (typeof features)[number];

// Which other features each feature may import (through its public index only).
const allowed: Record<Feature, Feature[]> = {
  access: ['shared'],
  client: ['access', 'shared'],
  worker: ['access', 'shared'],
  shared: [],
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '');
}

function owner(file: string): Feature | 'app' | 'other' {
  const relative = path.relative(src, file).split(path.sep);
  if (relative[0] === 'app') return 'app';
  if (relative[0] === 'features' && features.includes(relative[1] as Feature)) return relative[1] as Feature;
  return 'other';
}

function targetFeature(file: string, specifier: string): { feature: Feature; deep: boolean } | null {
  const resolved = specifier.startsWith('@/') ? path.join(src, specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : null;
  if (!resolved) return null;
  const relative = path.relative(src, resolved).split(path.sep);
  if (relative[0] !== 'features' || !features.includes(relative[1] as Feature)) return null;
  return { feature: relative[1] as Feature, deep: relative.length > 2 };
}

describe('module ownership', () => {
  const files = sourceFiles(src);

  test('features depend only on permitted features, never on each other cyclically', () => {
    const violations: string[] = [];
    for (const file of files) {
      const from = owner(file);
      if (from === 'app' || from === 'other') continue;
      for (const specifier of imports(file)) {
        const target = targetFeature(file, specifier);
        if (target && target.feature !== from && !allowed[from].includes(target.feature)) {
          violations.push(`${path.relative(src, file)} imports ${target.feature}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('other features and routes import a feature only through its public index', () => {
    const violations: string[] = [];
    for (const file of files) {
      const from = owner(file);
      for (const specifier of imports(file)) {
        const target = targetFeature(file, specifier);
        if (target && target.feature !== from && target.deep) violations.push(`${path.relative(src, file)} -> ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('route files stay thin: a default export of one feature component', () => {
    const routes = files.filter((file) => owner(file) === 'app' && !file.endsWith('_layout.tsx'));
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      const text = readFileSync(file, 'utf8');
      expect(text.split('\n').length).toBeLessThanOrEqual(6);
      expect(text).toMatch(/export default \w+;/);
      expect(text).not.toMatch(/supabase|useState|useEffect/);
    }
  });

  test('only the shared Supabase module and access composition touch the Supabase client', () => {
    const touching = files
      .filter((file) => imports(file).some((specifier) => specifier.startsWith('@supabase/')))
      .map((file) => path.relative(src, file).split(path.sep).join('/'))
      .sort();
    expect(touching).toEqual([
      'features/access/auth/auth-errors.ts',
      'features/access/auth/supabase-auth-gateway.ts',
      'features/access/capability/capability-repository.ts',
      'lib/supabase-client.ts',
    ]);
  });

  test('the bundle contains no privileged key names', () => {
    const offenders = files.filter((file) => /service_role|SERVICE_ROLE|sb_secret_/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => path.relative(src, file).split(path.sep).join('/'))).toEqual(['lib/config.ts']);
  });
});
