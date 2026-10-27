# Service workflow contracts

This contract records the 26 March 2025 workflow image as a business reference.
It does not assert that the listed commands or providers exist. The implementation
must derive the principal from authentication, authorize the resource and check
the current version and state within the same transaction as the effect. Worker
access grants are technical access, not proof of qualification.

## Ownership and dependencies

| Owner | Responsibility and consumer | Dependency |
| --- | --- | --- |
| Access feature | Session identity and mode presentation consumed by mobile screens | Existing auth gateway and Worker grant; mode is not authority |
| Client feature | Manual intake and owner-scoped projections | Authenticated request commands and current identity |
| Worker feature | Invitation and assigned-job presentation | Backend assignment, current grant and independently approved eligibility |
| Supabase migrations | Canonical data, authorization, guarded transactions and durable events | Actual commands and their callers |
| Supabase database tests | Allow, deny, replay and race evidence for backend boundaries | Isolated local database and real effective identities |
| Kael trusted boundary | Minimal delegated context and bounded actions when a real consumer exists | Explicit tool authorization; provider remains disabled without approval |

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

| Operation | Actor and guard | Atomic result and retry |
| --- | --- | --- |
| Submit request | Authenticated non-anonymous owner; valid description | One owner-scoped request per key and payload; conflicting reuse fails |
| Accept or reject quote | Owner; current quote, exact version and server expiry | Actor and decision time recorded; exact replay returns the quote |
| Accept invitation | Invited Worker; current grant, fixture eligibility, accepted exact quote and unexpired invitation | Request lock and unique job permit one winner; replay returns that job |
| Decline invitation | Invited Worker; current grant, fixture eligibility, exact quote and expiry | Decline recorded; replay returns the invitation; no rematching starts |
| Advance or pause work | Assigned Worker; current grant, fixture eligibility, job version and legal stage; pause only before submission | Job and versioned event commit together; identical replay returns its original version; a submitted job cannot be paused, and a paused job leaves only through an approved safety process |
| Report delay or no answer | Assigned Worker; grant, fixture eligibility, stage and version | Report, version and event commit together; key binds details; no automatic fee or schedule change |
| Propose fixture scope | Assigned Worker; grant, fixture eligibility, working job and version | Immutable old/new terms, rationale and event; key binds payload |
| Decide fixture scope | Owner; exact proposal sequence and job version; job working or paused | Decision and event commit together; original quote stays unchanged; a safety pause never leaves a proposal undecidable |
| Submit work | Assigned Worker; grant, fixture eligibility, working stage, version and no pending scope | Evidence, submission and event commit together; key binds version and evidence |
| Accept, request correction or dispute | Owner; pending submission, job version and required reason | One decision and event; dispute creates a separate case; exact replay is safe; only the correction note is Worker-readable and the private reason is not exposed to any client |
| Open aftercare | Owner; completed job and case key | Linked case created once without changing the job or event history |
| Read Kael context | Owner of request or currently eligible assigned Worker | Redacted deterministic projection; allowed and unavailable calls audited within a per-minute budget; the first rate-limited call in each minute is audited |

No endpoint confirms payment. A quote, work submission, acceptance, support case
or status explanation cannot establish settlement. No model provider,
notification delivery, automatic dispute resolution, real dispatch or Worker
qualification process is configured. Manual controls remain available when the
status tool is unavailable.

## Source ownership and consumers

| Paths | Owner and caller | Verification and dependency |
| --- | --- | --- |
| Mobile access state and guest screen | Access owns the in-memory guest draft; guest and Customer screens consume it | Reducer and navigation tests; draft is not automatically submitted |
| Mobile Client feature | Customer owns request, quote, scope decision, acceptance, dispute and aftercare presentations | Client tests and local Auth/REST integration |
| Mobile Worker feature | Worker owns fixture offers, job actions, evidence, scope proposals and reports | Worker tests, Auth/REST integration and database races |
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
| Supabase database tests and local integration test | Database ACL and real transaction/API evidence | Canonical isolated stack and test runner |
| Supabase generated database types | CLI-generated public schema artifact | Local type generation and drift check |
| Mobile package manifest and lockfile | Pinned native UUID source for durable operation keys | Expo compatibility and mobile checks |

A proposal or report can remain pending on the originating device after an
uncertain response. Real-time subscriptions, outbound notification delivery and
payment reconciliation are not implemented and cannot be represented as
successful provider behavior.

A no-answer report is an unverified Worker statement. It does not cancel the
job or impose a fee, but it prevents starting work until an approved recovery
process exists. No recovery command is configured by this local foundation.
