# Source evidence: fe-design-system

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.0; adoption mode
**ADAPTED**. This records source/static review, not runtime efficacy.

## Decision and file scope

Retain existing-system-first discovery, semantic token ownership and component-state review. Replace mandatory Expo Router colors, folder defaults, fixed scales, universal literal bans, empirical-looking drift scores and unpinned feedback execution. No upstream files are copied unchanged.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Immutable upstream evidence

- [expo/skills: plugins/expo/skills/expo-design-system/SKILL.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-design-system/SKILL.md)
  — original name `expo-design-system`; revision `d5caf7fdf8b4854351f05841a7e315ac87ad7d24`;
  Expo / 650 Industries; MIT. Last selected-path update observed: 2026-10-22.

Reviewed scope: The complete selected design-system bundle: SKILL.md, references/audit.md, references/native-slop.md, agents/openai.yaml; root LICENSE.

Repository identity, immutable file payloads, license notices and path history
were retrieved read-only. Source popularity was not used as quality evidence.
A GitHub commit pin identifies content; no independent signature audit is claimed.
External links/transitive packages are not cleared for installation by this review.

## Technical authority and version boundary

- [ios](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios/) — Best practices: primary tasks, adaptable appearance and reachability.
- [rn](https://reactnative.dev/docs/accessibility) — Names, roles, state, modal isolation and focus semantics; match actual installed RN version.

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
| Credibility/provenance | Named maintainers, immutable paths and inspected MIT notices above; downstream port is not misrepresented as original. |
| Correctness and depth | Drift is verified against real tokens and consumers, with a valid local-value control. No app or styling dependency is installed. |
| Practical validation | A consumer that overrides layout must retain that contract; label/busy/disabled state must survive loading. Literal grep hits alone do not fail. |
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

## Legal notices

```text
The MIT License (MIT)

Copyright (c) 2025-present 650 Industries, Inc. (aka Expo)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
