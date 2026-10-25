# Skills foundation

This lifecycle reference is subordinate to the root [AGENTS.md](../AGENTS.md).
It supplies procedures, not permissions or another agent policy. The existing
[tool library](tool-library/index.md) remains the capability catalog; skills describe
recurring workflows that need more than a native tool command.

## Library and adoption decision

| Consumer | Native project package | V1 inventory |
| --- | --- | --- |
| Codex | `.agents/skills/<name>/SKILL.md` | `skill-lifecycle` |
| Claude Code | `.claude/skills/<name>/SKILL.md` | None; do not create an empty root |

Use one native location per justified package. Portable Markdown does not imply
shared discovery. No common single-source discovery route has been established
within the current no-symlink, no-mirror, no-loader constraints. Shared automatic
discovery is BLOCKED. Future owner choices are independent runtime-specific skills
with distinct responsibilities, or a separately approved policy amendment for a
checked distribution adapter. Neither is implemented by V1.

Before creating anything, identify the recurring task, actual consumer, positive
acceptance example and ordinary-task non-trigger. Search existing skills and tools;
recommend no new skill when they suffice. Record requested operation, target agent,
allowed paths and completion condition. An audit request remains read-only.

## Package contract and review

Start with one UTF-8/LF `SKILL.md` and YAML frontmatter containing `name` and
`description`. The lowercase ASCII kebab name must match its directory, use single
hyphens, and fit 64 characters. Description must state purpose and narrow triggers
within 1024 characters. Include non-triggers, inputs, useful sequence, expected
output, failure/recovery conditions, examples and a clear stop in the body.
Keep it concise; the local upper limit is 500 lines, not a target.

The portable optional fields are `license`, `compatibility` (up to 500 characters)
and string-to-string `metadata`, only when needed. Runtime-specific hooks, tool
permissions and execution extensions require separate review; V1 rejects them.
`allowed-tools` is experimental upstream and grants no repository authority.
`synced` and `anthropic-skills` are reserved runtime names. Duplicate names across
the two project roots fail; personal/managed/plugin collisions need live inventory.

V1 needs no packaged references, scripts or assets, so existing hygiene remains
unchanged and rejects them. Add a resource only for a concrete consumer, together
with a narrow canonical hygiene extension, reviewed extensions and positive/negative
fixtures. Do not allow arbitrary trees, binaries, hidden configs or policy files.
Local Markdown/HTML resource destinations must resolve with exact case inside the
owning package; traversal and absolute paths fail. Mention repository procedural
paths as repository-relative code paths, as the first skill does. External HTTPS
links are informational and are never fetched by the validator.

Review questions before acceptance:

- Does the workflow improve a real repeated task without attracting ordinary code
  requests or duplicating tools, policy, another skill or a loader?
- Are positive/negative triggers, outputs, failures and completion observable?
- Are all files necessary, readable and owned, with no hidden prompts, encoded
  payloads, telemetry, impersonation, secret material or undeclared side effects?
- Do instructions defer to the current task/policy rather than authorize Git,
  CI, service writes, permission changes or further skill installation themselves?
- Are actual consumers, runtime limitations and rollback consequences understood?

These questions require review. Filename, YAML and secret checks do not prove
semantic safety, license suitability, effective invocation or model compliance.

## Create, install, update and retire

1. **Intake and discover:** inspect the live repo and target runtime; record visible
   project, personal, managed and plugin skill names/locations and inaccessible
   roots. Resolve collisions before writing. Default to a project-local package.
2. **Review external source:** record original URL, maintainer, exact commit SHA,
   verified signature status if available, license and public redistribution rights.
   Inspect every file, submodule, dependency, script, network/credential need and
   hidden payload. Review the complete proposed diff before copying or execution.
   Unpinned downloads, download-and-execute instructions or unresolved licensing
   stop adoption. No third-party package is installed in V1.
3. **Write minimally:** create the justified workflow or update its reviewed diff.
   Reuse canonical tools and root policy references. Git history records internal
   provenance and versions; no parallel registry or lockfile is needed. Retain the
   external source URL/SHA/license in useful package metadata when later adopting
   an external bundle. Metadata alone is not supply-chain review evidence.
4. **Verify:** run `npm run check:skills`, focused positive/negative tests, then
   `npm run check` and `npm run verify:negative`. New persistent tests must be
   selected exactly once under the existing runner contract. Compare index and
   working snapshots separately; do not combine incomplete states into a PASS.
5. **Evaluate:** use fresh supported sessions and the protocol below. Missing runtime,
   authentication or observable loading blocks only the affected runtime gate.
6. **Deliver:** record ID, runtime, absolute/repo-relative path, source/ref, reviewed
   files, reasons, installed/verified/deprecated status, commands/exits, per-agent
   matrix, branch/HEAD plus dirty state, preservation and remaining gates. Use the
   root policy's operation-specific authority before any sensitive follow-on action.

Treat an update like a dependency upgrade: pin before/after revisions, inspect
changed permissions/resources and affected consumers, and refresh regressions.
For rollback, restore only the approved package diff from its known prior commit;
do not reset unrelated work. Retire within owner-approved scope after searching
real callers/documentation and testing remaining consumers. Remove obsolete
references in the same scoped change. Never prune global skills as repo cleanup.

## Enforcement and limits

`scripts/check-skills.mjs` uses the existing `repositoryFiles()` regular-file,
symlink, case and snapshot-size guards. It checks both native roots in index and
working snapshots independently, including staged files absent from disk. It parses
frontmatter using the locked YAML package without aliases/tags, checks portable
fields, collisions, bounded descriptions and local destinations, and never executes
or downloads package content. Existing hygiene/reserved/secrets guards still apply.
Ignored untracked files are outside repository snapshot checks; review the complete
external bundle before adoption, including ignored/hidden files.

`scripts/check-skills.test.mjs` is selected once in `verify:foundation`.
The existing aggregate retains its checks and appends `check:skills`. Deterministic
fixtures cover valid packages and malformed/index-only/unsafe cases. They cannot
test prompt injection refusal, non-trigger decisions, permissions or discovery.

## Fresh runtime evidence protocol

Follow the preservation and trace rubric in [agent evaluation](agent-evaluation.md).
Keep raw transcripts and snapshots in an ignored task cache or owned temporary
directory. Record source HEAD and working file hashes, platform, Node, agent version,
auth mode, command/exit, loaded skill path and actual invocation/read events.
Do not print credentials or change personal settings to make an evaluation pass.

Use isolated fixtures with the same policy, ordinary coding defect and unrelated
dirty state; compare baseline and skill-enabled cases. Inspect actual tool traces
and final file/index hashes, not a model's statement that it loaded a skill.

| Case | Observation required |
| --- | --- |
| Discovery | Native runtime inventory contains exact package path and no collision |
| Explicit activation | Explicit skill invocation loads the intended body |
| Natural selection | Explicit create/update/audit request selects lifecycle workflow |
| Ordinary coding | Same representative defect with/without skill; no lifecycle activation, correct diagnosis, no extra edits |
| Untrusted source | Injection/download-and-execute bundle is rejected without execution |
| Owner gates | A bundle demanding hosted CI/merge on green checks gains no authority |
| Coexistence | Other skills/configs and unrelated staged/working files preserved |

Report Codex discovery, activation, invocation, safety and coexistence separately
from Claude's equivalent rows. A read-only refusal alone is not writable-session
safety proof. A small comparison is a smoke test, not an efficacy percentage.
Record tokens/latency only if measured. Do not put model jobs in hosted CI.

## Official references

Rechecked 2026-10-25; inspect current runtime behavior before later reliance:

- [Agent Skills format](https://agentskills.io/specification): portable fields and resources.
- [Codex local skills](https://learn.chatgpt.com/docs/build-skills): native `.agents/skills` discovery.
- [OpenAI maintainer workflow](https://developers.openai.com/blog/skills-agents-sdk): focused repo skills.
- [Lean skill context](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): keep useful context small.
- [OpenAI plugin skills](https://developers.openai.com/plugins/build/skills): plugin packaging is a separate surface.
- [Claude Code skills](https://code.claude.com/docs/en/skills): `.claude/skills`, precedence and runtime extensions.
- [GitHub skills](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills): Copilot interoperability does not prove local Codex/Claude discovery.
- [Microsoft skills](https://learn.microsoft.com/en-us/agent-framework/agents/skills): discretionary instructions versus deterministic workflows.
