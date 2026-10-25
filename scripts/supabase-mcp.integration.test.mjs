import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { root } from './tool-path.mjs';
import { localTools } from './supabase-mcp.mjs';

test('real local MCP exposes diagnostics, queries catalogs and rejects migration tools', { timeout: 240000 }, async () => {
  const client = new Client({ name: 'nestscout-local-verification', version: '1.0.0' });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath, args: ['scripts/supabase-mcp.mjs'], cwd: root, stderr: 'inherit',
    }), { timeout: 180000 });
    const inventory = await client.listTools();
    assert.deepEqual(inventory.tools.map(tool => tool.name).sort(), [...localTools].sort());
    const result = await client.callTool({ name: 'execute_sql', arguments: {
      query: "select count(*)::int as public_table_count from pg_catalog.pg_tables where schemaname = 'public'",
    } });
    assert.ok(!result.isError, 'Local catalog query failed.');
    assert.ok(result.content.some(item => item.type === 'text' && item.text.includes('public_table_count')));
    await assert.rejects(client.callTool({ name: 'apply_migration', arguments: {
      name: 'denied_metadata_probe', query: 'select 1;',
    } }), /outside the local allowlist/);
    const synthetic = '__audit_' + 'sensitive_identifier';
    const failure = await client.callTool({ name: 'execute_sql', arguments: {
      query: `select * from public.${synthetic}`,
    } }).then(result => ({ result }), error => ({ error }));
    assert.ok(failure.error || failure.result?.isError, 'Invalid SQL must propagate failure.');
    assert.ok(!JSON.stringify(failure.error?.message ?? failure.result).includes(synthetic), 'Upstream SQL error detail must not leak through MCP.');
  } finally {
    await client.close();
  }
});
