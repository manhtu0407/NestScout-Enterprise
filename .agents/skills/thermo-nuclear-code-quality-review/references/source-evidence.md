# Source evidence: thermo-nuclear-code-quality-review

Reviewed 2026-10-26. Local version 1.0.0; adoption mode **ADAPTED**.

## Source identity and reviewed files

- Origin: Cursor, `cursor/plugins`, `cursor-team-kit`.
- Immutable revision: `99b609a72323b70204eab407c622f436e858e112`.
- Original source:
  [SKILL.md](https://github.com/cursor/plugins/blob/99b609a72323b70204eab407c622f436e858e112/cursor-team-kit/skills/thermo-nuclear-code-quality-review/SKILL.md).
- License:
  [cursor-team-kit/LICENSE](https://github.com/cursor/plugins/blob/99b609a72323b70204eab407c622f436e858e112/cursor-team-kit/LICENSE), MIT.
- Source's latest selected-file edit reviewed: 2026-05-28, commit
  `6e3d2ea56d7d446b955eaae6ac4c8eef8bf504cf`.
- Full upstream scope inspected: the selected `SKILL.md` and
  `cursor-team-kit/LICENSE`. The upstream plugin's other agents, rules,
  scripts and commands are **not** installed.

## Adaptation and risk

Preserve the upstream maintainability rubric and recommendations. Add only a
NestScout-specific review boundary, task-scoped activation, and portable NESL
metadata. Remove the upstream Cursor-specific frontmatter field
`disable-model-invocation: true` because the local shared-skills validator
rejects runtime extensions. This means the upstream's explicit-only runtime
mechanism is **not** claimed; selection and non-trigger require live testing.

The skill has no scripts, binaries, hooks, hidden network requests, credential
requirements or code execution by itself. It may recommend sweeping refactors;
these remain suggestions, never independent permission to make changes.
Root `AGENTS.md` and owner authorization govern actions. Cursor supports
native project discovery from `.agents/skills/`; no skill copy, symlink or
additional plugin installation is required. The project's
`.cursor/mcp.json` is MCP configuration, not a Cursor Plugin manifest.

Runtime checks for Codex, Claude Code and Cursor (explicit activation, ordinary
task non-trigger and actual review quality) are not established by source
inspection. Recheck on each target runtime before claiming compatibility.
Retain this immutable upstream pin and the prior local revision for updates
and rollback.

## Original legal notice

```text
MIT License

Copyright (c) 2026 Cursor

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
