# Source evidence: be-edge-api

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.1; adoption mode
**PROJECT_NATIVE**. This records source/static review, not runtime efficacy.

## Decision and file scope

No endpoint-specific installable vendor skill was needed. Instructions use the actual handler contract instead of importing newer documentation helpers into an absent runtime.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Primary-only authorship

No installable upstream package or upstream skill name/revision is claimed.
These independently worded instructions reference public technical documentation;
no proprietary text, example implementation, asset or SDK is redistributed.
Documentation access date is not an immutable upstream revision or SDK pin.

## Technical authority and version boundary

- [edge](https://supabase.com/docs/guides/functions/auth) — User/service/webhook auth modes and caller-scoped versus administrative clients; helper imports are not installed here.
- [edgeerrors](https://supabase.com/docs/guides/functions/error-handling) — Response and error ownership must reflect actual runtime/consumer contracts.
- [deno](https://docs.deno.com/api/web/~/Request) — Web Request body/method interface; TypeScript types do not validate untrusted JSON.
- [Node 24 Request](https://github.com/nodejs/node/blob/cdc1b38d40cb567b7ad0b39c86addf830a0af0ae/doc/api/globals.md#class-request) — official v24.19.0 source, Class: Request, accessed 2026-10-26; browser-compatible Request is available for isolated parsing probes. No upstream text or code is imported.

A local Node v24.19.0 probe observed SyntaxError while parsing a constructed
malformed Request, before subsequent handler code. The program did not call
fetch. This supports a parsing-boundary check when a platform runtime is missing;
it does not establish deployed-handler, gateway or database behavior.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named official documentation owners above; project-native authorship is explicit. |
| Correctness and depth | Separates malformed JSON from schema validation, CORS from authentication and unknown timeout effects from retryable reads. |
| Practical validation | Malformed/oversized body, expired caller, forbidden object and timeout retain truthful statuses and effect checks; a legitimate signed webhook is not required to carry a user JWT. |
| Security/permissions | No hidden execution, feedback upload, telemetry, credentials, permission grants or implicit external write. Root policy and actual task remain authoritative. |
| Compatibility/maintenance | Portable string metadata and linked Markdown only. Runtime loading and measured task benefit require fresh evidence; static acceptance alone cannot prove them. |

No efficacy score is awarded. The proposed 85/100 source-screening heuristic is
not a standard and does not compensate for a security/license/provenance blocker.
Behavioral verdicts belong to the actual isolated runs, not this source review.

## Update and recovery

Recheck the pinned file diff, notices, declared dependencies/effects, official
versioned semantics and the positive/negative/neighbor cases before updating.
Refresh natural and explicit selection with the full installed library in each
runtime. Restore only the authorized package diff from its previous Git revision
for recovery; preserve unrelated skills and state. A source update never grants
permission to run its commands or install its sibling packages.
