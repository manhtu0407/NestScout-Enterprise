# Source evidence: qa-impact-review

Reviewed 2026-10-26 (Asia/Saigon). Local package version 1.0.0; adoption mode
**ADAPTED**. This records source/static review, not runtime efficacy.

## Decision and file scope

Retain separate spec/contracts review and proving safety assumptions through real consumers. Remove mandatory companion skills, tracker setup, model arena, formatting directives and automatic delegation. No dependent pstack package is imported.

Local files: `SKILL.md` (rewritten workflow) and this linked reference.
No executable resources, hooks, agents metadata, symlinks or upstream policy files
are installed. Legal notices below are retained verbatim where applicable.

## Immutable upstream evidence

- [mattpocock/skills: skills/engineering/code-review/SKILL.md](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/code-review/SKILL.md)
  — original name `code-review`; revision `5beb35b040e3de97e54fa9e386d7e42d15c295c2`;
  Matt Pocock; MIT. Last selected-path update observed: 2026-10-07.
- [cursor/plugins: pstack/skills/blast-radius/SKILL.md](https://github.com/cursor/plugins/blob/99b609a72323b70204eab407c622f436e858e112/pstack/skills/blast-radius/SKILL.md)
  — original name `blast-radius`; revision `99b609a72323b70204eab407c622f436e858e112`;
  Lauren Tan, pstack in vendor distribution (not the downstream backnotprop port); MIT. Last selected-path update observed: 2026-10-06.

Reviewed scope: Matt: complete code-review/SKILL.md, agents/openai.yaml and root LICENSE. Lauren: complete blast-radius/SKILL.md and pstack/LICENSE.

Repository identity, immutable file payloads, license notices and path history
were retrieved read-only. Source popularity was not used as quality evidence.
A GitHub commit pin identifies content; no independent signature audit is claimed.
External links/transitive packages are not cleared for installation by this review.

## Technical authority and version boundary

The two pinned practitioner workflows above support the method. Actual technical
claims must be checked against the changed code and its pinned dependencies.

References were checked for the stated constraints. PostgreSQL 17 matches the
inspected local configuration; it is not a probe of a running server. RN/Expo/Kael
product versions remain unselected. Before future implementation, inspect actual
versions and current official behavior rather than applying latest-doc examples.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named maintainers, immutable paths and inspected MIT notices above; downstream port is not misrepresented as original. |
| Correctness and depth | Unknown spec blocks only that review axis; downstream/state/index consumers are inspected independently. A finding needs causal behavior, not code-smell counts. |
| Practical validation | A staged-only consumer regression must be challenged; a harmless refactor/empty finding set is a benign control. An inaccessible consumer remains unproven. |
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
MIT License

Copyright (c) 2026 Matt Pocock

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

Copyright (c) 2026 Lauren Tan

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
