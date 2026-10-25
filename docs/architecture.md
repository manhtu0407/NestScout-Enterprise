# Application direction and architecture decisions

Status: **DIRECTION CONFIRMED; IMPLEMENTATION DETAILS PROPOSED**. The owner approved
the direction below on 2026-10-25. This setup records decisions and implementation
prerequisites; it authorizes no application scaffold, business schema or release.
The root [AGENTS.md](../AGENTS.md) remains the sole repository-wide engineering policy.

## Confirmed product direction

NestScout serves Ho Chi Minh City apartment residents, working toward a trustworthy
first real home-service transaction with transparent prices and clear evidence.
The service catalog covers electrical repair, plumbing repair, home cleaning,
air conditioning, sofa/mattress/curtain/carpet care, and minor repair/installation.
HomeServices informed the mission and catalog; its code, workflow details, backend
configuration, credentials and data are not inherited by this repository.

| Decision | Confirmed direction | Still pending |
| --- | --- | --- |
| Mobile framework | Expo and React Native | SDK version, compatible dependency pins and application layout |
| Language | TypeScript for application code; JavaScript/ESM for suitable configuration and tooling | App compiler, lint and test configuration |
| Backend | Supabase | Business schema, product auth, access matrix and hosted environment boundaries |
| Product areas | Clients and Workers; Admin remains a future direction | BPMN, detailed workflows and interface design |
| Kael | Kael Service Operator | BPMN, permissions, tools, AI provider and runtime contracts |
| Platform and testing | iOS first; TestFlight is the later testing channel | Owner setup, signing, build provider and distribution; Android deferred |
| Visibility | Keep this repository public; the owner decides when to change it | Licensing; any later visibility change |

No interface design is approved yet. TestFlight setup and builds are deferred, and
the Kael name alone defines no operating permissions. Earlier ADR recommendations
below remain proposals wherever they go beyond these confirmed decisions.

## Inspected implementation

The setup baseline is `26a5e0546cd6150380078589d1df7b2aa96b5371`: Node 24/npm
engineering tooling, isolated Supabase development and generated database types.
There is no product app, business schema, product auth or runtime Kael agent.
The existing native tooling installer supports Windows/Linux x64; macOS tooling
and native iOS execution have not been verified. Reinspect the implementation
before a later application task; this baseline is not a product-readiness claim.

## ADR 001 — Repository and development boundaries

**Context:** One product is planned; current tooling is already maintained in one
repository. No demonstrated independent team/release boundary exists.

**Alternatives:** A single repository with one native app; a workspace monorepo
with app/shared packages; separate repositories per client/service.

**Trade-offs:** One app in one repository keeps atomic changes and onboarding
simple. Workspaces support real shared consumers but add dependency/build graph
maintenance. Multiple repositories improve access separation and independent
release cadence at the cost of versioned contracts and coordinated changes.

**Confirmed:** Expo and React Native are selected. The SDK version and application
layout remain pending; no app directory or npm workspace is approved by this setup.

**Recommendation:** Keep one repository initially. Select the supported Expo
SDK/toolchain and review compatible dependency pins before scaffolding.
Add a shared package only when two real consumers justify it. Separate business
capabilities behind module APIs within the app first; do not create empty packages.
Use TypeScript strict mode, existing two-space/LF conventions, exact direct dependency
pins and a reviewed lockfile. Select formatter/linter versions for the actual SDK;
do not install them for an absent app. Tests belong with their owning boundary;
integration tests assert real consumer contracts, and regression fixtures stay
versioned. Match names to the framework and domain instead of imposing a new taxonomy.

**Consequences:** Fewer release/version boundaries now; an app-specific lint,
typecheck, unit and native build baseline must be added with the first scaffold.
Tooling checks do not become product checks merely by sharing CI.

**Reversibility:** Moderate; extracting packages later is straightforward if module
APIs stay explicit. Cross-repository moves require history/access/CI review.

**Dependencies / status:** Framework and language direction **CONFIRMED**. SDK,
application package-manager configuration and layout remain **PROPOSED**. Existing
repository tooling continues to use npm. The first scaffold needs its own approved
scope, real commands and consumers.

## ADR 002 — Environment, data and AI trust boundaries

**Context:** Local disposable stacks and hosted read-only developer MCP exist.
Product roles, policies, business migrations and Kael tools do not.

**Alternatives:** Shared hosted development; isolated local development plus
separate hosted staging/Production; Supabase preview branches per change.

**Trade-offs:** Shared hosted development risks target confusion. Local plus separate
environments supports reproducible tests and bounded access but needs environment
ownership and promotion procedures. Preview branches add compute, retention and
cleanup costs; they are optional, not an assumed requirement.

**Recommendation:** Retain the verified local workflow; propose distinct staging
and Production projects with separate secret/config ownership and no implicit
fallback between targets. Do not provision them now. Version schema changes only
through canonical migrations, test compatibility/role denials and approve hosted
promotion separately. Reconcile the existing hosted RLS event hook before deciding
whether migrations manage it. Keep one generated database type artifact per approved
schema contract rather than handwritten duplicate table types.

Application clients may hold public configuration/publishable keys; privileged
credentials belong in an approved trusted execution boundary. Enforce Customer
ownership, Worker assignments and Admin powers at the data/API boundary, with
authenticated cross-user/role denial tests. User-editable claims and hidden screens
are insufficient authorization. Select direct Supabase access versus a trusted
service per operation; sensitive orchestration needs a trusted boundary, not a
generic backend added before requirements exist.

Kael runtime access must be separate from developer MCP: bounded role-specific
tools, validated target/input/output, audit, budgets and human approval for sensitive
effects. Wrap future external/AI providers behind actual operation contracts with
timeouts, redacted errors, correlation IDs and retry/idempotency rules appropriate
to the effect. Select providers, data retention and observability destinations only
after evaluating data handling, failure behavior and cost. No provider is chosen here.

**Consequences:** More environment/access stewardship; each product capability needs
real allowed/denied tests and migration recovery evidence. Current empty-schema
checks cannot prove product authorization or financial correctness.

**Reversibility:** Access/schema decisions are costly after data exists; prefer
compatible migrations and roll-forward fixes. Provider adapters are easier to replace
when domain contracts do not expose vendor-specific state.

**Dependencies / status:** Supabase direction and the name Kael Service Operator
are **CONFIRMED**. The environment, role/access matrix, hosted hook disposition,
sensitive-action list, data retention and AI runtime remain **PROPOSED**. Detailed
workflow and Kael behavior await the owner's BPMN before implementation planning.

## ADR 003 — Native release and recovery

**Context:** CI verifies repository tooling/local DB; no native signing/build/CD
target exists. A passing check grants no deployment authority.

**Alternatives:** Manual local signed builds; managed native builds such as EAS;
dedicated macOS build infrastructure. App-store rollout and hosted migration
promotion can be manual or separately approved CD.

**Trade-offs:** Local builds minimize new services but depend on maintained machines.
Managed builds simplify credentials/build images with provider costs and access
considerations. Dedicated macOS infrastructure adds maintenance and signing exposure.

**Confirmed:** Prioritize iOS. TestFlight will be the testing channel after the owner
sets it up; no build is requested now. Android is deferred.

**Recommendation:** Choose build provider and budget after the SDK.
Keep CI and CD separate: PR checks first, owner review/merge, then an explicitly
approved release from the exact merged SHA. Store signing assets with a designated
owner in an approved secret store; never in Git or generic backup exports. Promote
verified artifacts with version/build identity and real device evidence. Decide OTA
compatibility rules only if the selected stack supports OTA.

Define database migration compatibility, staged rollout/stop criteria, support window,
observability and recovery objectives before a release. Native rollback may require
a new store build and cannot be assumed instantaneous; a Git revert does not undo
schema/data changes or restore external provider state. Drill data and Storage
recovery separately from the existing Git-bundle drill.

**Consequences:** Release ownership and evidence become explicit; no deployment
workflow or paid runner is added before there is a reviewed artifact to deliver.

**Reversibility:** Build providers are replaceable; signing/account custody and
published app identifiers need careful continuity. Data changes may be irreversible.

**Dependencies / status:** iOS priority and future TestFlight testing **CONFIRMED**.
SDK, account/signing custodians, provider/budget, recovery objectives and release
configuration remain **PROPOSED**. No Apple/EAS setup or native build is included
in this documentation-only setup.

## ADR 004 — Proprietary source and repository visibility

**Context:** The repository is currently public, without a selected license. Public
history remains externally copyable after a later visibility change. Proprietary
product code has not been introduced.

| Alternative | Benefit | Limitation / cost |
| --- | --- | --- |
| Keep this repository public | Current standard public runner availability and protected branches; simplest collaboration | No source confidentiality; no license choice implied; published history cannot be recalled |
| Make this repository private on GitHub Free | Source access can be restricted; one history/tooling location | Included private Actions quota/budget applies; public-only protection/security capabilities cannot be assumed to carry over |
| Keep public tooling and create a private product repository | Separate public foundation from confidential product | Duplicate maintenance/contract/version coordination; private enforcement and CI plan still need explicit validation |
| Private repository with an appropriate paid plan | Confidential source with eligible private governance features | Owner-approved recurring cost, plan/feature/security entitlement review required |

**Confirmed:** Keep this repository public. The owner will decide when to change it
to private; this setup makes no visibility, license, plan or repository change.
Current public visibility does not authorize publishing otherwise out-of-scope
code, data or credentials.

**Future consideration:** If the owner later requires confidentiality, review the
target plan's protection and CI capabilities before changing visibility. Separate
repositories remain an alternative rather than an approved restructuring.

**Consequences:** Content published here is publicly accessible. Public visibility
is not a confidentiality boundary, and later making the repository private cannot
recall previously disclosed content.

**Reversibility:** Visibility can change administratively, but disclosure cannot be
reversed. Repository splitting and plan changes require coordinated identity/tooling
updates and renewed security/CI verification.

**Dependencies / status:** Keeping the current public visibility **CONFIRMED**.
Licensing and any future confidentiality, collaboration/access or budget changes
remain pending. Verify current
[GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans),
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [security availability](https://docs.github.com/en/code-security/getting-started/github-security-features)
before changing settings; eligibility is not evidence of activation.

## Entry into application implementation

### Existing responsibility boundaries

| Location | Current responsibility |
| --- | --- |
| `scripts/` | Repository tooling and its verification; canonical helpers retain their existing owners |
| `docs/` | Architecture decisions, technical procedures and dated evidence |
| `supabase/` | Database development configuration, migrations, generated types and SQL tests |
| `.github/` | Hosted checks, dependency-update configuration and contribution templates |

This map explains the inspected structure under the root policy. It adds no second
instruction source and makes no product directories necessary.

### Next implementation plan

Before adding an application folder or module, the next plan identifies its
responsibility, real caller or consumer, dependencies, data/access boundary and
verification. It compares the proposal with the current implementation, names the
canonical owners being extended and explains any necessary separation. A shared
package needs actual shared consumers; empty backend, service or agent clusters
are not a substitute for a reviewed design.

Application layout and framework filenames are decided with an approved module.
Any required naming-check change stays limited to that module's conventions with
valid and invalid fixtures; existing protections remain intact. This setup adds
no directories, dependencies, naming exceptions, APIs, interfaces or types.

The first scaffold checklist includes supported runtime pins, reproducible install,
real lint/typecheck/test/native build commands and evidence for the actual platform.
macOS/native iOS support remains an explicit verification gap. Feature schemas,
auth and Kael need approved BPMN-derived contracts and negative tests. Resolve
release configuration before signed distribution. Setup acceptance does not claim
application, native-device, Production or disaster recovery readiness, and does
not authorize closing the application-planning Issue.
