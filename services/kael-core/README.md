# Kael Core boundary

Status: **reserved, not implemented.** This folder only records where a future
server-side Kael runtime belongs. It contains no server, agent, model client,
tool, handler, script, package or secret, and it is not an npm workspace.

## Responsibility

A future Unified Kael Core may own orchestration, model routing, session, case
and long-term memory, role-scoped tools, human approval, budget and audit,
input validation and vendor adapters. Provider credentials stay on the server
and never reach the mobile bundle.

## Boundaries

- The user-facing Kael interface belongs in `apps/mobile/src/features/shared`,
  with Client- or Worker-specific presentation in their own features.
- Supabase remains the only backend today. Whether Kael runs as Supabase Edge
  Functions or as a separate service is decided against a real workload later.
- Runtime permissions, tools and approvals need the owner's process documents
  and an approved runtime scope first; the name Kael alone defines none.
- Developer MCP access is separate from, and never becomes, a Kael permission.
