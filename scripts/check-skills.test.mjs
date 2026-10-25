import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkSkills } from './check-skills.mjs';
import { git } from './repository-files.mjs';
import { checkPath } from './check-hygiene.mjs';
import { root } from './tool-path.mjs';

const skill = '.agents/skills/example/SKILL.md';
const valid = '---\nname: example\ndescription: Review an explicitly requested example skill.\n---\n\n# Example\n\nUse for skill audits; exclude routine coding. Stop after reporting findings.\n';

function fixture(operation) {
  const repository = mkdtempSync(path.join(tmpdir(), 'nestscout-skills-'));
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(repository, file)), { recursive: true });
    writeFileSync(path.join(repository, file), content);
  };
  const run = (args, options) => git(repository, args, options);
  try {
    run(['init', '--quiet']);
    run(['config', 'core.autocrlf', 'false']);
    operation({ repository, write, run });
  } finally {
    assert.equal(path.dirname(realpathSync(repository)), realpathSync(tmpdir()));
    rmSync(repository, { recursive: true });
  }
}

test('both native roots accept minimal, portable optional fields and self anchors', () => {
  fixture(({ repository, write, run }) => {
    assert.deepEqual(checkSkills(repository), []);
    write(skill, valid.replace('---\n\n#', 'license: MIT\ncompatibility: Node 24\nmetadata:\n  source: internal\n---\n\n#') + '\n[Section](#example) and [file](SKILL.md#example).\n');
    write('.claude/skills/other/SKILL.md', valid.replace('name: example', 'name: other'));
    run(['add', '--', '.agents', '.claude']);
    assert.equal(checkSkills(repository).length, 4);
  });
});

for (const [label, transform] of [
  ['missing name', text => text.replace('name: example\n', '')],
  ['missing description', text => text.replace(/^description:.*\n/m, '')],
  ['empty description', text => text.replace(/^description:.*$/m, 'description: ""')],
  ['long description', text => text.replace(/^description:.*$/m, 'description: ' + 'a'.repeat(1025))],
  ['mapping description', text => text.replace(/^description:.*$/m, 'description: {unsafe: mapping}')],
  ['duplicate keys', text => text.replace('name: example', 'name: example\nname: example')],
  ['malformed YAML', text => text.replace('name: example', 'name: [')],
  ['missing opening delimiter', text => text.slice(4)],
  ['missing closing delimiter', text => text.replace('\n---\n\n#', '\n\n#')],
  ['empty body', text => text.slice(0, text.indexOf('\n\n#') + 1)],
  ['alias and anchor', text => text.replace('name: example', 'name: &identity example').replace(/^description:.*$/m, 'description: *identity')],
  ['explicit tag', text => text.replace('name: example', 'name: !!str example')],
  ['runtime authorization extension', text => text.replace('name: example', 'name: example\nallowed-tools: Bash')],
  ['runtime execution extension', text => text.replace('name: example', 'name: example\nhooks: {}')],
  ['invalid metadata', text => text.replace('name: example', 'name: example\nmetadata: {source: [nested]}')],
  ['long compatibility', text => text.replace('name: example', 'name: example\ncompatibility: ' + 'a'.repeat(501))],
  ['universal trigger', text => text.replace(/^description:.*$/m, 'description: Use on every task.')],
  ['CRLF', text => text.replaceAll('\n', '\r\n')],
  ['BOM', text => '\ufeff' + text],
  ['hidden prompt control', text => text + '\u202ehidden\n'],
  ['invalid UTF-8', text => Buffer.concat([Buffer.from(text), Buffer.from([0xff])])],
  ['missing final newline', text => text.trimEnd()],
  ['oversized body', text => text + 'line\n'.repeat(501)],
]) {
  test(`reject ${label} in working and index-only snapshots`, () => {
    fixture(({ repository, write, run }) => {
      write(skill, transform(valid));
      assert.throws(() => checkSkills(repository), /working|UTF-8/);
      run(['add', '--', skill]);
      rmSync(path.join(repository, skill));
      assert.throws(() => checkSkills(repository), /index|UTF-8/);
    });
  });
}

test('names reject mismatch, uppercase, double hyphens, length and reserved collisions', () => {
  for (const name of ['Example', 'bad--name', '-bad', 'bad-', 'a'.repeat(65), 'synced', 'anthropic-skills']) {
    fixture(({ repository, write }) => {
      write(`.agents/skills/${name}/SKILL.md`, valid.replace('name: example', `name: ${name}`));
      assert.throws(() => checkSkills(repository), /name|naming/);
    });
  }
  fixture(({ repository, write }) => {
    write(skill, valid.replace('name: example', 'name: other'));
    assert.throws(() => checkSkills(repository), /mismatched/);
  });
});

test('duplicate project names fail independently of personal runtime precedence', () => {
  fixture(({ repository, write, run }) => {
    write(skill, valid);
    write('.claude/skills/example/SKILL.md', valid);
    assert.throws(() => checkSkills(repository), /colliding/);
    run(['add', '--', '.agents', '.claude']);
    rmSync(path.join(repository, '.claude/skills/example/SKILL.md'));
    assert.throws(() => checkSkills(repository), /index.*colliding/);
  });
});

test('staged and working manifests cannot conceal each other or combine into one package', () => {
  fixture(({ repository, write, run }) => {
    write(skill, valid.replace('name: example\n', ''));
    run(['add', '--', skill]);
    write(skill, valid);
    assert.throws(() => checkSkills(repository), /index.*name/);
    run(['add', '--', skill]);
    write(skill, valid.replace('name: example\n', ''));
    assert.throws(() => checkSkills(repository), /working.*name/);
    write(skill, valid);
    run(['rm', '--cached', '--', skill]);
    assert.equal(checkSkills(repository).length, 1);
  });
});

test('unsafe, missing and incorrectly cased inline, reference and HTML resource paths fail', () => {
  for (const destination of ['../secret.md', '%2e%2e/secret.md', '/secret.md', 'C:/secret.md',
    '\\secret.md', 'file:///secret.md', 'javascript:alert', 'SKILL.MD', 'missing.md', 'a/../SKILL.md']) {
    for (const link of [`[resource](${destination})`, `[resource]: ${destination}`, `<img src="${destination}">`]) {
      fixture(({ repository, write }) => {
        write(skill, valid + '\n' + link + '\n');
        assert.throws(() => checkSkills(repository), /resource/);
      });
    }
  }
});

test('unreviewed resources, executable formats, secrets and competing instructions fail existing naming', () => {
  for (const file of ['references/guide.md', 'scripts/run.mjs', 'scripts/run.sh', 'assets/tool.exe',
    '.env', 'AGENTS.md', 'CLAUDE.md', 'nested/SKILL.md']) {
    fixture(({ repository, write, run }) => {
      write(skill, valid);
      const resource = `.agents/skills/example/${file}`;
      write(resource, 'unreviewed\n');
      assert.throws(() => checkPath(resource));
      assert.throws(() => checkSkills(repository), /naming|unsupported/);
      run(['add', '--', '.agents']);
      rmSync(path.join(repository, resource));
      assert.throws(() => checkSkills(repository), /naming|unsupported/);
    });
  }
});

test('incorrectly cased skill entrypoint fails', () => {
  fixture(({ repository, write }) => {
    write('.agents/skills/example/skill.md', valid);
    assert.throws(() => checkSkills(repository), /naming/);
  });
});

test('Git index symlinks are rejected without reading their destinations', () => {
  fixture(({ repository, run }) => {
    const blob = run(['hash-object', '-w', '--stdin'], { input: 'unused' });
    assert.ok(blob.trim());
    run(['update-index', '--add', '--cacheinfo', `120000,${blob.trim()},${skill}`]);
    assert.throws(() => checkSkills(repository), /regular resolved index entry/);
  });
});

test('working skill directory junction or symlink is rejected', () => {
  fixture(({ repository, write }) => {
    write('owned-target/SKILL.md', valid);
    mkdirSync(path.join(repository, '.agents/skills'), { recursive: true });
    symlinkSync(path.join(repository, 'owned-target'), path.join(repository, '.agents/skills/example'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => checkSkills(repository), /symlink|regular/);
  });
});

test('skill validator and its permanent tests remain selected by existing local gates', () => {
  const { scripts } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(scripts['check:skills'], 'node scripts/check-skills.mjs');
  assert.equal(scripts.check.split(' && ').filter(command => command === 'npm run check:skills').length, 1);
  assert.equal(scripts['verify:foundation'].split(' ').filter(file => file === 'scripts/check-skills.test.mjs').length, 1);
});
