# Source evidence: be-auth-rls

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.1; adoption mode
**PROJECT_NATIVE**. This records source/static review, not runtime efficacy.

## Decision and file scope

Original authorization workflow is grounded in database semantics. The broad official Supabase skill was considered but not copied; availability of its tools is not permission to mutate data.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Primary-only authorship

No installable upstream package or upstream skill name/revision is claimed.
These independently worded instructions reference public technical documentation;
no proprietary text, example implementation, asset or SDK is redistributed.
Documentation access date is not an immutable upstream revision or SDK pin.

## Technical authority and version boundary

- [rls](https://supabase.com/docs/guides/database/postgres/row-level-security) — Grants plus RLS, USING/WITH CHECK, JWT metadata and bypass paths.
- [pgrls](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) — Policy combinations, owner and BYPASSRLS boundaries.
- [pgviews](https://www.postgresql.org/docs/17/sql-createview.html) — security_invoker view behavior on supported majors.
- [Effective client authorization](https://supabase.com/kb/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) — a user session or explicit Authorization header can change the effective role despite a service-role initialization key. Rechecked 2026-10-26; no credentials or SDK code copied.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named official documentation owners above; project-native authorship is explicit. |
| Correctness and depth | Requires grants and row policies plus real effective identities. Explicitly covers view/definer/service-role bypass, user-editable claims and stale trusted claims. |
| Practical validation | Own row allowed, other row denied, owner reassignment blocked, privileged bypass inspected; anonymous sign-in is distinguished from an unauthenticated request. |
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
