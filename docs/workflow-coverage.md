# Workflow coverage and historical scope

## Current navigation — 2026-10-25

Classic main protection and both required checks are enabled; the earlier coverage
register is historical. Current procedures live in [operations](operations.md),
agent behavior methodology in [agent evaluation](agent-evaluation.md), and unresolved
product choices in [architecture decisions](architecture.md). The
[hardening evidence](setup-evidence.md#foundation-hardening-2026-10-25) records fresh
checks separately from earlier setup runs. These references add no task authority.

## Governance consolidation — 2026-10-24

The root [AGENTS.md](../AGENTS.md) is the sole repository-wide engineering policy
for Codex and Claude Code. This record maps earlier rules to their current owners;
it does not grant standing authorization or create another agent policy. The
foundation coverage register below is a historical snapshot, not fresh validation.
The consolidation PR records revision-specific local and hosted verification.

### Instruction migration audit

Source labels below identify the removed AI guide and Copilot instructions as
historical inputs; they are not links to active instruction files.

| Former source clause | Decision | Retained owner or reason |
| --- | --- | --- |
| AI guide: custom filename, explicit task reference and guide discovery | REMOVE | Obsolete now that root AGENTS.md supplies policy; loading is tested per runtime |
| Both: reserved-name permission and original README preservation | KEEP | Root authority rules; reserved-file guard protects structure and original README |
| AI guide: earlier public transition and private planning Project | HISTORICAL | Setup evidence and human development/operations references |
| Both: exact repository/account/origin identity before remote writes | KEEP | Root authority and identity script; technical details in development guide |
| Both: approved scope, preserve unrelated work/repositories | KEEP | Root authority and Git safety |
| Both: no unauthorized merge/release/deploy, data/history/access/visibility/billing changes | KEEP | Root authorization; ordinary in-scope file edits/deletions distinguished from destructive operations |
| AI guide: routine approved Git and setting operations | KEEP | Task authority controls each action; no blanket standing permission |
| AI guide: read contribution, development, security and task acceptance criteria | MOVE | Root navigation; human procedures retain detailed steps |
| Both: short focused branches and linked Issue/PR workflow | MOVE | CONTRIBUTING and PR template, referenced by root Git rules |
| AI guide: bootstrap scope in coverage record | HISTORICAL | Original approved foundation recorded below, not a new task grant |
| Both: no invented stack, server, metrics, suite or results | KEEP | Root architecture, investigation and evidence rules |
| Both: Node 24, locked npm setup and verified native tools | KEEP | Root setup summary; manifest, tool pins and development guide remain technical owners |
| Both: actual checks, no suppression to obtain green CI | KEEP | Root verification and executable CI/check scripts |
| Both: protect credentials in prompts, logs, fixtures and public output | KEEP | Root security rules; SECURITY retains incident procedures |
| AI guide: report revision, checks, limits and recovery | KEEP | Root completion/evidence and risk analysis; operations recovery procedure |
| AI guide: status labels and Free-plan blocker language | MOVE | Root uses evidence-based PASS/FAIL/BLOCKED/NOT RUN; obsolete plan observations remain historical |
| Both: static/browser evidence does not prove native behavior | KEEP | Root verification |
| Both: self-review is not independent human approval | KEEP | Root Git review and human contribution procedure |
| AI guide: tooling-only package, pinned dependencies and hashes | KEEP | Root architecture/security, manifest and tools.json |
| AI guide: pinned Actions, read-only token, timeout and superseded-run cancellation | MOVE | CI configuration and operations reference; root preserves security/cost controls |
| Both: no paid runners, AI workflows, production secrets, trials or paid usage by inference | KEEP | Root security/cost/authorization rules |
| Copilot: follow the former AI guide | REMOVE | Competing instruction chain removed; no loader shim or replacement policy |

## Approved foundation (historical)

The owner approved a private GitHub Free foundation for the new
`manhtu0407/NestScout-Enterprise` project, including GitHub and AI workflows.
That task covered repo settings and scoped branch/commit/push/Issue/Project/PR work,
with the agent stopping before merge and preserving other repositories, billing,
and owner. The owner later
explicitly approved making this exact repository public to run standard hosted CI;
the planning Project remained private. That scope excluded further visibility changes,
importing HomeServices, choosing an application stack, or connecting Production.
An earlier follow-up reserved `AGENTS.md` and `README.md`, so custom documentation
names were used during bootstrap. The root policy is now explicitly approved;
original README protection remains intact.

## Foundation coverage register (historical)

| Process | Implementation or trigger | Status |
| --- | --- | --- |
| Repo identity and authentication | `npm run identity`, explicit repo arguments; CLI and connector evidence | PASS |
| Local setup and conventions | Development guide, editor/line-ending rules, ignored secret/build files | PASS |
| Intake and acceptance criteria | Bug/feature/task Issue Forms visibly available after owner merged bootstrap PR | PASS |
| Planning and prioritization | Private Delivery Project, Status/Priority/Size used on Issues | PASS |
| Development branches/commits | CONTRIBUTING and optional local hooks | PASS |
| PR review and merge procedure | Template on main, squash preference, owner reviews exact commit | PASS |
| Mandatory PR/check enforcement | Now eligible after public transition; no ruleset configured | NOT CONFIGURED |
| Documentation/YAML/workflow checks | Markdownlint, YAML parser, actionlint; real negative fixtures | PASS local and hosted Linux CI after public transition |
| Secret detection | Redacted index/history/working-file scans; staged regression | PASS local and hosted Linux CI after public transition |
| Pre-push rejection of secrets | Optional local hooks only; bypassable | PASS locally; no native enforcement |
| Dependency updates | Dependabot active after bootstrap merge; initial Actions update PRs observed | PASS; application ecosystems wait for stack |
| Native Code scanning/Secret Protection | Public eligibility changed; active state needs separate verification | NOT CONFIGURED BY THIS TASK |
| Application lint/type/unit/build/e2e | Add when stack and first executable code are approved | WAITING FOR STACK |
| Environment onboarding | Sanitized names/example plus secret-store setup when stack exists | WAITING FOR STACK |
| AI coding/review guidance | Custom AI guide, Copilot instructions, exact-repo connector | PASS setup; Copilot response UNVERIFIED |
| Versions/changelog/releases | Documented SemVer and exact-SHA draft release procedure | PASS procedure; WAITING FOR STACK execution |
| Deploy/preview/Packages/SBOM | Add only for a selected service/artifact | WAITING FOR STACK |
| Incidents/hotfix/conflicts/revert | CONTRIBUTING, SECURITY, operations runbook | PASS procedure |
| Git backup and restore | Bundle + verify + clean restore proof with matching SHA | PASS |
| GitHub metadata backup | Accessible settings/Issues/PRs exported; Projects captured via UI | PASS partial; restricted API exports UNVERIFIED |
| Monitoring/alerts/data recovery | Define with real services and data | WAITING FOR STACK |
| Access/account hygiene | Repo/app identity checked; 2FA observed disabled | PASS audit; OWNER ACTION for 2FA |
| Quota/spend management | Existing $0 Actions budget observed; no billing changes | PASS observation; recheck before new usage |
| Ongoing maintenance | Milestone/release checklist in operations runbook | PASS procedure |
| Open-source license/public community | Public repository authorized; no license selected; owner decides licensing | WAITING FOR OWNER DECISION |
| Native merge queue/attestation | Personal repo merge queue not configured; public attestation waits for artifacts | NOT APPLICABLE YET |

In this historical register, PASS procedure meant operating instructions existed,
not that a production incident/release had occurred. WAITING FOR MERGE described
the review state at that time. Subsequent owner merges and current governance are
identified above; settings and current checks require their own fresh evidence.
