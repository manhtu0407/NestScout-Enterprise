import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { parseDocument } from 'yaml';
import { root, toolPath } from './tool-path.mjs';
import { scanStaged } from './scan-staged.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'nestscout-negative-'));
function mustReject(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 1, `${label} should reject its invalid fixture.`);
  console.log(`PASS: ${label} rejected an invalid fixture.`);
  return result;
}
try {
  const markdown = path.join(directory, 'bad.md');
  writeFileSync(markdown, '# First\n\n# Second\n');
  mustReject(process.execPath, [path.join(root, 'node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs'), '--config', path.join(root, '.markdownlint-cli2.jsonc'), markdown], 'Markdown lint');
  const yaml = parseDocument('name: first\nname: duplicate\n', { uniqueKeys: true });
  assert.ok(yaml.errors.length, 'Duplicate YAML keys should fail.');
  console.log('PASS: YAML parser rejected duplicate keys.');
  const workflow = path.join(directory, 'invalid.yml');
  writeFileSync(workflow, 'name: Invalid\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n        unknown-property: invalid\n');
  mustReject(toolPath('actionlint'), ['-shellcheck=', '-pyflakes=', workflow], 'Actionlint');
  // Random synthetic shape only. No real credential is used or printed.
  const token = ['gh', 'p_'].join('') + randomBytes(27).toString('base64url');
  writeFileSync(path.join(directory, 'synthetic.txt'), `token=${token}\n`);
  const result = mustReject(toolPath('gitleaks'), ['dir', '--redact', '--no-banner', directory], 'Gitleaks');
  assert.ok(!(result.stdout + result.stderr).includes(token), 'Secret output must be redacted.');
  console.log('PASS: scanner output did not disclose the synthetic credential.');
  const stagedRepo = path.join(directory, 'staged-regression');
  mkdirSync(stagedRepo);
  const git = args => execFileSync('git', args, { cwd: stagedRepo, stdio: 'pipe' });
  git(['init', '--quiet']);
  writeFileSync(path.join(stagedRepo, 'example.txt'), 'clean\n');
  git(['add', 'example.txt']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'clean baseline']);
  writeFileSync(path.join(stagedRepo, 'example.txt'), `token=${token}\n`);
  git(['add', 'example.txt']);
  writeFileSync(path.join(stagedRepo, 'example.txt'), 'clean again\n');
  assert.throws(() => scanStaged(stagedRepo, 'pipe'), error => error.status === 1 && !(String(error.stdout) + String(error.stderr)).includes(token));
  console.log('PASS: staged secret rejected even when working file is clean.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
