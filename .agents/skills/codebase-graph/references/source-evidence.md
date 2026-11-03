# Source evidence: codebase-graph

Reviewed 2026-11-03 (Asia/Saigon). Local package version 1.0.0; adoption mode
**ADAPTED**. This records source/static review, not runtime efficacy.

## Decision and file scope

Retain graph querying (`query`, `path`, `explain`), the vocabulary-grounded query
expansion rule, the edge-confidence honesty rules and the code-only local build.
Remove automatic `pip`/`uv` installation, subagent semantic extraction, URL cloning, multi-repo
merge, watch mode, Neo4j/FalkorDB/MCP/Obsidian/wiki exports, post-commit hook and
`CLAUDE.md` integration, cost tracking and sponsorship text. The 797-line upstream
skill and its 14 per-agent variants are not copied.

Local files: `SKILL.md` (rewritten workflow) and this linked reference. No executable
resources, hooks, agent metadata, symlinks or upstream policy files are installed.
The skill is Markdown only and does not add a Python source file, manifest or runtime
to the repository; the graphify CLI is an owner-installed external prerequisite.

## Immutable upstream evidence

- [Graphify-Labs/graphify: graphify/skill.md](https://github.com/Graphify-Labs/graphify/blob/8e6a6d2129d4aeffc7a0e9ed79b153f7f057f42b/graphify/skill.md)
  — original skill name `graphify`; revision `8e6a6d2129d4aeffc7a0e9ed79b153f7f057f42b`
  (commit 2026-11-02T19:16:39Z); package `graphifyy` 0.9.101; Safi Shamsi and the
  Graphify contributors; Apache-2.0 with retained MIT portions. Last observed
  `skill.md` update: 2026-10-31T23:43:29Z.
- [LICENSE](https://github.com/Graphify-Labs/graphify/blob/8e6a6d2129d4aeffc7a0e9ed79b153f7f057f42b/LICENSE),
  [LICENSE-MIT](https://github.com/Graphify-Labs/graphify/blob/8e6a6d2129d4aeffc7a0e9ed79b153f7f057f42b/LICENSE-MIT)
  and [NOTICE](https://github.com/Graphify-Labs/graphify/blob/8e6a6d2129d4aeffc7a0e9ed79b153f7f057f42b/NOTICE)
  at the same revision.

Reviewed scope: the complete `skill.md` text, `references/query.md` head and
`references/hooks.md`, NOTICE, LICENSE-MIT, the `pyproject.toml` name/version/license fields,
the CLI command dispatch and the `update`/`extract` usage text, plus the README data-flow
statements. The other references (`update`, `add-watch`, `exports`, `github-and-merge`,
`transcribe`, `extraction-spec`), the 1152-file tree, workflows, Dockerfile and Python modules were
not reviewed line by line and are not installed. No signature audit is claimed and no upstream
code was executed.

## Technical authority and version boundary

Commands named in `SKILL.md` (`query`, `path`, `explain`, `update`, `extract
--code-only --out`) were confirmed to exist in the pinned `graphify/cli.py`. Behavior of
`graphify` versions other than 0.9.101 is unverified; recheck the CLI help before relying
on it. The README states code files are parsed locally by tree-sitter while documents,
PDFs and images go to a model provider, which is why the skill allows only the code-only
path. Graph accuracy on this repository's TypeScript and SQL has not been measured.

## Individual quality assessment

| Dimension | Reviewed evidence / acceptance boundary |
| --- | --- |
| Credibility/provenance | Named maintainers, immutable revision and retained notices below. Source popularity was not used as quality evidence. |
| Correctness and depth | Grounded query expansion and confidence labels are kept; a graph answer must be checked against cited source before it supports a claim. |
| Practical validation | Not run. Needs a fresh-session comparison against `rg` on a cross-file question and a single-symbol non-trigger. |
| Security/permissions | No hidden execution, install, hook, telemetry, credential read, provider call or instruction-file write is requested. Upstream asks for `pip install`, `--break-system-packages`, hooks and `CLAUDE.md` edits, all removed. |
| Compatibility/maintenance | Portable string metadata and linked Markdown only. Python is not admitted to the repository; the CLI is outside the repository. |

No efficacy score is awarded. Behavioral verdicts belong to actual isolated runs.

## Update and recovery

Recheck the pinned `skill.md` diff, notices, CLI flags and data-flow statements before
updating. Refresh natural and explicit selection with the full installed library in each
runtime. Restore only this package from its previous Git revision for recovery; preserve
unrelated skills and state. A source update never grants permission to install the CLI,
run its commands or adopt its sibling packages.

## Legal notices

This package is a modified, shortened derivative of the upstream skill instructions. The
Apache License, Version 2.0 text is available at the LICENSE link above; the upstream NOTICE
and the retained MIT text follow verbatim.

```text
Graphify
Copyright 2026 Safi Shamsi and the Graphify contributors.

This product is licensed under the Apache License, Version 2.0 (see LICENSE).

Portions of this software were contributed under the MIT License prior to the
relicensing and remain available under those terms. The original MIT license
text is retained in LICENSE-MIT.
```

```text
MIT License

Copyright (c) 2026 Safi Shamsi

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
