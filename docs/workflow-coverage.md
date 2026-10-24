# Workflow coverage and approved scope

## Approved foundation

The owner approved a private GitHub Free foundation for the new
`manhtu0407/NestScout-Enterprise` project, including GitHub and AI workflows.
Implement repo settings and scoped branch/commit/push/Issue/Project/PR work;
stop before merge. Preserve other repositories, billing, and owner. The owner later
explicitly approved making this exact repository public to run standard hosted CI;
the planning Project remains private. Do not make further visibility changes by inference.
Do not import HomeServices, choose an application stack, or connect Production.
The owner's follow-up reserves the names `AGENTS.md` and `README.md`; new AI/setup
documentation uses custom descriptive filenames. The original README is unchanged.

## Coverage register

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

PASS procedure means the operating instructions exist; it does not claim a production
incident/release has happened. WAITING FOR MERGE is intentional: the setup is delivered
for review without bypassing the owner's merge decision. Settings outside Git can
already be active; their verified state is recorded separately.
