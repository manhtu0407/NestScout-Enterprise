# Proposed application architecture decisions

Status: **PROPOSED**. These decisions require owner approval and authorize no
scaffold, application code, schema, deployment, license or visibility change.

Approved direction supplied by the owner: native mobile, React Native, TypeScript,
Supabase, future Customer/Worker/Admin roles and Kael integration, with Codex and
Claude Code as coding agents; no Vercel hosting. The inspected implementation is
Node 24 engineering tooling, isolated Supabase development and generated database
types. There is no product app, business schema, product auth or runtime Kael agent.

## ADR 001 — Repository and development boundaries

**Context:** One product is planned; current tooling is already maintained in one
repository. No demonstrated independent team/release boundary exists.

**Alternatives:** A single repository with one native app; a workspace monorepo
with app/shared packages; separate repositories per client/service.

**Trade-offs:** One app in one repository keeps atomic changes and onboarding
simple. Workspaces support real shared consumers but add dependency/build graph
maintenance. Multiple repositories improve access separation and independent
release cadence at the cost of versioned contracts and coordinated changes.

**Recommendation:** Keep one repository initially. Select Expo versus bare React
Native and the supported SDK/toolchain before scaffolding; Expo is not yet approved.
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

**Dependencies / status:** Owner selects SDK, package manager and layout, then
authorizes the first scaffold with real commands and consumers. **PROPOSED**.

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

**Dependencies / status:** Owner approves role/access matrix, environment owners,
hosted hook disposition, sensitive-action list and data retention before feature
schema/auth/AI implementation. **PROPOSED**.

## ADR 003 — Native release and recovery

**Context:** CI verifies repository tooling/local DB; no native signing/build/CD
target exists. A passing check grants no deployment authority.

**Alternatives:** Manual local signed builds; managed native builds such as EAS;
dedicated macOS build infrastructure. App-store rollout and hosted migration
promotion can be manual or separately approved CD.

**Trade-offs:** Local builds minimize new services but depend on maintained machines.
Managed builds simplify credentials/build images with provider costs and access
considerations. Dedicated macOS infrastructure adds maintenance and signing exposure.

**Recommendation:** Choose build provider, iOS/Android scope and budget after the SDK.
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

**Dependencies / status:** SDK, supported platforms, account/signing custodians,
provider/budget, recovery objectives and release approval process. **PROPOSED**.

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

**Recommendation:** Decide before the first proprietary commit or push. Prefer one
private product repository with an approved plan that preserves required checks and
governance, if confidentiality is required. Keeping only reviewed reusable tooling
public is an alternative when separate ownership justifies its maintenance cost.
Do not switch visibility, select a license, enroll in a plan or create a repository
as part of this proposal. If paid services are rejected, explicitly resolve the
private-Free enforcement/CI trade-off before publishing product code.

**Consequences:** The current public setup is appropriate only for intentionally
publishable foundation content; it is not a confidentiality boundary.

**Reversibility:** Visibility can change administratively, but disclosure cannot be
reversed. Repository splitting and plan changes require coordinated identity/tooling
updates and renewed security/CI verification.

**Dependencies / status:** Owner chooses confidentiality, collaboration/access,
budget and licensing direction. **PROPOSED**. Verify current
[GitHub plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans),
[Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
and [security availability](https://docs.github.com/en/code-security/getting-started/github-security-features)
before changing settings; eligibility is not evidence of activation.

## Entry into application implementation

Resolve ADR 004 before proprietary source enters Git, then approve the SDK/layout,
role/environment boundaries and a narrowly scoped scaffold acceptance checklist.
That checklist must include supported runtime pins, reproducible install, real
lint/typecheck/tests/native build commands and no hosted release by default.
Feature schemas/auth/Kael require their own approved contracts and negative tests.
ADR 003 must be resolved before signed distribution. None of these proposals claims
application, native-device, Production or disaster recovery readiness today.
