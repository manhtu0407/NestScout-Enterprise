# Kael Core

Status: **Agentic Foundation implemented and locally tested; not deployed.** Live
provider calls, hosted secrets and production behaviour are NOT VERIFIED.

Kael Core is the single TypeScript runtime behind every Kael conversation, for
Customers and Workers alike. It runs inside the `kael` Supabase Edge Function
(`supabase/functions/kael/index.ts`), which only wires `Deno.serve` to the gateway.
The sources use web-standard APIs and erasable TypeScript, so the same files run on
Deno and in the Node test suite. This folder is not an npm workspace and adds no
dependency.

## Responsibilities

| File | Responsibility |
| --- | --- |
| `src/gateway.ts` | HTTP boundary: JWT verification, request validation, run start/replay, NDJSON streaming, disconnect handling |
| `src/runtime.ts` | Bounded plan–act–observe loop and the approval resolution path |
| `src/context.ts` | System prompt, capability notes, known tasks and the history window |
| `src/model.ts` | Provider-neutral transcript, error classification and fallback rules |
| `src/anthropic.ts`, `src/deepseek.ts` | Provider adapters (streaming, tools, stop reasons, usage) |
| `src/perplexity.ts` | Perplexity Search API adapter used by the `web_search` tool |
| `src/tools.ts` | Trusted capability registry and strict argument validation |
| `src/policy.ts` | Independent tool authorization and approval fingerprints |
| `src/executor.ts` | Executes authorized tools through Supabase with the caller's JWT |
| `src/tasks.ts` | Task state machine shared with the SQL transition table |
| `src/store.ts` | Persistence port backed by the `kael_*` RPCs |
| `src/events.ts` | Runtime event contract |
| `src/config.ts`, `src/sse.ts` | Environment configuration and SSE parsing |

Persistence lives in `supabase/migrations/20261103130000_create_kael_runtime.sql`.
Conversations, messages, runs, tasks and task events are owner-readable through RLS;
approvals and tool executions stay in `nestscout_private`. Every write goes through a
`security definer` function keyed on `auth.uid()`.

## Trust model

- The Edge Function never uses a service-role key. All persistence and business
  calls carry the signed-in user's JWT, so RLS and existing RPC guards apply to every
  tool, and Kael can never exceed the user's own rights.
- Capabilities come from `kael_actor_capabilities()` (non-anonymous customer, and
  `current_worker_eligible()` for Worker data), never from the presentation mode or
  the model. Worker tools are offered only in Worker mode with verified eligibility.
- The model sees a narrow candidate tool set. A tool call is validated against the
  registry, the offered set, the actor's capabilities, the owner-enabled effects, the
  per-run tool budget and a strict schema before anything runs.
- Consequential tools never execute from a model call. `service_request_submit`
  creates an approval bound to the actor, task, task version, exact draft arguments,
  a SHA-256 fingerprint and an expiry. Only a later `approve` action carrying that
  fingerprint can consume it once; the effect uses the approval id as the submission
  key, so reconciliation after an uncertain outcome cannot duplicate the request.
  `kael_complete_approval` verifies the created request in the database before the
  task can be completed.
- A model cannot mark a service task completed, request approval through the
  generic task tool or forge an effect result; both the runtime and SQL refuse it.
- Tool results and stored text are labelled as data. Prompt instructions inside
  them cannot widen the offered tools or bypass approval.
- Logs carry run ids, statuses, providers, token counts and error codes only.

## Runtime contract

`POST /functions/v1/kael` with `Authorization: Bearer <user JWT>` and:

```json
{ "request_id": "uuid", "conversation_id": "uuid|null", "mode": "client|worker",
  "action": { "type": "message", "text": "…" } }
```

Approvals use `{ "type": "approve" | "reject", "approval_id": "uuid", "fingerprint": "hex" }`
with the conversation id. Refusals before a run starts return JSON
`{ "error": { "code", "message", "retryable" } }` with HTTP 400, 401, 409, 413, 429
or 503. A started run returns `application/x-ndjson`, one event per line, each with
`v: 1`, `run_id` and a gap-free `seq`:

| Event | Meaning |
| --- | --- |
| `run_started` | Run accepted; carries `conversation_id`, `request_id`, `replayed` |
| `message_delta` | Streamed assistant text |
| `tool_started` / `tool_completed` | User-facing activity label and outcome (`succeeded`, `failed`, `denied`, `approval_required`, `unavailable`) |
| `task_updated` | Current task view after a persisted transition |
| `approval_required` | Exact action, details, fingerprint and expiry awaiting the user |
| `run_completed` | Terminal success with the final text |
| `run_failed` | Terminal failure with a code, message and retry hint |

A stream that ends without a terminal event is an interrupted run, never a success.
Retrying the same `request_id` replays the stored result without a new model call.
One run may be active per conversation. The mobile parser in
`apps/mobile/src/features/shared/kael-events.ts` validates this contract, and the
evaluation suite checks every emitted event against it.

## Limits

Six model calls, eight tool calls, 4,096 output tokens per call and 60 seconds per
run; a 16-message, 24,000-character history window; 12 runs per minute and 300 per
day per account; fifteen-minute approvals. Approval waits are durable database
state, not open connections.

## Configuration

| Setting | Effect |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Required; injected by the Edge runtime |
| `ANTHROPIC_API_KEY` + `KAEL_ANTHROPIC_MODEL` | Enables Anthropic (Messages API `2026-10-21`, streaming, server-side refusal fallback where supported); `KAEL_ANTHROPIC_EFFORT` = `low`, `medium` (default) or `high` |
| `DEEPSEEK_API_KEY` + `KAEL_DEEPSEEK_MODEL` | Enables DeepSeek chat completions; `KAEL_DEEPSEEK_THINKING=enabled` turns on thinking mode with in-run `reasoning_content` replay |
| `KAEL_MODEL_ROUTE` | Provider order, default `anthropic,deepseek`; only approved providers are accepted |
| `PERPLEXITY_API_KEY` + `KAEL_WEB_SEARCH=enabled` | Enables the `web_search` tool |
| `KAEL_ENABLED_EFFECTS` | Owner opt-in for consequential effects; only `service_request_submit` exists |

No model id has a default: a key without an explicit model leaves that provider
unavailable and the user sees an honest unavailable state. Fallback to the next
provider happens only when a call fails before producing output; a stream that
already produced text fails the run instead of silently replaying it.

## Not implemented

Image understanding, voice, background workers, proactive notifications, knowledge
retrieval, long-term user memory, conversation deletion or retention jobs, quotes,
matching and booking beyond request submission. These need owner policy before work
starts. See `scripts/kael-evaluation.test.mjs` for the deterministic scenarios; they
use scripted providers and do not measure model quality.
