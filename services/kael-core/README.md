# Kael Core

Status: **Agentic Foundation implemented and locally tested; not deployed.** Live
provider calls, hosted secrets and production behaviour are NOT VERIFIED.

Kael Core is the single TypeScript runtime behind every Kael conversation, for
Customers and Workers alike. It runs inside the `kael` Supabase Edge Function
(`supabase/functions/kael/index.ts`), which only wires `Deno.serve` to the gateway.
The sources use web-standard APIs and erasable TypeScript, so the same files run on
Deno and in the Node test suite. This folder is not an npm workspace and adds no
dependency.

## Reply memory and rendering

The conversation menu's **Bộ nhớ Kael** control opts in separately for Customer
and Worker. It stores only reply language, level of detail, and formatting as
fixed choices, with the latest explicit choice and its source. Turning it off
removes all choices for that mode. A user can remove a single choice or replace
it in the settings. With memory enabled, `ghi nhớ: ngắn gọn` saves a choice,
and `không phải ngắn gọn, là chi tiết` replaces the old value if it still
matches. Chat cannot save arbitrary facts or personal information.

Conversation continuity uses existing messages and task rows. When the recent
transcript runs out of room, PostgreSQL assembles a versioned digest of up to
eight older excerpts from a bounded scan, prioritizing corrections, decisions,
references and questions. It does not store another copy or call a model.
Excerpts retain source message IDs and timestamps, are unverified, and use a
conservative filter for credential and personal data patterns. Free-form
messages are still retained under the existing conversation policy; disabling
preferences does not delete transcripts. Older details outside the digest
may need to be restated. Only task rows and verified tool results can attest
to business state. Preferences are read at turn start; a change affects
subsequent turns, not text already sent to a provider.

Mobile renders persisted and live assistant text with the same pinned,
MIT-licensed Markdown parser. HTML and automatic linking are disabled, images
are represented by their alt text, and HTTPS links open only when tapped.
During a stream, updates are coalesced without animating each word. Approvals,
task cards, receipts and the mascot use their existing components.

## Provider readiness and recovery

The app sends its existing NestScout session; there is no provider key field.
The hosted Supabase Edge Functions secret store supplies `DEEPSEEK_API_KEY`,
`ANTHROPIC_API_KEY` and `PERPLEXITY_API_KEY`. Set `KAEL_MODEL_ROUTE` explicitly
when using Anthropic or an ordered fallback, and configure `KAEL_ANTHROPIC_MODEL`
for the approved model. Local Edge and the 8085 local pilot run offline.

After hosted setup or rotation, repeat a no-spend probe. With a signed-in
NestScout session, call `GET /functions/v1/kael`
with `x-kael-readiness: 1`. The result reports route and configuration state and
verifies server RPC authorization with the database. It makes no model call.
The 8085 launcher has its separate `status` command. Hosted Edge reads the
default Supabase managed keys, while local Edge can use the legacy pair.

Normal chat falls back only before visible output, on transient transport or
provider failures and only to the next explicitly configured provider. Auth,
billing, invalid requests, and incomplete streams fail visibly. Once a provider
completes a model step, subsequent steps stay on that provider. Usage, provider
and terminal diagnostics are separate from durable run completion; logs carry
IDs, status and sanitized model metadata. No part of this readiness flow
enables Live Evaluation or bypasses its approvals or budget.

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
| `src/knowledge-contract.ts`, `src/knowledge-cases.ts`, `src/knowledge-sources.ts` | Validated, versioned Vietnamese source corpus and provenance registry |
| `src/intelligence.ts` | Caller-scoped retrieval, provisional estimate preview and inactive learning boundary |

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
  itself is broader, so it must stay in the Edge Function environment. The
  managed server key travels in `apikey`. The legacy service-role JWT also
  travels in `Authorization` for the local Edge runtime.
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
or 503. A 401 means the auth service rejected the token; when it cannot be reached the
answer is the retryable 503 `internal`. A started run returns `application/x-ndjson`, one event per line, each with
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
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` | Hosted Edge receives the URL and default keys from Supabase. Local Edge supports `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The gateway uses the server key only for named internal RPCs and readiness |
| `ANTHROPIC_API_KEY` + `KAEL_ANTHROPIC_MODEL` | Enables Anthropic (Messages API `2026-10-21`, streaming); `KAEL_ANTHROPIC_EFFORT` = `low`, `medium` (default) or `high` |
| `DEEPSEEK_API_KEY` | Enables DeepSeek chat completions. `KAEL_DEEPSEEK_MODEL` overrides the default `deepseek-flash`; `KAEL_DEEPSEEK_THINKING=enabled` turns on thinking mode with in-run `reasoning_content` replay |
| `KAEL_MODEL_ROUTE` | Provider order; defaults to DeepSeek followed by Anthropic when configured. Unknown or duplicate entries fail closed |
| `PERPLEXITY_API_KEY` + `KAEL_WEB_SEARCH=enabled` | Enables the `web_search` tool |
| `KAEL_ANTHROPIC_SERVER_FALLBACK` | Enables Anthropic's provider-side fallback for supported configured models |
| `KAEL_ENABLED_EFFECTS` | Owner opt-in for explicit-confirmation actions: `service_request_submit`, `service_quote_decision`, `service_request_redispatch`, `service_request_cancel`, `work_submission_decision`, `worker_offer_decision` and `worker_job_advance`; omitted actions stay unavailable |
| `KAEL_KNOWLEDGE=disabled` | Removes both Intelligence tools; general conversation stays available |
| `KAEL_ESTIMATE_PREVIEW=local_only` | Enables numeric synthetic preview only when the configured Supabase target is loopback; default disabled |

Anthropic requires an explicit model. A route containing an unconfigured
provider is unavailable. The gateway will not replay an interrupted stream.

## Local integration verification

Run `npm run db:start`, then `npm run kael:serve` in another terminal in the
same worktree and branch. Local Kael runs offline for provider traffic. JWT
verification remains in place. `db:start` excludes Functions. Serving Functions
activates them on that same managed stack. Obtain the assigned loopback API URL from
`npm run db:status`; never reuse another worktree's ports.

The mobile app's ignored `.env` needs that URL, target `local`, and the stack's
publishable key. The local launcher discards ambient provider variables and
rejects shared and Kael function dotenv overrides. It passes only metadata for
the offline developer pilot.

`npm run db:test` runs SQL security and workflow tests. With Functions served,
`npm run db:mcp:test` also runs the Kael integration scenarios in
`scripts/supabase-mcp.integration.test.mjs`. They provision disposable local
accounts through Auth Admin, sign in through the supported password grant,
and validate Auth-signed JWTs against Auth and RLS. This is a gateway harness,
not phone OTP or application login E2E. No SMS is sent and authentication
configuration is unchanged.

The actual Edge Function is tested in offline mode and must report
`provider_unavailable`. A temporary local Edge worker verifies the gateway and
adapter end to end with fixture SSE. Additional deterministic scenarios inject
a scripted provider in the test process. Both use real Auth, REST, PostgreSQL,
policy and persistence. The test removes its temporary worker entry; no mock
transport is available in the shipped Edge or mobile code. Synthetic-only approval tests
enable the effect only in that test handler. Lost-response injection happens
after the real local submission commits, and reconciliation checks the original
submission key. Test identities and their records are removed after the run.
Live AI inference requires separately supplied authorized provider configuration
and is not established by these tests.

## Hosted TestFlight Device Beta

Supabase Dashboard Edge Functions Secrets is the only provider credential
source. The deployed `kael` function reads `DEEPSEEK_API_KEY`,
`ANTHROPIC_API_KEY`, and `PERPLEXITY_API_KEY` via `Deno.env.get` in the
Supabase-managed environment. Keep provider values in Dashboard Secrets.
TestFlight receives only the Supabase publishable key and uses the signed-in
Supabase Auth session. [Supabase environment variables](https://supabase.com/docs/guides/functions/secrets)

Hosted chat routes to DeepSeek first and includes Anthropic as fallback when
its server key and model are configured. Set `KAEL_MODEL_ROUTE=deepseek` to
disable that fallback, or `KAEL_MODEL_ROUTE=deepseek,anthropic` to state the
full route explicitly. Both adapters accept the model identifier configured by
the server and validate its provider-specific format. Perplexity Search is
available to Kael when `PERPLEXITY_API_KEY` is configured and
`KAEL_WEB_SEARCH=enabled`. Provider credentials stay in Supabase Edge Secrets.

Every eligible authenticated account uses the same provider route. The hosted
runtime retains JWT verification, caller-scoped REST/RLS, role permissions,
approval checks, per-account rate limits and existing per-turn resource limits.
Hosted inference has no actor whitelist, provider spend ledger, or fixed
$0.30-per-provider hourly ceiling. Anonymous sessions do not receive Kael access.

Authenticated `GET /functions/v1/kael` with `x-kael-readiness: 1` reports
configuration and database status only. It does not call an AI provider or
prove a streaming turn. A real chat verification must use a valid Auth session,
receive a terminal completion event, and confirm the persisted conversation.
This repository change does not deploy the Edge Function or create a TestFlight
build; those steps follow PR approval. Device behavior remains unverified until
a tester sends a real prompt in the new TestFlight build on iPhone.

## Durable runtime

`services/kael-core/durable/` is a native Rust service (crate `kael-durable`) that
runs Kael turns on [Pi-durable](https://github.com/y0usaf/pi-durable-rs), pinned at
`460649edb63d495d97c30cc69b2481d10f2b4cca`. It keeps the request, event and
approval contracts above unchanged. It is opt-in: the Edge Function sends turns to it
only while the `KAEL_DURABLE_URL` secret is set.

| Concern | Design |
| --- | --- |
| Business truth | Supabase Postgres. Pi holds one SQLite journal per run and lease epoch (`journals/<run_id>.e<epoch>.sqlite`, named by the Postgres run UUID) for model and tool steps, never business records |
| Admission | `kael_durable_start_run` creates or replays the run and its lease in one transaction. A replay of a legacy run returns HTTP 421 and the Edge Function serves it from the legacy runtime |
| Exclusive writer | Each run has an epoch and a lease. Writes carry `x-kael-lease: holder:epoch`; the database refuses them (HTTP 403) once another holder owns a newer epoch, and the process cancels the run |
| Recovery | A killed process leaves a running run with an expired lease. Any instance, or the same client retrying the same `request_id`, claims it with a new epoch and resumes from a snapshot of the newest earlier journal, taken through a read-only SQLite backup so a predecessor frozen mid-write (which still holds the write lock of its own file) cannot block the takeover. Completed tool steps are not run again. Tools other than reads are registered as unsafe to replay, so the harness does not re-run one that was interrupted mid-call: the model receives "interrupted and may have partially run" instead of an invented result and must check the real state with a read tool before retrying. A live test holds the task write's response at a proxy, kills the process after the database committed it, and checks that the resumed run creates no second task |
| Events | NDJSON in `events/<run_id>.ndjson`, `seq` gap-free across restarts. `GET /v1/runs/{id}/events?after=N` and a repeated `POST /v1/turn` both replay from the log, owner-checked |
| Identity | The caller's JWT is verified against Supabase Auth; the owner is recorded in `meta/<run_id>.json` and rechecked on every attach. Tool offers follow the verified mode and capabilities |
| Approvals | Unchanged: the database fingerprint, consumption and reconciliation RPCs decide, so an approval survives any restart and applies once |
| Account erasure | `erase_account_data` marks the account's journals `purge_pending`; the reconciler deletes journal, event and metadata files after a grace period and confirms with `kael_durable_mark_purged`. Files with no database row are removed as orphans |
| Rollback | Unset `KAEL_DURABLE_URL`. New turns use the legacy runtime at once; runs already on the durable service finish, expire or are interrupted by the database sweep |

Run and test it with Docker when no local Rust toolchain exists:

```bash
docker run --rm -v "$PWD/services/kael-core/durable:/w" -w /w rust:1.90-bookworm cargo test --locked --test contracts
```

`tests/process_recovery.rs` starts the real `kael-durable` binary against a live
Supabase stack (GoTrue, PostgREST, Postgres with the repository migrations) and a
local OpenAI-compatible model server. It signs up real users, kills the process with
SIGKILL mid-stream, restarts it, and checks resume without a repeated effect,
account isolation, approval application across a restart, a typed provider failure
a tool call that was in flight at the crash, DeepSeek thinking mode, journal purge
after account erasure or session deletion, and a second instance streaming a run another
instance owns. The tests are `#[ignore]`d until
`KAEL_TEST_GATEWAY`, `KAEL_TEST_ANON` and `KAEL_TEST_SERVICE` point at such a stack,
then run with `cargo test --locked --test process_recovery -- --ignored --test-threads=1`.
Three of the tests drive the dispatch tools. A proposed cancel needs the account's
confirmation, cannot be applied by another account, closes the request once and cannot
be applied twice; a redispatch proposal for a request that cannot be retried gets no
approval and records no round; and, only when built with `--features dispatch-fixture`
against a stack with automatic dispatch enabled and one dispatch-eligible worker, a
confirmed redispatch invites the worker once and never reports an assignment. The model
in these tests is a scripted local server, so they prove the tool, approval and effect
path, not provider output.

On a machine without a Linux toolchain, run the suite in a `rust` container and give it
the stack through a TCP proxy to the host. The gateway URL must keep the hostname
`host.docker.internal`, because the service rejects non-local plain HTTP addresses by IP
literal, and that name must resolve to IPv4 only (`--add-host`), since the proxy
listens there.

They must run one at a time: every started service runs the reconciler, which adopts
and purges any run in the shared database, so a parallel test's service would close or
purge another test's runs, whose files live in a different data directory. The same
holds in production: instances that share a database must share the data volume, or
a run's journal is not found by the instance that claims it and the run is closed as
interrupted.

The hosted `Supabase local verification` job runs these tests against the repository's
own isolated local stack (`KAEL_TEST_*` are exported from the verified stack's
status, with the keys masked), so they need no separate fixture. The test client retries
a turn or event request up to three times on `503`, the documented retryable answer when
the auth service or database is briefly unreachable; any other status fails the test.

A reconnecting client can reach any instance. The instance that holds a run's lease
streams it from memory. An instance that does not hold the lease, but sees the run's
event file on the shared volume, answers a same-`request_id` reconnect and
`GET /v1/runs/{id}/events` by following that file read-only (`EventLog::follow`): it
delivers only complete lines, never truncates or writes the owner's file, and swaps to
the live log if its own reconciler adopts the run after the lease expires. If the event
file is not visible (a volume that is not shared) it answers `409 busy` as before, so
the client keeps retrying the same `request_id`. The TestFlight pilot should still run
one instance; this behavior makes a second instance safe, not necessary.

| Setting | Effect |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | Same targets and keys as the gateway; plain HTTP is accepted only for local hosts |
| `KAEL_DURABLE_DATA_DIR` | Required absolute path on persistent storage; `/tmp` is refused unless `KAEL_DURABLE_ALLOW_TEMP=1` |
| `KAEL_DURABLE_HOLDER`, `KAEL_DURABLE_LEASE_SECONDS` | Instance name (`[A-Za-z0-9._-]`, at most 80) and lease length from 10 to 600 seconds, default 30 |
| `KAEL_DURABLE_BIND` | Listen address, default `127.0.0.1:8787` |
| `KAEL_DURABLE_PURGE_GRACE_SECONDS` | Delay before a purge-pending journal is deleted, default 120 |
| `DEEPSEEK_API_KEY`, `KAEL_DEEPSEEK_MODEL`, `ANTHROPIC_API_KEY`, `KAEL_ANTHROPIC_MODEL`, `KAEL_MODEL_ROUTE`, `PERPLEXITY_API_KEY` with `KAEL_WEB_SEARCH=enabled`, `KAEL_ENABLED_EFFECTS`, `KAEL_KNOWLEDGE=disabled` | Same meaning as for the gateway. `KAEL_DEEPSEEK_BASE_URL` and `KAEL_ANTHROPIC_BASE_URL` override the provider endpoints (HTTPS or local; for tests and gateways) |
| `KAEL_DEEPSEEK_THINKING=enabled` | Requests DeepSeek thinking mode (`thinking.type=enabled`, high reasoning effort); reasoning text is replayed to the provider as Pi-durable's DeepSeek adapter does and is never shown to the user |
| `KAEL_ANTHROPIC_SERVER_FALLBACK=enabled` with `KAEL_ANTHROPIC_FALLBACK_MODELS` | For the Fable 5.1, Opus 5.5, Opus 5 and Sonnet 5.5 models, sends Anthropic's server-side fallback with one to four explicit `claude-*` ids. The legacy runtime sent the string `default`; Pi-durable only supports the explicit list, so the list is required and startup fails without it |
| `KAEL_ESTIMATE_PREVIEW` | `local_only` is refused at startup: the durable service has no numeric price-preview path and always returns the disabled preview |
| `KAEL_DURABLE_URL` (Edge secret) | HTTPS address of the service, or a local HTTP address; any other value is ignored |

`GET /ready` reports database and storage status without calling a model provider.
[`durable/Dockerfile`](durable/Dockerfile) is the only container recipe the repository
naming policy approves (`scripts/check-hygiene.mjs` accepts that exact path and
applies the comment gate to it). It pins both base images by digest, builds with
`--locked`, runs as a non-root user and keeps state in the `/var/lib/kael` volume:

```bash
docker build -t kael-durable services/kael-core/durable
```

Differences from the legacy runtime:

- `knowledge_search` and `price_estimate_preview` are offered to the customer
  capability and validated against the same retrieval contract. Results are never
  cached or deduplicated within a run. The preview returns only the disabled
  preview; the numeric local-evaluation preview is not implemented.
- DeepSeek thinking mode and Anthropic server-side fallback are configurable (table
  above). Neither has run against the real provider here; the checks use a local
  OpenAI-compatible server and the model definitions Pi-durable sends. The Anthropic
  fallback needs an explicit model list; it does not use the legacy `default` string.
- When a crash interrupts a reply mid-text (the last logged event is a
  `message_delta`), the resumed run drops the interrupted partial reply from the
  final text and streams no further deltas, so the log never concatenates the old
  partial with the new answer. The terminal `run_completed.text` is authoritative and
  the client shows it in place of the streamed text. After any other crash point the
  resumed run streams normally.
- The model-visible tool schemas drop length and pattern keywords that Pi-durable's
  validator does not support; the service enforces them before every tool call.

## Not implemented

Image understanding, voice, background workers, proactive notifications,
general-purpose fact memory, conversation deletion or retention jobs, quotes,
matching and booking beyond request submission. These need owner policy before work
starts. See `scripts/kael-evaluation.test.mjs` for the deterministic scenarios; they
use scripted providers and do not measure model quality.

The local Intelligence foundation adds real PostgreSQL lexical retrieval with
180 provisional synthetic service cases. Its two tools are read-only and preserve
the same Runtime and business authority. See [Intelligence operations and evidence](../../docs/kael-intelligence.md)
for provenance, default-off pricing, inactive learning, benchmark commands and
the distinction between actual SQL retrieval and scripted response tests.
