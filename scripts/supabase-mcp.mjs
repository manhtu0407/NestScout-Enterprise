import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { localRuntime, withLocalLock, redactDiagnostic } from './supabase-local.mjs';

export const localTools = ['list_tables', 'list_extensions', 'list_migrations', 'execute_sql', 'get_advisors', 'search_docs'];

async function main() {
  assert.equal(process.argv.length, 2, 'MCP target overrides are forbidden.');
  const runtime = localRuntime();
  const initial = await withLocalLock(() => runtime.verify());
  const upstream = new Client({ name: 'nestscout-local-bridge', version: '1.0.0' });
  const server = new Server({ name: 'nestscout-local', version: '1.0.0' }, { capabilities: { tools: {} } });
  const check = () => {
    const current = runtime.verify();
    assert.equal(current.id, initial.id);
    assert.equal(current.mcp, initial.mcp, 'Local endpoint changed; reconnect the MCP client.');
  };
  try {
    await withLocalLock(async () => {
      check();
      await upstream.connect(new StreamableHTTPClientTransport(new URL(initial.mcp), {
        fetch: (url, options) => fetch(url, { ...options, redirect: 'error' }),
      }), { timeout: 180000 });
      check();
    });
    server.setRequestHandler(ListToolsRequestSchema, () => withLocalLock(async () => {
      check();
      const result = await upstream.listTools();
      return { tools: result.tools.filter(tool => localTools.includes(tool.name)) };
    }));
    server.setRequestHandler(CallToolRequestSchema, request => withLocalLock(async () => {
      assert.ok(localTools.includes(request.params.name), 'Tool is outside the local allowlist.');
      check();
      const result = await upstream.callTool(request.params);
      check();
      return result;
    }));
    server.onclose = () => { void upstream.close(); };
    await server.connect(new StdioServerTransport());
  } catch (error) {
    await upstream.close();
    throw error;
  }
}

if (process.argv[1]?.endsWith('supabase-mcp.mjs')) {
  try { await main(); } catch (error) {
    console.error(`Local MCP unavailable: ${redactDiagnostic(error.message)}`);
    process.exitCode = 1;
  }
}
