# Workflow coverage and approved scope

## Approved foundation

The owner approved a private GitHub Free foundation for the new
`manhtu0407/NestScout-Enterprise` project, including GitHub and AI workflows.
Implement repo settings and scoped branch/commit/push/Issue/Project/PR work;
stop before merge. Preserve other repositories, billing, owner, and visibility.
Do not import HomeServices, choose an application stack, or connect Production.
The owner's follow-up reserves the names `AGENTS.md` and `README.md`; new AI/setup
documentation uses custom descriptive filenames. The original README is unchanged.

## Coverage register

| Process | Implementation or trigger | Status |
| --- | --- | --- |
| Repo identity and authentication | `npm run identity`, explicit repo arguments; CLI and connector evidence | PASS |
| Local setup and conventions | Development guide, editor/line-ending rules, ignored secret/build files | PASS |
| Intake and acceptance criteria | Bug/feature/task Issue Forms in setup PR | WAITING FOR MERGE |
| Planning and prioritization | Private Delivery Project, Status/Priority/Size | See setup evidence |
| Development branches/commits | CONTRIBUTING and optional local hooks | PASS |
| PR review and merge procedure | PR template, squash preference, owner reviews exact commit | PASS; template waits for merge |
| Mandatory PR/check enforcement | Rulesets/Branch Protection not available for private Free | BLOCKED BY FREE PLAN |
| Documentation/YAML/workflow checks | Markdownlint, YAML parser, actionlint | See setup evidence |
| Secret detection | Redacted Gitleaks history/working-file scan; negative fixture | See setup evidence |
| Pre-push rejection of secrets | Optional local hooks only; bypassable | PASS locally; no native enforcement |
| Dependency updates | Actions and repository npm tooling; application ecosystems added later | WAITING FOR MERGE |
| Native Code scanning/Secret Protection | Not enabled for this private Free repo | BLOCKED BY FREE PLAN |
| Application lint/type/unit/build/e2e | Add when stack and first executable code are approved | WAITING FOR STACK |
| Environment onboarding | Sanitized names/example plus secret-store setup when stack exists | WAITING FOR STACK |
| AI coding/review guidance | AI working guide and Copilot instructions; entitlement verification | See setup evidence |
| Versions/changelog/releases | Documented SemVer and exact-SHA draft release procedure | PASS procedure; WAITING FOR STACK execution |
| Deploy/preview/Packages/SBOM | Add only for a selected service/artifact | WAITING FOR STACK |
| Incidents/hotfix/conflicts/revert | CONTRIBUTING, SECURITY, operations runbook | PASS procedure |
| Git backup and restore | Bundle + verify + clean restore proof | See setup evidence |
| GitHub metadata backup | Accessible settings/Issues/PRs exported; restricted fields reported | See setup evidence |
| Monitoring/alerts/data recovery | Define with real services and data | WAITING FOR STACK |
| Access/account hygiene | Repo permissions/apps/2FA observation; no stored recovery secrets | See setup evidence |
| Quota/spend management | Existing $0 Actions budget observed; no billing changes | PASS observation; recheck before new usage |
| Ongoing maintenance | Milestone/release checklist in operations runbook | PASS procedure |
| Open-source license/public community | Private project; no publication or license grant authorized | NOT APPLICABLE |
| Native merge queue/private attestation | No paid integration added | BLOCKED BY FREE PLAN |

PASS procedure means the operating instructions exist; it does not claim a production
incident/release has happened. WAITING FOR MERGE is intentional: the setup is delivered
for review without bypassing the owner's merge decision. Settings outside Git can
already be active; their verified state is recorded separately.
