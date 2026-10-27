# Application direction and architecture decisions

Status: **ENGINEERING FOUNDATION V1 plus APPLICATION FOUNDATION V2 (entry, phone
sign-in and mode gates only)**. The owner confirmed the direction on 2026-10-25 and
refined the decisions below on 2026-10-27. This document records decisions and
implementation prerequisites; it authorizes no business schema, release or Kael
runtime. The implemented V2 scope is described in
[the mobile application guide](mobile-application.md).
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
| Mobile framework | Expo SDK 58 and React Native in `apps/mobile` | Native iOS build and device verification |
| Language | Strict TypeScript for the mobile app; JavaScript/ESM for tooling | Native build verification |
| Backend | Supabase; backend enforces authorization | Business schema and operation-level access matrix |
| App and discovery | One App for Clients and Workers; guests explore before signing in | Owner-supplied App structure, public discovery data and workflows |
| Identity and roles | One account may hold multiple roles | Role assignment/revocation, Worker eligibility and capability rules; Admin is future scope |
| Authentication | Vietnamese phone number + OTP client integration; Google/Facebook are future methods | SMS provider, live Auth/OTP verification and identity linking |
| Development/testing | Isolated Supabase Local; no Staging Project | Production release design at the Deploy phase; no hosted writes now |
| Kael | Kael Service Operator | BPMN, permissions, tools, AI provider and runtime contracts |
| Platform and testing | iOS first; TestFlight is the later testing channel | Owner setup, signing, build provider and distribution; Android deferred |
| Visibility | Keep this repository public until the Deploy phase; the owner decides any change | Licensing; Deploy-phase visibility decision |

No interface design is approved yet. TestFlight setup and builds are deferred, and
the Kael name alone defines no operating permissions. Earlier ADR recommendations
below remain proposals wherever they go beyond these confirmed decisions.

## Inspected implementation

The Engineering Foundation V1 audit baseline is main
`98187746fc67ea64848a544b4a938e4c643a807e` (2026-10-27): Node 24/npm
engineering tooling, isolated Supabase development and generated database types.
At that baseline there was no product app, business schema, product auth or
runtime Kael agent; Application Foundation V2 later added the minimal mobile app,
phone sign-in and one technical Worker access grant, still with no business
schema and no Kael runtime.
The existing native tooling installer supports Windows/Linux x64; macOS tooling
and native iOS execution have not been verified. Reinspect the implementation
before a later application task; this baseline is not a product-readiness claim.

Application Foundation V2 access model: authentication, capability and presentation
mode are separate. Worker mode renders only for an identity the Auth server verified
in this run (`getUser()` or an interactive OTP confirmation, never a stored session or
an auth event alone), a current backend grant for that exact account, and a Worker
selection. Unreachable or unrecognised answers fail closed to Client. Navigation
guards are not authorization; Worker operations need their own server-side checks.
Details, error classification, storage guarantees, tested and untested layers are in
the [mobile application guide](mobile-application.md).

## ADR 001 — Repository and development boundaries

**Context:** One product is planned; current tooling is already maintained in one
repository. No demonstrated independent team/release boundary exists.

**Alternatives:** A single repository with one native app; a workspace monorepo
with app/shared packages; separate repositories per client/service.

**Trade-offs:** One app in one repository keeps atomic changes and onboarding
simple. Workspaces support real shared consumers but add dependency/build graph
maintenance. Multiple repositories improve access separation and independent
release cadence at the cost of versioned contracts and coordinated changes.

**Confirmed:** One Expo/React Native App serves Clients and Workers, with discovery
available before sign-in. An account may hold multiple roles; selecting an App
mode grants no permissions. The backend evaluates each operation's authorization.
Application Foundation V2 approved `apps/mobile`, Expo SDK 58, a root npm
workspace and the four feature boundaries (`client`, `worker`, `shared`,
`access`). The owner will supply the remaining product screens and workflows.

**Recommendation:** Retain the approved single-app npm workspace. Add a shared
package only when two real consumers justify it; do not create empty packages.
Keep business capabilities behind owned feature module APIs. The implemented Expo
scaffold uses strict TypeScript, mobile lint/unit tests and exact dependency pins
with one root lockfile. Tests belong with their owning boundary; integration tests
assert real consumer contracts and regression fixtures stay versioned. Match names
to the framework and domain instead of imposing a new taxonomy.

**Consequences:** Fewer release/version boundaries now. Mobile lint, typecheck and
unit tests are present; native iOS builds and live OTP delivery remain unverified.
Tooling checks do not become device or production checks merely by sharing CI.

**Reversibility:** Moderate; extracting packages later is straightforward if module
APIs stay explicit. Cross-repository moves require history/access/CI review.

**Dependencies / status:** One App, guest entry, multiple roles per account,
Expo SDK 58, strict TypeScript and the npm workspace are **IMPLEMENTED** at technical
foundation scope. Native build/release, business flows, SMS delivery and Kael
runtime remain **NOT IMPLEMENTED or NOT VERIFIED** as applicable.

## ADR 002 — Environment, data and AI trust boundaries

**Context:** Local disposable stacks and hosted read-only developer MCP exist.
Business role eligibility, operation-level authorizations, business migrations
and Kael tools do not. One technical Worker access grant with RLS exists.

**Alternatives:** Shared hosted development; isolated local development plus
separate hosted staging/Production; Supabase preview branches per change.

**Trade-offs:** Shared hosted development risks target confusion. Local plus separate
environments supports reproducible tests and bounded access but needs environment
ownership and promotion procedures. Preview branches add compute, retention and
cleanup costs; they are optional, not an assumed requirement.

**Confirmed:** Development and testing use isolated Supabase Local. No Staging
Project or additional remote environment is planned for Engineering Foundation V1.
Existing hosted read-only developer MCP is diagnostic access, not an application
environment or a development/test fallback. Production writes and deployment are
outside this task. This supersedes the earlier recommendation for distinct hosted
staging and Production projects.

Version future schema changes only
through canonical migrations, test compatibility/role denials and approve hosted
promotion separately. Reconcile the existing hosted RLS event hook before deciding
whether migrations manage it. Keep one generated database type artifact per approved
schema contract rather than handwritten duplicate table types.

The [foundation contracts](foundation-contracts.md) define environment/data
classification, guest and multi-role boundaries, and API conventions for later
consumers. Phone + OTP for Vietnamese numbers is the primary authentication
direction; Google/Facebook remain future secondary methods. This decision enables
no provider, signup flow, OAuth callback or session runtime now. Discovery without
sign-in does not require creating anonymous Auth accounts. Application Foundation
will define the public projection and actual operation permissions before exposing
data. Select direct Supabase access versus a trusted service per operation; sensitive
orchestration needs a trusted boundary, not a generic backend before requirements.

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

**Dependencies / status:** Supabase Local, no Staging Project, backend authorization,
multiple roles per account, phone/OTP direction and the name Kael Service Operator
are **CONFIRMED**. The operation-level access matrix, hosted hook disposition,
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

**Confirmed:** Keep this repository public until the Deploy phase. The owner will
decide visibility then; there is no automatic switch to private. This setup makes
no visibility, license, plan or repository change.
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
valid and invalid fixtures; existing protections remain intact. Engineering Foundation
V1 added no directories or exceptions; Application Foundation V2 then added `apps/mobile`,
`services/kael-core` (README only), the empty `docs/processes/` marker and the matching
narrow path rules with fixtures.

### Application Foundation decisions

Engineering Foundation V1 did not include application code. Application Foundation V2
subsequently added Expo/mobile scaffolding, guest and OTP client entry, separated
Client/Worker presentation, a technical Worker access grant with real local RLS tests,
and mobile lint/typecheck/unit checks. See the
[mobile application guide](mobile-application.md) for precise verified limits.

The following remain for separate owner-approved implementation:

- Native iOS build, TestFlight, device Keychain and live Auth/SMS round-trip checks.
- Guest discovery projection, Worker onboarding, service workflows, operation-specific
  authorization and the owner's BPMN/process contracts.
- OTP provider/cost decisions, production rate limits/recovery, account linking and
  future secondary identity methods.
- Kael permissions, tools, providers, memory and runtime execution.
- Deploy-phase visibility, Production access, monitoring and recovery decisions.

The [foundation contracts](foundation-contracts.md) define trust and environment
boundaries; they are not substitutes for the implemented Auth/RLS checks. Foundation
acceptance does not imply native-device, production or disaster-recovery readiness.
