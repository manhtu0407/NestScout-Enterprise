---
name: be-transaction-integrity
description: "Implement or review PostgreSQL business invariants under concurrency, duplicate delivery and retries, including booking or money reconciliation. Use for double effects or atomic state changes; exclude RLS ownership, generic schema formatting and agent workflow routing."
metadata:
  library: nestscout-engineering-skills
  domain: backend
  specialty: transaction-concurrency-idempotency
  consumer: codex,claude-code
  version: "1.0.0"
---
# Transaction integrity

Prove a business invariant across commits, duplicate delivery and uncertain effects.
Read root `AGENTS.md` and [technical references](references/source-evidence.md).

## Inputs and selection

Require the actual invariant, mutation entrypoints, schema/constraints, isolation,
idempotency scope, external provider contract and allowed local target. State
amount/currency representation and rounding only from the approved contract.
Without product/provider choices, review the supplied algorithm conditionally.

- Positive: “Two concurrent requests reserve the same slot” or “A retry pays twice.”
- Negative: “Who may read this row?” or “Which workflow node resumes next?”
- Neighbor: `kael-workflow-orchestration` owns workflow routing; this skill owns
  durable business effects. `be-schema-migrations` owns installing constraints.

## Procedure

1. Write the invariant as an observable state predicate, e.g. at most one active
   reservation for an identified slot. Trace every writer, retry and reconciliation
   entrypoint. Identify the durable owner instead of trusting an in-memory mutex.
2. Draw the read/decision/write/commit interleaving for two real transactions.
   Read Committed SELECT-then-INSERT does not serialize an absence check.
   Choose a constraint, conditional update, appropriate row/advisory lock or
   stronger isolation matching the actual invariant; locking nonexistent rows
   does not protect a missing reservation.
3. Define idempotency identity and storage: principal + operation + business key,
   normalized request fingerprint, in-progress/result state and lifetime.
   Concurrent identical calls should converge on one committed effect; the same
   key with changed arguments must conflict. A cache or generated new UUID on
   each retry does not establish this property.
4. Keep related local state updates in one transaction. Read committed predicates
   can change between statements; Serializable may require retry of the whole
   transaction on SQLSTATE 40001. Consider deadlock 40P01 separately, with bounded
   attempts, deterministic lock ordering and preserved failure context.
5. Separate external effects from database atomicity. A database rollback cannot
   undo a payment/network call. Use the already approved effect-intent/outbox,
   provider idempotency and reconciliation design if present. Persist intent
   and outcome evidence; after a timeout, query/reconcile before retrying.
   “Call the payment API first, then update if pending” alone is unsafe.
6. Handle duplicate/out-of-order events using authenticated event identity and
   monotonic/allowed state transitions. Atomically couple deduplication with the
   local change. Marking an event processed before a failed update loses work;
   acknowledging an uncommitted effect can lose delivery.
7. For authorized changes, fix the durable boundary and real callers. Do not add
   a speculative payment provider, queue or ledger. Inspect actual PostgreSQL
   major behavior and constraints; SQL sequences are not rollback-safe counters.

## Validation and recovery

Use independently controlled connections/barriers to race the same resource;
record each outcome plus final state, not a sequential duplicate test alone.
Test identical replay, changed payload/key, crash before/after commit, lost
acknowledgment, dependency timeout, conflicting transition and failed reconciliation.
Verify no partial local state and that ambiguous external outcomes remain visible.

Run only approved disposable local tests; never charge real accounts or replay
production events. A mock validates the algorithm's fixture contract, not a real
provider's guarantee. If no two-connection harness/provider contract exists,
record the respective BLOCKED/NOT RUN dimensions. Do not claim exactly-once
execution merely because one database test passes.

## Output and completion

Return invariant/entrypoint map, failing interleaving, chosen atomic boundary,
idempotency/recovery contract, scoped diff and actual concurrency/effect evidence.
Complete when races and replay preserve the invariant or their gaps are explicit.
Follow root policy for all sensitive/external operations; green local tests
cannot authorize financial effects, hosted migrations or deployment.
