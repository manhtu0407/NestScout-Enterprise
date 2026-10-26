import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { spec } from 'node:test/reporters';

// node:test exits 0 for skipped, todo and empty files, so registration alone does not prove execution.
// Exceptions are reviewed package.json entries: repositoryHygiene.testExceptions = [{ file, name, reason }].
// Each entry authorizes exactly one skipped or todo test or suite, so an ambiguous name cannot hide a second one.
const testFile = /\.(?:test|spec)\.mjs$/;

function loadExceptions(directory) {
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const entries = manifest.repositoryHygiene?.testExceptions ?? [];
  if (!Array.isArray(entries) || entries.some(entry => !entry || ['file', 'name', 'reason'].some(key => typeof entry[key] !== 'string' || !entry[key].trim()))) {
    throw new Error('repositoryHygiene.testExceptions entries need non-empty file, name and reason strings.');
  }
  const keys = entries.map(entry => JSON.stringify([entry.file, entry.name]));
  if (new Set(keys).size !== keys.length) throw new Error('repositoryHygiene.testExceptions must not repeat a file and name pair.');
  return entries;
}

export default async function* testIntegrityReporter(source) {
  const directory = process.cwd();
  const problems = [];
  const executed = new Map();
  const disabled = [];
  let exceptions = [];
  try { exceptions = loadExceptions(directory); } catch (error) { problems.push(error.message); }
  const expected = process.argv.filter(argument => testFile.test(argument)).map(argument => path.relative(directory, path.resolve(directory, argument)).split(path.sep).join('/'));

  async function* observed() {
    for await (const event of source) {
      const data = event.data;
      if ((event.type === 'test:pass' || event.type === 'test:fail') && data.file && ['test', 'suite'].includes(data.details?.type)) {
        const file = path.relative(directory, data.file).split(path.sep).join('/');
        const suite = data.details.type === 'suite';
        // A file that registers nothing is reported as one synthetic passing test named after itself.
        const placeholder = !suite && data.nesting === 0 && data.line === 1 && data.column === 1 && [data.file, file, path.basename(file)].includes(data.name);
        // A skipped or todo suite never runs its children, so only the suite event reveals the disabled tests.
        if (!placeholder && (data.skip || data.todo)) {
          disabled.push({ file, name: data.name, description: `${suite ? 'suite ' : ''}"${data.name}" was ${data.skip ? 'skipped' : 'marked todo'}` });
        } else if (!placeholder && !suite && event.type === 'test:pass') {
          executed.set(file, (executed.get(file) ?? 0) + 1);
        }
      }
      yield event;
    }
  }

  yield* Readable.from(observed()).compose(new spec());
  for (const file of expected) if (!executed.get(file)) problems.push(`${file}: no test executed to a passing result`);
  const matches = exceptions.map(() => 0);
  for (const item of disabled) {
    const index = exceptions.findIndex(entry => entry.file === item.file && entry.name === item.name);
    if (index < 0) problems.push(`${item.file}: ${item.description} without a documented exception`);
    else matches[index]++;
  }
  exceptions.forEach((entry, index) => {
    if (matches[index] > 1) problems.push(`${entry.file}: documented exception for "${entry.name}" is ambiguous; it matches ${matches[index]} skipped tests`);
    else if (expected.includes(entry.file) && !matches[index]) problems.push(`${entry.file}: documented exception for "${entry.name}" no longer matches a skipped test`);
  });
  // The runner script confirms from outside this process that the reporter finished and saw every requested file.
  if (process.env.NESTSCOUT_TEST_EVIDENCE) writeFileSync(process.env.NESTSCOUT_TEST_EVIDENCE, JSON.stringify(Object.fromEntries(executed)));
  if (problems.length) {
    process.exitCode = 1;
    yield `\nTest integrity violations:\n${problems.map(problem => `  - ${problem}`).join('\n')}\n`;
  }
}
