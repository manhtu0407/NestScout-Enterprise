# Source evidence: fe-native-motion

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.0; adoption mode
**ADAPTED**. This records source/static review, not runtime efficacy.

## Decision and file scope

Retain purpose, interruption/velocity, runtime ownership and reduced-motion checks. Replace mandatory Reanimated/Expo installation, universal timings/style bans and feedback execution with installed-version analysis. Recipes are not copied; no native config is installed.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Immutable upstream evidence

- [expo/skills: plugins/expo/skills/expo-animation/SKILL.md](https://github.com/expo/skills/blob/d5caf7fdf8b4854351f05841a7e315ac87ad7d24/plugins/expo/skills/expo-animation/SKILL.md)
  — original name `expo-animation`; revision `d5caf7fdf8b4854351f05841a7e315ac87ad7d24`;
  Emil Kowalski (animation-specific notice), Expo distribution; MIT. Last selected-path update observed: 2026-10-22.

Reviewed scope: Complete selected animation bundle: SKILL.md, RECIPES.md, LICENSE, agents/openai.yaml. Expo root LICENSE also inspected.

Repository identity, immutable file payloads, license notices and path history
were retrieved read-only. Source popularity was not used as quality evidence.
A GitHub commit pin identifies content; no independent signature audit is claimed.
External links/transitive packages are not cleared for installation by this review.

## Technical authority and version boundary

- [motion](https://developer.apple.com/design/human-interface-guidelines/motion) — Best practices and Providing feedback: purposeful, optional, cancellable motion.
- [rninfo](https://reactnative.dev/docs/accessibilityinfo) — System accessibility settings and change subscriptions; verify supported APIs before implementation.

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
| Correctness and depth | Transform-only advice is conditional: scale does not reclaim layout height. Core Animated remains admissible where adequate; release/device evidence is required for performance claims. |
| Practical validation | Reverse/cancel a drag and change Reduce Motion mid-session; inspect final state and duplicate effects. A supported layout transition is a benign control. |
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

```text
MIT License

Copyright (c) 2026 Emil Kowalski

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
