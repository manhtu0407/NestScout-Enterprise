# Source evidence: fe-ios-hig-audit

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.0; adoption mode
**PROJECT_NATIVE**. This records source/static review, not runtime efficacy.

## Decision and file scope

No reusable HIG-audit package was adopted. Expo native-ui's broader implementation/dependency scope is unnecessary for a read-only platform audit.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Primary-only authorship

No installable upstream package or upstream skill name/revision is claimed.
These independently worded instructions reference public technical documentation;
no proprietary text, example implementation, asset or SDK is redistributed.
Documentation access date is not an immutable upstream revision or SDK pin.

## Technical authority and version boundary

- [ios](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios/) — Best practices: primary tasks, adaptable appearance and reachability.
- [access](https://developer.apple.com/design/human-interface-guidelines/accessibility) — Vision, Mobility and interaction alternatives; native settings require actual task tests.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.
Apple guidance was inspected through official Markdown/DocC and search-readable
content when its HTML returned a JavaScript shell. No Apple reuse license or
immutable Git SHA is claimed. Native execution remains a separate gate.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named official documentation owners above; project-native authorship is explicit. |
| Correctness and depth | Specific route/task and navigation evidence distinguish this from token consistency. Apple recommendations remain recommendations; device behavior stays a separate gate. |
| Practical validation | A keyboard-obscured action is actionable; a deliberate branded card alone is a benign decoy. Back/dismiss state must be exercised. |
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
