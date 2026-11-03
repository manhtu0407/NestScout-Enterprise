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
| `src/store.ts` | Persistence port: user-scoped reads, and the eight named server RPCs for Kael-internal writes |
| `src/events.ts` | Runtime event contract |
| `src/config.ts`, `src/sse.ts` | Environment configuration and SSE parsing |

Persistence lives in `supabase/migrations/20261103130000_create_kael_runtime.sql`.
Conversations, messages, runs, tasks and task events are owner-readable through RLS;
approvals and tool executions stay in `nestscout_private`. Every write goes through a
`security definer` function that only the `service_role` can execute and that takes
the account id the gateway verified.

## Trust model

- Business reads and the confirmed business effect carry the signed-in user's JWT,
  so RLS and the existing RPC guards apply to every tool and Kael never exceeds the
  user's own rights.
- Kael-internal state (runs, messages, tasks, tool audit, approvals) is written only
  by the gateway, after Supabase Auth verifies the user: eight named RPCs, executable
  only by `service_role`, receive the verified account id and repeat every ownership,
  version and transition guard. A signed-in client cannot call them, so it cannot
  forge history, approvals or outcomes around the agent's policy. The server key is
  used for nothing else and never reaches the model, logs or the mobile bundle. The
  eight-operation limit lives in `createServerRpc`; the `service_role` credential
  itself is broader, so it must stay in the Edge Function environment. Only the
  legacy service-role JWT is accepted; `sb_secret_` keys are refused at
  configuration until verified.
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
  Consuming the approval also requires the same conversation (for a check, the same
  mode) and that the owner gate and the account's capability still allow the
  operation, checked in the same transaction, reconciliation included. Rejecting
  requires the same run, conversation, fingerprint and a pending approval.
  `kael_complete_approval` locks the approval and task, accepts only the run that
  consumed or is checking the approval, verifies that the created request belongs
  to the account and carries the approval's submission key, and completes the task
  in the same transaction; a concurrently changed task leaves
  the outcome uncertain. The runtime reports success and failure only from that
  persisted result; a conflict, an unrecorded outcome or an HTTP refusal the
  database did not record is reported as uncertain. Agreement typed in chat is
  never consent.
- An uncertain outcome is offered as a reconciliation of the original approval, not
  a new confirmation: a `reconcile` action with the same approval id and fingerprint
  reruns the effect with the same submission key, so it either reports the request
  that landed or completes that same submission, never a second one; it is refused
  for any approval that was never consumed and while another run is executing it.
  The approval, not the Kael task, is the reconciliation record: closing or replacing
  the task or switching conversation leaves it checkable from any Customer-mode
  conversation of the account, and closing a task never cancels a submitted
  request. While any confirmed submission of the account is unresolved, new
  confirmations are refused and earlier pending ones cannot be used, without
  comparing request text.
- The mobile app restores the latest conversation per mode after a restart through
  `kael_conversation_state`, a read-only RPC on the user's token that exposes only
  view fields, pending unexpired confirmations of that conversation and the
  account's uncertain submissions to check from any conversation of that mode.
- Execution classes, resources and the BPMN mapping are documented in
  `docs/service-workflow.md` (Kael capability boundary); a denied operation is
  reported to the model as that operation only, so conversation continues.
- A model cannot mark a service task completed, request approval through the
  generic task tool or forge an effect result; both the runtime and SQL refuse it.
- Tool results and stored text are labelled as data. Prompt instructions inside
  them cannot widen the offered tools or bypass approval.
- Logs carry run ids, statuses, providers, the requested and the served model,
  token counts and error codes only. The served model comes from the provider's
  stream (`message_start.message.model` for Anthropic); when the field is absent the
  requested model is recorded, never a guessed fallback.

## Runtime contract

`POST /functions/v1/kael` with `Authorization: Bearer <user JWT>` and:

```json
{ "request_id": "uuid", "conversation_id": "uuid|null", "mode": "client|worker",
  "action": { "type": "message", "text": "…" } }
```

Approvals use `{ "type": "approve" | "reject" | "reconcile", "approval_id": "uuid", "fingerprint": "hex" }`
with the conversation id, which `reconcile` may leave null to check from a new
conversation; `reconcile` only checks an approval that was already consumed and
whose outcome is uncertain. Refusals before a run starts return JSON
`{ "error": { "code", "message", "retryable" } }` with HTTP 400, 401, 409, 413, 429
or 503. A started run returns `application/x-ndjson`, one event per line, each with
`v: 1`, `run_id` and a gap-free `seq`:

| Event | Meaning |
| --- | --- |
| `run_started` | Run accepted; carries `conversation_id`, `request_id`, `replayed` |
| `message_delta` | Streamed assistant text |
| `tool_started` / `tool_completed` | User-facing activity label and outcome (`succeeded`, `failed`, `denied`, `approval_required`, `unavailable`, `uncertain`) |
| `task_updated` | Current task view after a persisted transition |
| `approval_required` | Exact action, details and fingerprint awaiting the user: `kind: confirm` with an expiry, or `kind: reconcile` with no expiry for an uncertain submission to check |
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
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Required; injected by the Edge runtime. The gateway uses the server key only for the eight Kael-internal RPCs; it must be the legacy service-role JWT |
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
