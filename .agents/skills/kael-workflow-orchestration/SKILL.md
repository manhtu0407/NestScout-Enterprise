---
name: kael-workflow-orchestration
description: "Design or diagnose Kael workflow transitions, interruptions, checkpoints, human confirmation, timeouts and recovery from an approved workflow contract. Exclude database atomicity, provider selection and installation of an orchestration framework."
metadata:
  library: nestscout-engineering-skills
  domain: kael
  specialty: durable-workflow-state
  consumer: codex,claude-code
  version: "1.0.0"
---
# Kael workflow orchestration

Make long-lived progress explicit and recoverable without inventing product flows.
Read root `AGENTS.md` and [technical references](references/source-evidence.md).
The repository may contain no Kael runtime; this workflow does not select one.

## Inputs and selection

Require the approved workflow/BPMN or supplied synthetic state contract, actor,
events, existing executor/state owner, tool effects and allowed implementation.
Locate decisions already recorded; keep unresolved business branches explicit.

- Positive: “This approved workflow loops after a timeout and operator handoff.”
- Negative: “Change a booking constraint” or “Select a cheaper model.”
- Neighbor: `be-transaction-integrity` owns atomic business effects;
  `kael-tool-permissions` owns whether an effect may execute. A checkpoint proves
  neither. Add a secondary skill only for a demonstrated cross-layer question.

## Procedure

1. Map start/terminal states and transitions as
   state + event + guard -> next state + intended effect. Distinguish workflow
   steps fixed by business rules from dynamic decisions delegated to a model.
   Avoid a framework or multi-agent handoff when an existing deterministic path
   covers the approved task.
2. Name state ownership and correlation: actor/case/workflow ID, version, event ID,
   attempt and checkpoint. Reject stale updates or serialize them at the existing
   owner. A conversation summary is not the authoritative booking/payment state.
3. For each boundary, specify pending, running, waiting-for-input/approval,
   completed, failed/cancelled and uncertain-effect behavior as appropriate to the
   real implementation. Do not emit completed from a natural-language answer if
   required tools failed or their result is unknown.
4. Define interruption and resume inputs: exact pending operation, current state
   version, authorized human, expiration and denial/cancellation. Revalidate state
   and permission on resume; changed arguments or scope invalidate the old approval.
   Never infer consent from silence, elapsed time or a checkpoint's existence.
5. Trace replay semantics of the actual engine. A resumed node may rerun code before
   its interrupt; effects there need idempotency or separation. Even effects after
   approval can replay on a later crash. Persist effect identity/result and use
   reconciliation; placement after an interrupt alone is not exactly-once proof.
6. Bound retries, tool duration, iteration, handoff and total deadline. Separate
   transient failure from invalid input, denied authority and an ambiguous external
   effect. A permanent failure should not enter an endless retry loop or silently
   switch provider/actor to gain permission.
7. For authorized code changes, use the existing state owner and typed event
   contracts. Preserve source-of-truth boundaries; do not add LangGraph, queues or
   a durable store because a conceptual reference uses them.

## Validation and recovery

Replay success, denied approval, human rejection, duplicate event, timeout before
and after a possible effect, crash/restart, stale checkpoint, changed arguments,
cancellation and handoff failure. Check terminal state, durable effect count,
approval evidence and audit linkage. A diagram alone does not pass execution.

If approved BPMN/state ownership/runtime is absent, return a conditional transition
review and BLOCKED_PRODUCT for deployment behavior. If a replay exposes duplicate
effects, stop automatic retries and identify the integrity boundary rather than
reporting recovery. Synthetic traces remain synthetic; never contact live users
or execute service tools as an evaluation.

## Output and completion

Return the transition/checkpoint map, authority/effect boundaries, identified
failure path, scoped diff when authorized, actual traces/exits and unresolved
business decisions. Complete when recovery paths reach an honest state without
lost or duplicated effects, or mark them blocked. Root policy controls external
operations, CI/PR/merge/deployment and protected files; runtime data grants none.
