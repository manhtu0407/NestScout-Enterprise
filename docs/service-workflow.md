# Service workflow contracts

This contract records the 26 March 2025 workflow image as a business reference.
It does not assert that the listed commands or providers exist. The implementation
must derive the principal from authentication, authorize the resource and check
the current version and state within the same transaction as the effect. Worker
access grants are technical access, not proof of qualification.

The current repository implements a subset of the reference, including Customer
service-request intake, Worker job workflows and Kael sessions/runtime. The
remaining rows are proposed contracts, not shipped capabilities; see the
[mobile application guide](mobile-application.md) and the feature SQL tests for
the current implementation boundary.

## Ownership and dependencies

| Owner | Responsibility and consumer | Dependency |
| --- | --- | --- |
| Access feature | Session identity and mode presentation consumed by mobile screens | Existing auth gateway and Worker grant; mode is not authority |
| Client feature | Manual intake and owner-scoped projections | Authenticated request commands and current identity |
| Worker feature | Invitation and assigned-job presentation | Backend assignment, current grant and independently approved eligibility |
| Supabase migrations | Canonical data, authorization, guarded transactions and durable events | Actual commands and their callers |
| Supabase database tests | Allow, deny, replay and race evidence for backend boundaries | Isolated local database and real effective identities |
| Kael trusted boundary | Supabase Edge runtime with authenticated sessions and bounded tools | User consent and per-tool authorization; provider quality and full live flows need separate evidence |

Implement request before agreement, agreement before invitation and assignment,
and assignment before execution and acceptance. A support case is separate from
the work and financial history. Payment verification and model execution remain
disabled until their policies and providers are approved.

## Source branch registry

| Original label | Stable meaning | Constraint |
| --- | --- | --- |
| B01 | REQUEST_NEEDS_INFORMATION | Ask for missing information; resubmission requires owner action |
| B02 | SERVICE_NOT_MATCHED | Explain uncertainty or offer human review |
| B03 | WORKER_DECLINED | Rematching requires approved dispatch policy |
| B04 | MATCHING_UNAVAILABLE | No fabricated availability |
| B5 | DEPOSIT_PAYMENT_FAILED | Failure is not settlement |
| B05 | WORKER_DELAYED | ETA is an estimate; no invented penalty |
| B06 | CUSTOMER_NO_SHOW | Evidence and policy precede any fee or cancellation |
| B11 | SCOPE_CHANGE_REQUESTED | Exact revised scope and cost require owner consent |
| B12 | WORK_UNSAFE_TO_CONTINUE | Safe pause dominates forward progress |
| B13 | ACCEPTANCE_REJECTED | Preserve evidence and allow correction or dispute |
| B14 | ACCEPTANCE_DISPUTED | Preserve evidence; resolution requires authorized human policy |
| B15 | BALANCE_PAYMENT_FAILED | Work completion does not imply settlement |
| B16 | AFTERCARE_CLAIM_OPENED | Linked case does not rewrite original history |

The image uses both B5 and B05 for different branches; neither raw label is a
safe unique machine identifier. Its 2.1 customer confirmation, 2.2 worker
confirmation, 3.1 execution path and 4.1 correction loop require explicit guards,
not duplicate lifecycle state. Missing branch numbers are not invented.

## Shared transaction and retry rules

Owner, resource and state/version guards are checked again at the authoritative
boundary. Accepted effects and their audit evidence commit atomically. A request
key is scoped to actor and operation: identical retries return the original
result; conflicting payload reuse is rejected. When a result is unknown, read
the canonical state before retrying. External notifications and providers cannot
participate in a database transaction; delivery must follow commit and be
deduplicated. These are requirements, not claims of existing code.

Read projections expose only the current actor's permitted fields; subscription
events are hints to refetch. Account and resource switches invalidate pending
results. Timestamp comparisons use server UTC; money uses explicit currency and
minor units. No client can assert a payment as settled.

## Proposed operation registry

The rows below are proposed contracts from the handoff. Errors describe required
denials; exact transport and test names belong to the implemented boundary.
Each state-changing operation also requires actor/resource authorization, a
current version, atomic audit, and replay and wrong-actor tests as applicable.

### createLocalDraft

- Phase and actor: B; Guest/Customer.
- Resource and prerequisites: guest intake; Payload length/consent, ephemeral ownership.
- Effect: Draft stored safely or retained on-device.
- Denials: INVALID_INPUT; ABUSE_LIMIT.
- Boundary tests: X01,X02.
- Pending policy: Persistent guest identity requires approved policy.

### submitRequest

- Phase and actor: B; Verified Customer.
- Resource and prerequisites: own request; Owner verified, payload valid, expected version, key.
- Effect: Ready request and event.
- Denials: FORBIDDEN; STALE_VERSION; DUPLICATE.
- Boundary tests: X01,X02,X05.
- Pending policy: None identified in the handoff; other guards still apply.

### requestClarification

- Phase and actor: B; Customer/Scoped Kael.
- Resource and prerequisites: own request; Accessible request and permitted field.
- Effect: Missing-information status/notice.
- Denials: NOT_FOUND; FORBIDDEN.
- Boundary tests: X01,X20.
- Pending policy: Kael automation disabled without provider.

### proposeQuote

- Phase and actor: B; Authorized pricing service/operator.
- Resource and prerequisites: existing request; Verifiable scope/amount/currency/expiry/authority.
- Effect: Versioned nonmutable quote proposal.
- Denials: UNVERIFIED_PRICE; FORBIDDEN.
- Boundary tests: X04.
- Pending policy: Owner-approved pricing authority required.

### acceptQuote

- Phase and actor: B; Owning Customer.
- Resource and prerequisites: current quote; Quote version equals current, expiry valid, full terms.
- Effect: Immutable quote acceptance.
- Denials: EXPIRED; STALE_VERSION; FORBIDDEN.
- Boundary tests: X04,X05.
- Pending policy: No automatic deposit collection.

### rejectQuote

- Phase and actor: B; Owning Customer.
- Resource and prerequisites: current quote; Quote current, owner, allowed state.
- Effect: Explicit rejection record.
- Denials: STALE_VERSION; FORBIDDEN.
- Boundary tests: X04.
- Pending policy: None identified in the handoff; other guards still apply.

### inviteWorker

- Phase and actor: C; Trusted matching executor.
- Resource and prerequisites: request and verified worker; Agreement and eligibility + dispatch policy.
- Effect: Scoped invitation with expiry.
- Denials: INELIGIBLE; MATCHING_POLICY_REQUIRED.
- Boundary tests: X06,X07.
- Pending policy: Worker qualifications/dispatch policy pending.

### acceptInvitation

- Phase and actor: C; Eligible invited Worker.
- Resource and prerequisites: own invitation; Grant active, eligibility, no expiry, assignment exclusive.
- Effect: Exactly one assignment winner.
- Denials: ALREADY_ASSIGNED; EXPIRED; FORBIDDEN.
- Boundary tests: X06,X07,X08.
- Pending policy: Real dispatch policy pending.

### declineInvitation

- Phase and actor: C; Invited Worker.
- Resource and prerequisites: own invitation; Invitation active, correct actor/version.
- Effect: Invitation declined, possible re-match pending.
- Denials: FORBIDDEN; STALE_VERSION.
- Boundary tests: X07.
- Pending policy: Re-match policy pending.

### markEnRoute

- Phase and actor: C; Assigned Worker.
- Resource and prerequisites: own job; Active grant/assignment and legal preceding state.
- Effect: Truthful en-route event.
- Denials: INVALID_TRANSITION; FORBIDDEN.
- Boundary tests: X08,X10.
- Pending policy: ETA/location capture requires consent policy.

### confirmArrival

- Phase and actor: C; Assigned Worker.
- Resource and prerequisites: own job; Legal state and approved evidence.
- Effect: Arrival recorded.
- Denials: INVALID_TRANSITION; INVALID_EVIDENCE.
- Boundary tests: X10.
- Pending policy: Arrival proof policy pending.

### startWork

- Phase and actor: C; Assigned Worker.
- Resource and prerequisites: own job; Active assignment, agreement, relevant finance/safety guard.
- Effect: Working status.
- Denials: NOT_ELIGIBLE; SAFETY_HOLD.
- Boundary tests: X08,X10,X13.
- Pending policy: Actual service execution/finance policy pending.

### reportDelay

- Phase and actor: C; Assigned Worker.
- Resource and prerequisites: own job; Own job, plausible ETA evidence.
- Effect: Delay info and options.
- Denials: FORBIDDEN; INVALID_INPUT.
- Boundary tests: X11.
- Pending policy: No-show fees require approved policy.

### reportNoShow

- Phase and actor: C; Customer/Worker as policy.
- Resource and prerequisites: own job; Evidence, relevant party and stage.
- Effect: Case/hold, not automatic penalty.
- Denials: POLICY_REQUIRED; FORBIDDEN.
- Boundary tests: X11.
- Pending policy: Grace period and penalties pending.

### proposeScopeChange

- Phase and actor: C; Assigned Worker.
- Resource and prerequisites: own job; Legal state, immutable terms and delta.
- Effect: Pending versioned scope proposal.
- Denials: FORBIDDEN; INVALID_TRANSITION.
- Boundary tests: X12.
- Pending policy: Pricing basis required for real changed cost.

### approveScopeChange

- Phase and actor: C; Owning Customer.
- Resource and prerequisites: own proposal; Exact proposal version and explicit consent.
- Effect: Approved scope version event.
- Denials: STALE_VERSION; FORBIDDEN.
- Boundary tests: X12.
- Pending policy: None identified in the handoff; other guards still apply.

### rejectScopeChange

- Phase and actor: C; Owning Customer.
- Resource and prerequisites: own proposal; Exact current version and ownership.
- Effect: Proposal rejected; original scope intact.
- Denials: STALE_VERSION; FORBIDDEN.
- Boundary tests: X12.
- Pending policy: None identified in the handoff; other guards still apply.

### pauseUnsafeWork

- Phase and actor: C; Assigned Worker/Authorized operator.
- Resource and prerequisites: own job; Safety report with minimal safe preconditions.
- Effect: Immediate safety hold + event.
- Denials: FORBIDDEN; NOT_FOUND.
- Boundary tests: X13.
- Pending policy: Authorized recovery procedure pending.

### submitWorkEvidence

- Phase and actor: D; Assigned Worker.
- Resource and prerequisites: own job; Required evidence per approved service contract.
- Effect: Work submitted, not accepted.
- Denials: INVALID_EVIDENCE; FORBIDDEN.
- Boundary tests: X13,X14.
- Pending policy: Service-specific minimum evidence pending.

### acceptWork

- Phase and actor: D; Owning Customer.
- Resource and prerequisites: own submitted job; Pending acceptance, no dispute hold.
- Effect: Customer acceptance event.
- Denials: DISPUTED; STALE_VERSION; FORBIDDEN.
- Boundary tests: X14,X15.
- Pending policy: No silent auto-acceptance.

### requestCorrection

- Phase and actor: D; Owning Customer.
- Resource and prerequisites: own submitted job; Correction allowed/current version.
- Effect: Correction request, job still open.
- Denials: INVALID_TRANSITION; FORBIDDEN.
- Boundary tests: X14.
- Pending policy: Time window policy pending.

### openDispute

- Phase and actor: D; Customer/Worker.
- Resource and prerequisites: related job; Eligible actor and proper reason.
- Effect: Independent dispute/hold case.
- Denials: DUPLICATE; FORBIDDEN.
- Boundary tests: X15.
- Pending policy: Resolution policy/human operator pending.

### verifyExternalPayment

- Phase and actor: D; Trusted provider-reconciliation boundary.
- Resource and prerequisites: payment reference; Verified authentic provider/bank proof, amount/currency/dedup.
- Effect: Ledger event only once.
- Denials: UNVERIFIED; DUPLICATE; MISMATCH.
- Boundary tests: X16,X17.
- Pending policy: Provider and commercial payment policies absent: keep disabled.

### closeJob

- Phase and actor: D; Trusted lifecycle operation.
- Resource and prerequisites: job and linked cases; Approved closure policy, no blockers, financial state respected.
- Effect: Closed work with immutable history.
- Denials: DISPUTED; PAYMENT_PENDING; POLICY_REQUIRED.
- Boundary tests: X15,X16,X19.
- Pending policy: Closure policy pending.

### openAftercareCase

- Phase and actor: D; Authorized Customer/Worker.
- Resource and prerequisites: prior job; Original order ownership/eligibility.
- Effect: Linked independent aftercare record.
- Denials: FORBIDDEN; INELIGIBLE.
- Boundary tests: X19.
- Pending policy: Warranty and eligibility terms pending.

### kaelReadContext

- Phase and actor: E; Scoped Kael tool.
- Resource and prerequisites: delegated case; Validated identity+delegation+resource, minimal projection.
- Effect: Redacted read result and audit.
- Denials: FORBIDDEN; RATE_LIMITED.
- Boundary tests: X20,X21,X24.
- Pending policy: AI provider not approved; no model invocation.

### kaelSuggestAction

- Phase and actor: E; Scoped Kael tool.
- Resource and prerequisites: case suggestion; No business mutation, validated output.
- Effect: Untrusted suggestion, explicit provenance.
- Denials: INVALID_OUTPUT; PROVIDER_UNAVAILABLE.
- Boundary tests: X20,X21.
- Pending policy: AI provider absent; non-AI/manual substitute clearly labeled.

### kaelRequestApprovedCommand

- Phase and actor: E; Trusted tool gateway.
- Resource and prerequisites: specific command target; Actor approval tied to exact version and current ACL.
- Effect: Calls same backend business command.
- Denials: FORGED_CONSENT; STALE_VERSION.
- Boundary tests: X20,X21.
- Pending policy: No unapproved consequential automation.

## Owner decisions still required

Pricing authority, matching and invitation rules, independently established Worker
eligibility, deposit and refund terms, payment provider and reconciliation,
acceptance and revision windows, safety recovery, dispute authority, aftercare
terms and Kael provider/data/approval policies are not established by this
reference. Missing decisions do not authorize an automatic outcome.

## Verification obligations

X01–X24 cover identity changes, mode versus permission, stale agreement,
duplicate commands, assignment races, grant revocation, job context, execution
guards, delays, scope consent, safety holds, acceptance/dispute races, payment
evidence and replay, post-commit delivery, aftercare, delegated tools, provider
failure, stale projections, local isolation and notification identity. Each
implemented boundary needs positive and forbidden tests; concurrency claims
require independent database sessions. Native devices, hosted systems and real
providers require separate evidence.

## Implemented local boundaries

These are local fixture contracts, not commercial dispatch or provider
contracts. PostgreSQL owns persisted facts. Mutation RPCs derive the actor from
Auth and use a restricted private function when transaction authority is needed.
Tables that both participants can read grant only named columns, so no account
id, idempotency token or private decision reason reaches the other party. Quotes
and offers carry a basis; the apps label every `local_fixture` quote or offer as
a test and refuse to accept any other basis.

| Operation | Actor and guard | Atomic result and retry |
| --- | --- | --- |
| Submit request | Authenticated non-anonymous owner; valid description | One owner-scoped request per key and payload; conflicting reuse fails |
| Accept or reject quote | Owner; current quote, exact version and server expiry | Actor and decision time recorded; exact replay returns the quote |
| Accept invitation | Invited Worker; current grant, fixture eligibility, accepted exact quote and unexpired invitation | Request lock and unique job permit one winner; replay returns that job |
| Decline invitation | Invited Worker; current grant, fixture eligibility, exact quote and expiry | Decline recorded; replay returns the invitation; no rematching starts |
| Advance work | Assigned Worker; current grant, fixture eligibility, job version and legal stage | Job and versioned event commit together; identical replay returns its original version; a pause is not an advance |
| Pause work | Assigned Worker; a category of ordinary interruption or safety concern; legal stage before submission | Pause record (category, prior stage, version), job version and event commit together; an identical retry returns the original version; a submitted, disputed or completed job cannot be paused; an ordinary pause can be escalated to a safety stop |
| Request to resume | Assigned Worker with current grant and eligibility; ordinary pause only; no undecided scope proposal; no dispute | Request, new job version and event commit together; a safety stop has no request path |
| Agree to resume | Owner; the exact job version produced by the request; the requesting Worker still holds an active grant and eligibility; no dispute | The job returns to the recorded prior stage; a duplicate agreement returns the original version; a concurrent escalation or agreement resolves to one transition |
| Report delay or no answer | Assigned Worker; grant, fixture eligibility, stage and version | Report, version and event commit together; key binds details; no automatic fee or schedule change |
| Propose fixture scope | Assigned Worker; grant, fixture eligibility, working job and version | Immutable old/new terms, rationale and event; key binds payload |
| Decide fixture scope | Owner; exact proposal sequence and job version; job working or paused | Decision and event commit together; original quote stays unchanged; a safety pause never leaves a proposal undecidable |
| Submit work | Assigned Worker; grant, fixture eligibility, working stage, version and no pending scope | Evidence, submission and event commit together; key binds version and evidence |
| Accept, request correction or dispute | Owner; pending submission, job version and required reason | One decision and event; dispute creates a separate case; exact replay is safe; only the correction note is Worker-readable and the private reason is not exposed to any client; the Worker screen shows the note while the newest submission of the job is the correction request |
| Open aftercare | Owner; completed job and case key | Linked case created once without changing the job or event history |
| Read Kael context | Owner of request or currently eligible assigned Worker | Redacted deterministic projection; allowed and unavailable calls audited within a per-minute budget; the first rate-limited call in each minute is audited |
| Issue fixture quote | Active `local_fixture` operator in `nestscout_private.fixture_operators`; no accepted quote and no job for the request | Next quote version with server expiry (5 minutes to 7 days); the issue key binds scope and amount; a newer version makes older ones stale |
| Invite fixture worker | Same operator; accepted quote; no job; a Worker the operator names who holds an active grant, fixture eligibility, a complete basic profile and open availability and is not the requester | One open invitation per Worker and request under the request lock; inviting again returns it; no automatic selection. A local fixture Worker does not need to upload identity documents; public listing still does |
| Set preferred visit | Owner; one hour to sixty days ahead; no job yet | Stored on the request as the customer's wish and shown on offers; never an appointment; clearing is allowed |
| Rate a Kael reply | Owner of the assistant message, addressed by message id or run id | One rating per reply with a closed set of reasons; clearing deletes it; included in the data export and erased with the messages |

A pause carries its category, the stage it interrupted and the job version it
was made from. An ordinary interruption can be resumed only when the Worker
asks and the owner then agrees to the exact job version produced by that
request, so a scope decision, a second pause or a revocation in between makes
the agreement stale. A safety stop never resumes in this local foundation: no
clearance authority, operator role or override exists, and the database refuses
to record a resume for it. A disputed job accepts no further command, and a
no-answer report blocks the start of work, whatever pause cycle precedes it.
Neither case applies a fee, refund, penalty or payout; both screens say that a
manual process outside the application is required.

The Worker correction note comes from `worker_corrections()`, which returns at
most one row for each job of the caller: the newest submission, chosen by the
submission version that is unique within the job and never by timestamp, and
only when that submission is a correction request. The Worker screen refuses a
page of 1000 rows as possibly truncated, because the API row limit is 1000.
When any part of the Worker snapshot, including the correction projection,
cannot be verified, the screen keeps the last verified state as stale
read-only information, disables every action and form, and offers a refresh.

Open pauses are read through `worker_pauses()`, limited to the caller's Worker
jobs, or `customer_pauses()`, limited to the jobs of the caller's own requests,
so an account that uses both modes receives only the rows of the mode it is
reading and never a row the screen cannot place.

Workflow failures are classified by the database error class together with a
closed set of the domain messages written in the migrations, and the client
shows a fixed text for each class, never the server text. The classes are
authorization, stale version, expired agreement, unavailable offer, invalid
input and a step that is no longer available; anything else is an uncertain
outcome that keeps its idempotency key.

Request intake has no per-account quota or rate limit. The direct insert and
the command share the size bounds and the owner and guest checks, but only the
command replays a key. The mobile configuration refuses every hosted target, so
this repository enables no public intake. A quota needs numbers approved by the
owner and one enforcement point that covers both paths.

The Worker job list is not paginated. Beyond 1000 jobs the Worker screen reports
that activity cannot be verified instead of showing a truncated list.

Dispatch outcome and recovery are local fixture behavior, and PostgreSQL is the
only authority for them. `nestscout_private.dispatch_request` is the single entry
for every round and returns a structured outcome (`invited`, `no_eligible_worker`,
`limit_reached`, `cooldown`, `already_searching`, `already_assigned`, `cancelled`,
`needs_service`, `dispatch_disabled`, `invalid_request`), so an empty round is
never reported as success. Every round is recorded in `service_dispatch_rounds`
with its outcome and without naming a worker. Automatic rounds (`quote_accepted`,
`declined`, `expired`) are bounded by `max_rounds`. Customer-started rounds
(`manual_retry`, `recovery`) have their own budget, `max_manual_retries`, a
`retry_cooldown_minutes` cooldown after a round that invited workers, and a
shorter `empty_retry_cooldown_seconds` rate limit after an empty one. A worker is
not invited again while an offer is open, after accepting or after a cancelled
offer; a declined or expired offer is excluded for
`reinvite_declined_after_minutes` and `reinvite_expired_after_minutes`, and
`max_invites_per_worker` caps the total.

An offer that lapses is closed by `nestscout_private.sweep_expired_invitations`,
which `schedule_dispatch_sweeper` runs every minute through pg_cron when that
extension is installed (the migration reports `pg_cron not installed` otherwise,
and the same function can be called by an operator). The sweep takes the request
row lock with `skip locked`, so overlapping ticks and concurrent customer or
worker actions are serialized and each lapsed offer is expired once. Until a
sweep runs, the summary reports `recovering` rather than `searching`, and an
accept or decline of a lapsed offer is refused with `invitation expired`.

`get_dispatch_summary` derives `searching`, `awaiting_acceptance`, `recovering`,
`no_match`, `exhausted`, `needs_service`, `not_dispatched`, `assigned` and
`cancelled` at read time, with `can_retry`, `can_cancel`, `can_reclassify`,
`next_retry_at`, `retries_left` and `last_outcome`. A request submitted before
automatic dispatch existed, or without a service category, is recoverable by its
owner: `retry_service_dispatch` starts the first round for an accepted quote that
never dispatched, and `set_request_service` fills a missing service once. Nothing
is invented for old requests. `redispatch_service_request` remains the strict
form and raises on any outcome other than `invited`; its optional `p_expected_round`
returns the original invited count when that round already exists, so a replayed
Kael approval cannot invite twice. The customer can cancel with
`cancel_service_request` until a worker accepts; a cancelled request withdraws
its open invitations and refuses a later quote acceptance, offer acceptance or
decline.

An assigned worker can leave, and the customer can replace one who never
arrives. Both paths run `nestscout_private.release_job` under the request-row
lock and archive instead of editing: the job row moves to `service_job_releases`
with its events and reports as jsonb, then the job is deleted, so every reader of
`service_jobs` keeps working unchanged. `release_service_job` (worker) is allowed
only while the job is `assigned` or `en_route`; after arrival the worker has no
exit and the case belongs to support or a dispute. `request_service_reassignment`
(customer) follows `nestscout_private.job_recovery`, which derives the action and
the moment it becomes available from the job's own stage, not from a single
inactivity clock:

| Stage | Customer action | Available from |
| --- | --- | --- |
| `assigned` | `reassign` | the later of the job's creation (or last resume) and the preferred visit, plus `visit_grace_minutes` (default 30); without a visit time, creation plus `assigned_response_minutes` (default 120) |
| `en_route` | `reassign` | `en_route_arrival_minutes` (default 120) after the worker started travelling, and not before the visit time plus `visit_grace_minutes` |
| `paused` before arrival (ordinary interruption only) | `reassign` | `assigned_response_minutes` after the pause began, and not before the visit grace |
| `arrived` | `escalate` | `arrival_escalation_minutes` (default 60) after arrival |
| `working`, `submitted`, `completed`, safety or dispute pauses | none | not applicable |

Before the moment, `request_service_reassignment` refuses with `worker still has
time`; at any stage whose action is not `reassign` it refuses with `release not
allowed at this stage`. Release is blocked only by work that cannot be archived
safely: a pending change request, a pending scope change, a submission, a
support case or a review. Events, reports, pauses and change requests of the
released job are archived with it. After arrival the customer never replaces the
worker automatically. `escalate_service_job` records one report per job
(`service_job_escalations`), notifies the worker with `job_escalated`, leaves the
job and its stage untouched and is idempotent on a key; a second call reports
`already_escalated`. An active beta operator receives the report as an
`escalation_received` notification and handles it (see the next section). All four timers are global settings in
`nestscout_private.auto_dispatch_settings`. Both release paths are idempotent on
a key and refuse a stale job version. A release keeps the
releasing worker's invitation as accepted, so that worker is not invited again,
opens a `worker_released` dispatch round that ignores the automatic round cap and
the manual retry budget (a handover is not a customer retry), and notifies the
other side (`job_released` to the customer, `job_withdrawn` to the worker).
`get_dispatch_summary` reports `job_stage`, `can_reassign`, `reassign_at`,
`can_escalate`, `escalate_at`, `escalated_at`, `escalation_status` and
`escalation_resolution` for an assigned request. Kael does not read them and has no reassignment effect: handing a
request to another worker is a customer decision in the Requests screen, behind
a slide to confirm.

Escalation handling is done by a beta operator. The capability is a row in
`nestscout_private.operator_grants` (basis `beta_program`): a named account, a
reference to the owner's authorization, an expiry within 90 days of the grant and
an optional revocation. Only the database owner can write it, through
`nestscout_private.grant_beta_operator(user, reference, days)` and
`revoke_beta_operator(user, reference)` run from the SQL editor; no client or
trusted-server role can grant it, an anonymous account cannot hold it, and every
grant or revocation is appended to `operator_grant_events`. The fixture operator
rows that gate fixture quotes and invitations are a separate local capability
and do not open the queue. An operator can never review or decide a case on a
request they own or are assigned to. A report moves through `open`, `reviewing`
and `resolved` on `service_job_escalations`:

| Operation | Caller | Effect |
| --- | --- | --- |
| `operator_access` | Any signed-in account | Zero rows unless the caller holds an active grant; otherwise the grant expiry and the number of unresolved cases, which drives the persistent entry. The entry is the "Xử lý sự cố" row under "Vận hành" on the "Tài khoản và đăng nhập" screen, reached from the "Hỗ trợ" group of the sidebar; accounts without a grant do not see it |
| `operator_escalation_queue` | Active operator (read only) | Up to 100 unresolved reports, oldest first, with request text, location, worker name, job stage, `review_state` (`unclaimed`, `mine`, `held`, `stale`), review expiry and takeover count |
| `review_service_escalation(id, key)` | Active operator | `open` becomes `reviewing` and records the reviewer. The holder repeating it with a new key renews the claim and gets `already_reviewing`; another operator gets `already_reviewing` while the claim is fresh and `taken_over` once it is stale; `already_resolved` once resolved |
| `resolve_service_escalation(id, resolution, note, key)` | The operator who holds the review | `proceed` and `dismiss` only record the decision; `replace_worker` releases the job through `release_job` as role `operator` with reason `operator_decision`, archives its history in `service_job_releases` and opens a `worker_released` dispatch round. Another operator is refused with `review held by another operator` |

A claim is stale when `auto_dispatch_settings.review_timeout_minutes` (default 30)
has passed since it was taken or last renewed, or when its holder's grant has
expired or been revoked. A takeover appends the previous holder, the reason
(`timed_out` or `operator_unavailable`) and the new holder to `review_history`
and increments `takeover_count`; the former holder can no longer resolve the case.
While a claim is stale the participants see the case as `open` again, so the
customer is never shown a review that nobody is doing. Nothing runs on a
schedule: staleness is evaluated when the case is read or reviewed.

The case row is locked first, then the job and the request, so concurrent
decisions are serialised: one is recorded and the others report
`already_resolved`. A replacement is refused with `release not allowed at this
stage` once the worker has started, and with `job has open changes` while a
change request is pending; the case then stays in review. A decision notifies
both participants once (`escalation_resolved`, with the operator note); a
replacement tells the worker `job_withdrawn` instead. Participants read the
case through RLS but not its reviewer, resolver, history or operation keys. The
mobile app shows an Operations entry, "Xử lý sự cố", in the account screen for
an account with an active grant, and also opens the queue from the operator's
`escalation_received` notification (section `operator-escalations`). An account
without an active grant is refused and sees no cases. If the access check fails
the entry is hidden rather than guessed.

Worker capacity is enforced where a job is created. A worker's active jobs are
those whose stage is not `submitted` or `completed`; `max_active_jobs_per_worker`
(default 3) caps them, and `visit_conflict_minutes` (default 120) refuses a
second job whose preferred visit falls within that distance of an active one.
Dispatch skips such workers when it picks candidates, `assign_invitation` takes a
per-worker advisory lock before it counts so two simultaneous acceptances cannot
both pass, and `auto_accept_invitation` applies the same check. A refusal reads
`worker at capacity` or `schedule conflict` (SQLSTATE `40001`).

Kael reads the same summary and can retry or cancel, but only through
`service_request_redispatch` and `service_request_cancel`: each is a confirmed
effect bound to the request and, for a retry, the round count read, validated again
by the database at request and at consumption. The migration must be applied
before the mobile client or the `kael` function that reads it is deployed.

No endpoint confirms payment. A quote, work submission, acceptance, support case
or status explanation cannot establish settlement. No model provider,
notification delivery, automatic dispute resolution, real dispatch or Worker
qualification process is configured. Manual controls remain available when the
status tool is unavailable.

The operator queue and candidate lists are read-only calls, so they check the operator
without taking a lock and work inside PostgREST's read-only transactions; the issue and
invite commands keep the locking check. Quotes and invitations are created only by the fixture operator commands above,
for local and test use. There is no operator screen, no pricing model and no
automatic dispatch; a commercial pricing or dispatch policy is still an owner
decision. The database raises SQLSTATE `40001` for a stale version or an
already-assigned request, and in-database callers rely on it. PostgREST would turn
that code into HTTP 500, which the hosted API gateway does not answer promptly, so
each public RPC that can reach it translates the error through
`nestscout_private.raise_conflict` into HTTP 409 with the body
`{"code":"40001","message":"<reason>","details":null,"hint":null}`. Kael and the
mobile client treat the response as a definitive refusal, because the transaction
rolled back, while a 5xx response without a recognised code stays an uncertain
outcome.

## Kael capability boundary

Kael separates three things that must never be merged. What the user wants
(question, advice, writing, research, planning, an explicit operation, an
interruption) is interpreted freely by the model and grants nothing. Which
operation may read or change which resource is decided per operation from the
verified account, its current Customer or Worker capability, the target resource
and its current state. How much consent an operation needs is fixed by its
execution class. A BPMN phase is a process grouping and the Customer/Worker mode
is a presentation context: neither authorizes an operation, and mode can only
narrow the operations offered, never add one.

The `toolRegistry` in `services/kael-core/src/tools.ts` is the single source of
each operation's execution class, resource, required capability, mode and
owner gate; the policy evaluator and the database enforce it independently, and
`scripts/kael-core.test.mjs` fails when the table below drifts from it: the
class, resource, required capability, mode and owner gate of each row must match
the registry, and every backend command named in the Business command column must
be one the executor actually calls (and every command it calls must be named here).
Business invariants themselves are proven by the executor, the SQL guards and their
negative tests, not by this table.

| Kael capability | Execution class | Resource | Required verified permission | Business command | BPMN activity | Exception path |
| --- | --- | --- | --- | --- | --- | --- |
| `task_create` | internal_prepare | kael_task | Signed-in non-anonymous account | None; agent work state only | Any phase: coordination | Limit or invalid status is reported; no business record changes |
| `task_update` | internal_prepare | kael_task | Same account; current task version | None; agent work state only | Any phase: pause, resume, switch | Completion without an observed effect is refused; a business record is never cancelled; closing a task keeps any unresolved submission checkable |
| `service_request_draft` | internal_prepare | kael_task | Customer capability; client mode | None; the draft stays in the task | B intake: prepare request | Missing essentials keep the task waiting for input (B01) |
| `service_request_submit` | explicit_confirmation | service_request | Customer capability; client mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `submit_service_request` with the approval id as submission key | B intake: submitRequest | Rejected keeps the draft; approving or rejecting from another conversation, with another fingerprint, after expiry or a second time changes nothing; an unverified, contradictory or concurrently changed result is reported as uncertain, pauses or keeps the task and is offered as a "Kiểm tra lại" check that reconciles the original approval with the same key, from any conversation of the account, also after a restart or after the Kael task was closed; no confirmation can be opened or used for the account meanwhile; disabled gate is unavailable |
| `ask_user_choice` | internal_prepare | kael_task | Signed-in non-anonymous account | None; emits one question with tappable answers | Any phase: collect a missing detail | The answer arrives as the user's next message; no business record changes and the question is never a confirmation |
| `service_quote_decision` | explicit_confirmation | service_quote | Customer capability; client mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `accept_service_quote` or `reject_service_quote` with the exact quote version, after a read of `service_quotes` | B agreement: acceptQuote, rejectQuote | A newer, expired, accepted or rejected quote is refused before and after confirmation; success is recorded only when the quote row shows this account's decision; an accepted quote is never reported as a booking |
| `service_request_redispatch` | explicit_confirmation | service_request | Customer capability; client mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `redispatch_service_request` with the dispatch rounds returned by `get_dispatch_summary`, after reads of `service_requests` and `get_dispatch_summary`, with `service_dispatch_rounds` as the evidence | B dispatch: retryDispatch | Only the account's own uncancelled request that the dispatch summary reports as retryable; a changed round count, an active search, the cooldown, the retry budget or a missing eligible worker refuses the step before and after confirmation; success is recorded only when the next `invited` dispatch round is observed, and an invitation is never reported as an assignment |
| `service_request_cancel` | explicit_confirmation | service_request | Customer capability; client mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `cancel_service_request`, after a read of `service_requests` and `get_dispatch_summary` | B intake: cancelRequest | Only the account's own request with no assigned job; open invitations are closed in the same transaction; success is recorded only when the request row shows its cancellation |
| `work_submission_decision` | explicit_confirmation | service_submission | Customer capability; client mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `decide_service_submission` with the exact job version, after reads of `service_submissions` and `service_jobs` | D acceptance: acceptWork, requestCorrection | Only a pending submission of the account's own submitted job; a correction needs the user's reason; acceptance is reported without implying payment |
| `worker_offer_decision` | explicit_confirmation | worker_offer | Worker capability (grant and eligibility); worker mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `accept_service_invitation` or `decline_service_invitation` with the exact quote version, after a read of `worker_offers` | C assignment: acceptInvitation, declineInvitation | An expired, changed or already assigned offer is refused; success is recorded only when this Worker's job or declined invitation is observed |
| `worker_job_advance` | explicit_confirmation | worker_job | Worker capability (grant and eligibility); worker mode; `KAEL_ENABLED_EFFECTS` lists it at request and at execution | `advance_service_job` with the exact job version, after a read of `worker_jobs` | D execution: markEnRoute, confirmArrival, startWork | Only the next legal stage of the Worker's own job; pauses, scope and submission stay in the Jobs screen; success is recorded only when the versioned job event is observed |
| `customer_requests` | authorized_read | service_request | Customer capability; client mode; row-level security | Reads of `service_requests`, `service_quotes`, `service_jobs` and `service_submissions`, and `get_dispatch_summary` | B–E: own request, quote, dispatch outcome, job stage and pending submission | Backend error is reported; other accounts' rows are never returned |
| `worker_jobs` | authorized_read | worker_job | Worker capability (grant and eligibility); worker mode | `worker_job_cards`, `worker_offers` and `worker_jobs` | C–D: Worker offers and assigned jobs with versions | Empty for an account without Worker access |
| `worker_earnings` | authorized_read | worker_earnings | Worker capability; worker mode | `worker_earnings` | F: recorded earnings, not settlement | Empty for an account without Worker access |
| `worker_job_status` | authorized_read | worker_job | Worker capability; worker mode; assigned job | `kael_read_context` | D: kaelReadContext | Unavailable or rate limited; no other Worker's job |
| `web_search` | authorized_read | public_web | Owner enabled `KAEL_WEB_SEARCH` with a key | Perplexity Search API, query only | Any phase: research | Unavailable; Kael says the answer may be outdated |
| `knowledge_search` | authorized_read | knowledge | Customer capability; signed-in account; knowledge enabled; publication and RLS | `kael_knowledge_search` | Read-only explanatory side path | Current permitted product facts and synthetic cases; no business transition |
| `price_estimate_preview` | authorized_read | knowledge | Customer capability; signed-in account; knowledge enabled; numeric preview requires explicit loopback configuration | `kael_knowledge_search` | Read-only estimate side path | Disabled by default; synthetic prior never writes a quote or changes a job |

Conversation needs no operation. Explanations, advice, writing, translation,
planning and research questions are answered without a task, an approval or a
business read, and a refused or unavailable operation is reported to the model as
that single operation, so Kael keeps helping with the rest of the message. A
refusal of protected data is not a licence to guess: the prompt tells Kael never to
infer, reconstruct or claim access to the records it was refused. A plain-language
request can start an operation that needs no app confirmation; it never stands in
for the confirmation an `explicit_confirmation` operation requires.

Consent is bound to one operation. A confirmation card appears only for an
`explicit_confirmation` operation the model proposed on a complete draft. It is
bound to the account, the task and its version, the exact arguments (SHA-256
fingerprint), the conversation, a 15-minute expiry and single use. Agreement
typed in chat is never consent, and Kael cannot approve on anyone's behalf.
Before execution the gateway reauthorizes the account's capability and mode and
rechecks the owner gate inside the same database transaction that consumes the
approval, including on reconciliation. Rejecting is bound the same way: the
verified account, the running turn's conversation, the fingerprint and a pending,
unexpired approval, so a reject from elsewhere or a replayed reject changes
nothing. The effect calls the same business command a Customer uses manually, with
the Customer's own token. Consuming records which run executes the effect and the
task version it left. `kael_complete_approval` then locks the approval and the
task together, accepts only that run, and records success only when the created
request belongs to the account and carries the approval's submission key and the
task can move from running to completed; if the task changed meanwhile it records
an uncertain outcome and leaves the task as it is. A verified outcome is
never overwritten by a retry. The user and the event stream hear "sent" only from
that persisted, verified result (task completed, outcome succeeded, the same
request id), and "not received" only when the business command refused the
request and the database recorded that failure. Anything else, including a
conflict, a failed verification call or an HTTP refusal the database did not
record, is reported as uncertain, never as a definite failure when the request may
exist.

An uncertain outcome is reconciled, never retried as a new operation. When the check
itself is refused by the database or the gateway (a timeout, a serialization failure, a
conflict or a permission refusal), the executor reads the row the effect would have
written and reports success only when that row proves the operation (the quote
decision, the submission decision, the accepted or declined invitation, the advanced job
stage); otherwise the outcome stays uncertain. A first attempt that the database refuses
remains a definite failure. The app
shows it as a separate "Kiểm tra lại" card with no slide-to-confirm and no
decline, and sends a `reconcile` action carrying the original approval id and
fingerprint. `kael_consume_approval` with the `reconcile` intent accepts only an
approval that was already consumed and whose outcome is unknown; a pending
confirmation is refused as `unconfirmed` and left untouched, so a check can never
stand in for consent. The check reruns the effect with the original approval id as
its submission key: a request that already landed is returned instead of
duplicated, and one that never landed is completed as that same submission. It
needs no new confirmation and no phase-level approval, because it can only finish
the one operation the user already confirmed. A check is refused as `busy` while
another run is still executing the same approval, and only the run that is
checking it can record its outcome.

The reconciliation record is the approval, not the Kael task. Cancelling, failing
or replacing a Kael task, or starting a new conversation, stops agent work only:
it never changes the approval, its outcome or its submission key, and Kael has no
operation that cancels or withdraws a submitted service request. A check of a
cancelled or failed task records the real outcome on the approval and, when the
request exists, links it in the task's artifact while the task keeps its closed
status; the user is told the request exists and that closing the Kael task did not
cancel it. A check may run from any conversation of the same account in Customer
mode, including a new one; confirming and declining stay bound to the conversation
that showed the card.

While any confirmed submission of the account has an unknown outcome,
`kael_request_approval` refuses a new confirmation (`unresolved`) in every task and
conversation, and `kael_consume_approval` refuses to use a confirmation that was
opened earlier, which stays pending. Neither the model nor the user can therefore
create a second submission key while the first may already exist. No request text
is compared: an independent request waits only until the earlier one is checked,
then it is confirmed normally. Both paths take the same per-account lock, so two
concurrent confirmations cannot slip past each other. If a check stays uncertain
(for example while the backend is unreachable), Kael confirmations stay paused for
that account and the manual Requests screen remains the fallback.

After a restart, the app reads `kael_conversation_state(mode)` with the user's own
token. It returns the account's latest conversation in that mode (ordered messages,
task view fields, whether a turn is still running), confirmations (`kind:
confirm`) of that conversation that are pending, unexpired and still match their
task version, and checks (`kind: reconcile`, no expiry) for every consumed approval
of the account in that mode whose outcome is uncertain, or unknown with no run
still executing it, whichever conversation it came from and whether or not its
task was closed. Each carries display fields and the fingerprint but not the
executable arguments; a check from another conversation brings no other part of
that conversation. A late result from a previous account or mode is discarded, a
stream that breaks is treated as interrupted and reconciled from this read, and an
expired confirmation leaves the screen. After every decision the app rereads the
pending confirmations and checks, so a decision the server refused without
consuming the confirmation (busy, mismatched, unavailable, unresolved) brings the
card back; if the read itself fails, the card is restored locally unless the turn
completed. "Trò chuyện mới" starts a new conversation locally and keeps only the
account's checks on screen; switching account or mode clears them. Stored history
is not deleted, so the menu offers no delete action until a retention and deletion
policy exists.

Kael-internal state (runs, messages, tasks, tool audit and approvals) is written
only by the gateway. It verifies the account with Supabase Auth and then calls
eight named RPCs with the server credential and the verified account id; those
RPCs are executable only by `service_role`, check the account is a real,
non-anonymous, unbanned user and repeat every ownership, version and transition
guard. No generic server path exists, and signed-in clients keep read access to
their own Kael rows only. The ordinary Customer and Worker business commands are
unchanged and remain directly usable under their own authorization. The eight-RPC
allow-list is enforced in the gateway code, not by the credential: the legacy
`service_role` key itself bypasses row-level security and could reach any table,
so it must stay in the Edge Function environment and never be given to another
client. The gateway accepts only the legacy service-role JWT; an opaque
`sb_secret_` key is refused at configuration time until that path is verified
against the hosted gateway. Supabase states that legacy keys keep working until the
end of 2026, so moving to secret keys is a release prerequisite.

No operation uses the `bounded_self_service` or `privileged_or_financial`
classes. En-route, arrival, delay and scope commands stay manual Worker actions,
and quote acceptance, scope approval, payment, refund, dispute and assignment have
no Kael operation. Adding one needs an owner-approved policy, a registry entry, a
row here and its own allow and deny tests. Guest conversation is not offered: the
gateway requires a verified account before any billed model call, and offering
it to guests is an open product and cost decision.

## Source ownership and consumers

| Paths | Owner and caller | Verification and dependency |
| --- | --- | --- |
| Mobile access state and guest screen | Access owns the in-memory guest draft; guest and Customer screens consume it | Reducer and navigation tests; draft is not automatically submitted |
| Mobile Client feature | Customer owns request, quote, scope decision, acceptance, dispute and aftercare presentations | Client tests and local Auth/REST integration |
| Mobile Worker feature | Worker owns fixture offers, job actions, evidence, scope proposals, reports and the Customer correction request it must act on | Worker tests, Auth/REST integration and database races |
| Mobile shared feature and authenticated-rest module | Shared projections and bounded status surface; both modes use the existing Supabase session | Component tests and module-boundary checks |
| create_service_requests migration | Request table and submission RPC; Customer consumer | Request pgTAP and concurrent retry |
| create_quote_acceptance migration | Quote terms and owner acceptance; Customer and assignment consumers | Quote pgTAP, expiry race and Auth/REST |
| create_worker_assignment migration | Fixture eligibility, invitations, assignment, job events and Worker projections | Worker pgTAP and two-Worker database race |
| create_work_acceptance migration | Submission, Customer decision and separate support case | Completion pgTAP and decision races |
| create_kael_context migration | Bounded read-only context and private audit | ACL, input, budget and component timeout tests |
| create_scope_change migration | Exact versioned fixture scope proposals and decisions | Scope pgTAP and integrated Customer/Worker scenario |
| add_workflow_responses migration | Quote rejection and invitation decline | Workflow response pgTAP |
| create_job_reports migration | Stage-guarded Worker reports with no financial or scheduling effect | Report pgTAP and participant projections |
| close_workflow_audit_gaps migration | Pause that cannot strand a decision, column-restricted submission reads, fixture provenance on quotes and invitations, audited rate limits | Audit-gap pgTAP, Kael pgTAP and Auth/REST race |
| expose_fixture_basis_and_hide_counterparty_ids migration | Fixture basis in the Worker offer projection; column-level reads that omit account ids, idempotency tokens and private reasons on shared workflow tables | Counterparty visibility pgTAP and Auth/REST denial checks |
| project_worker_corrections migration | Unique submission version per job and the latest-correction projection | Projection pgTAP, API row-limit and Auth/REST checks |
| classify_job_pauses migration | Pause categories, resume request and agreement, safety stop and conservative classification of pauses recorded earlier | Pause pgTAP, Auth/REST commands and two-session races |
| create_kael_runtime migration | Kael conversations, runs, tasks, approvals and audit; internal writes reachable only by the gateway's server role | Kael pgTAP and private-function ACL test |
| Kael core service and Edge Function | Gateway, policy, executor and provider adapters; the mobile Kael screen is the consumer | Kael core and evaluation tests, Kael typecheck |
| Supabase database tests and local integration test | Database ACL and real transaction/API evidence | Canonical isolated stack and test runner |
| Supabase generated database types | CLI-generated public schema artifact | Local type generation and drift check |
| Mobile package manifest and lockfile | Pinned native UUID source for durable operation keys | Expo compatibility and mobile checks |

The saved-draft state of each form belongs to one account and one job: switching
either discards the previous draft, and a late storage read for the previous
account or job cannot change the current form. Reading an unreadable draft again
never interrupts a Customer decision that is already in flight.

A proposal or report can remain pending on the originating device after an
uncertain response. Real-time subscriptions, outbound notification delivery and
payment reconciliation are not implemented and cannot be represented as
successful provider behavior.

A no-answer report is an unverified Worker statement. It does not cancel the
job or impose a fee, but it prevents starting work until an approved recovery
process exists. No recovery command is configured by this local foundation.
