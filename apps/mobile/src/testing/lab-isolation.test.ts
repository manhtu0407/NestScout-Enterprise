import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(__dirname, '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(?:ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const labMarkers = [/showcase\//, /kael-lab/i, /KAEL_AGENTIC_LAB/, /labSpaceKey/, /createLabRuntime/, /KaelAgenticLab/];

test('real application code never imports or references the Kael design lab', () => {
  const offenders = ['features', 'lib', 'theme']
    .flatMap(directory => sourceFiles(path.join(src, directory)))
    .filter(file => labMarkers.some(marker => marker.test(readFileSync(file, 'utf8'))))
    .map(file => path.relative(src, file));
  expect(offenders).toEqual([]);
});

test('the authenticated route tree has no lab entry point and only the existing preview flags gate showcases', () => {
  const layout = readFileSync(path.join(src, 'app', '_layout.tsx'), 'utf8');
  expect(layout).not.toMatch(/KAEL_AGENTIC_LAB|KaelAgenticLab/);
  const otherRoutes = sourceFiles(path.join(src, 'app')).filter(file => path.basename(file) !== '_layout.tsx');
  expect(otherRoutes.filter(file => /showcase|kael-lab/i.test(readFileSync(file, 'utf8')))).toEqual([]);
});

test('the Kael runtime path connects the conversation hook to the real transport only', () => {
  const hook = readFileSync(path.join(src, 'features/horizon/use-kael-conversation.ts'), 'utf8');
  expect(hook).toMatch(/streamKaelTurn/);
  expect(hook).toMatch(/loadKaelConversation/);
  const entry = readFileSync(path.join(src, 'features/horizon/horizon-entry.tsx'), 'utf8');
  expect(entry).toMatch(/useKaelConversation\(/);
  expect(entry).toMatch(/processingTaskId=\{kael\.processingTaskId\}/);
});
