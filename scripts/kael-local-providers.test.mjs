import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { discoverLocalProviders, parseLocalProviders, providerSourceReport } from './kael-local-providers.mjs';

const fixture = 'synthetic-provisioning-fixture';

test('only credentials and named routing settings are accepted from the central source', () => {
  assert.deepEqual(parseLocalProviders(`# Fixture\r\nDEEPSEEK_API_KEY=${fixture}\r\nANTHROPIC_API_KEY=${fixture}\r\nKAEL_ANTHROPIC_MODEL=claude-fixture\r\nKAEL_MODEL_ROUTE=deepseek,anthropic\r\n`), {
    DEEPSEEK_API_KEY: fixture, ANTHROPIC_API_KEY: fixture, KAEL_ANTHROPIC_MODEL: 'claude-fixture', KAEL_MODEL_ROUTE: 'deepseek,anthropic',
  });
  for (const extra of ['KAEL_ENABLED_EFFECTS=service_request_submit', 'KAEL_DEVELOPER_PILOT=local_8085',
    'SUPABASE_URL=https://elsewhere.invalid', 'KAEL_MODEL_ROUTE=anthropic,anthropic', 'DEEPSEEK_API_KEY=duplicate',
    'ANTHROPIC_API_KEY=${OTHER_SECRET}', 'ANTHROPIC_API_KEY=not a token', 'INVALID LINE',
    'PERPLEXITY_API_KEY=', 'PERPLEXITY_API_KEY=${OTHER_SECRET}', 'PERPLEXITY_API_KEY=bad token',
    'PERPLEXITY_API_KEY=one\nPERPLEXITY_API_KEY=two', 'KAEL_WEB_SEARCH=on', 'KAEL_MODEL_ROUTE=deepseek,perplexity']) {
    assert.equal(parseLocalProviders(`DEEPSEEK_API_KEY=${fixture}\n${extra}\n`), null);
  }
});

test('discovery requires private ownership and a bounded regular file and reports presence only', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'nestscout-providers-test-'));
  const directory = path.join(home, '.codex/private/kael-server');
  const file = path.join(directory, 'providers.env');
  const win = process.platform === 'win32';
  const acl = args => execFileSync('icacls', args, { stdio: 'ignore', windowsHide: true });
  const report = () => providerSourceReport(discoverLocalProviders(home));
  try {
    assert.equal(report().source, 'credential_missing');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (win) {
      const account = execFileSync('whoami', [], { encoding: 'utf8', windowsHide: true }).trim();
      acl([directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`]);
    }
    writeFileSync(file, `DEEPSEEK_API_KEY=${fixture}\n`, { mode: 0o600 });
    assert.deepEqual(report(), { source: 'source_loaded', deepseek: 'present', anthropic: 'absent', perplexity: 'absent', web_search: 'disabled', paid_probe: 'not_run' });
    assert.equal(discoverLocalProviders(home).env.DEEPSEEK_API_KEY, fixture);
    if (win) acl([directory, '/grant', '*S-1-5-32-545:R']);
    else chmodSync(directory, 0o755);
    assert.equal(report().source, 'source_inaccessible');
    if (win) acl([directory, '/remove:g', '*S-1-5-32-545']);
    else chmodSync(directory, 0o700);
    assert.equal(report().source, 'source_loaded');
    linkSync(file, path.join(directory, 'linked'));
    assert.equal(report().source, 'source_invalid');
    unlinkSync(path.join(directory, 'linked'));
    writeFileSync(file, `PERPLEXITY_API_KEY=${fixture}\nKAEL_WEB_SEARCH=enabled\n`);
    const searchReport = report();
    assert.deepEqual(searchReport, { source: 'source_loaded', deepseek: 'absent', anthropic: 'absent', perplexity: 'present', web_search: 'enabled', paid_probe: 'not_run' });
    assert.ok(!JSON.stringify(searchReport).includes(fixture));
    writeFileSync(file, `PERPLEXITY_API_KEY=${fixture}\nKAEL_WEB_SEARCH=disabled\n`);
    assert.deepEqual(report(), { ...searchReport, web_search: 'disabled' });
    writeFileSync(file, 'KAEL_WEB_SEARCH=enabled\n');
    assert.equal(report().source, 'credential_missing');
    writeFileSync(file, `UNAPPROVED=${fixture}\n`);
    assert.equal(report().source, 'source_invalid');
    writeFileSync(file, 'x'.repeat(4097));
    assert.equal(report().source, 'source_invalid');
    unlinkSync(file);
    writeFileSync(file, `DEEPSEEK_API_KEY=${fixture}\n`, { mode: 0o644 });
    if (win) acl([file, '/grant', '*S-1-5-32-545:R']);
    assert.equal(report().source, 'source_inaccessible');
    assert.ok(!JSON.stringify(report()).includes(fixture));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
