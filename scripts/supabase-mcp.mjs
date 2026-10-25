import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { localRuntime, withLocalLock, safeDiagnostic, requireLocal } from './supabase-local.mjs';

export const localTools = ['list_tables', 'list_extensions', 'list_migrations', 'execute_sql', 'get_advisors', 'search_docs'];

export function safeToolResult(result) {
  return result.isError ? { isError: true, content: [{ type: 'text', text: 'Local MCP tool failed; credential-bearing upstream detail withheld.' }] } : result;
}

async function main() {
  requireLocal(process.argv.length === 2, 'MCP target overrides are forbidden.');
  const runtime = localRuntime();
  const initial = await withLocalLock(() => runtime.verify());
  const upstream = new Client({ name: 'nestscout-local-bridge', version: '1.0.0' });
  const server = new Server({ name: 'nestscout-local', version: '1.0.0' }, { capabilities: { tools: {} } });
  const check = () => {
    const current = runtime.verify();
    requireLocal(current.id === initial.id && current.mcp === initial.mcp, 'Local identity/endpoint changed; reconnect the MCP client.');
  };
  const handle = operation => withLocalLock(operation).catch(error => {
    throw new McpError(ErrorCode.InternalError, safeDiagnostic(error));
  });
  try {
    await withLocalLock(async () => {
      check();
      await upstream.connect(new StreamableHTTPClientTransport(new URL(initial.mcp), {
        fetch: (url, options) => fetch(url, { ...options, redirect: 'error' }),
      }), { timeout: 180000 });
      check();
    });
    server.setRequestHandler(ListToolsRequestSchema, () => handle(async () => {
      check();
      const result = await upstream.listTools();
      return { tools: result.tools.filter(tool => localTools.includes(tool.name)) };
    }));
    server.setRequestHandler(CallToolRequestSchema, request => handle(async () => {
      requireLocal(localTools.includes(request.params.name), 'Tool is outside the local allowlist.');
      check();
      const result = await upstream.callTool(request.params);
      check();
      return safeToolResult(result);
    }));
    server.onerror = upstream.onerror = error => console.error(safeDiagnostic(error));
    server.onclose = () => { void upstream.close().catch(error => console.error(safeDiagnostic(error))); };
    await server.connect(new StdioServerTransport());
  } catch (error) {
    await upstream.close();
    throw error;
  }
}

if (process.argv[1]?.endsWith('supabase-mcp.mjs')) {
  try { await main(); } catch (error) {
    console.error(`Local MCP unavailable: ${safeDiagnostic(error)}`);
    process.exitCode = 1;
  }
}
