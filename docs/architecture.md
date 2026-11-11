# Application direction and architecture decisions

Status: **Architecture snapshot checked against `main` at `9b4cc9b` on
2026-11-11.** The owner confirmed the product direction on 2026-10-25 and refined
the stack decisions below on 2026-10-27. The V1/V2 descriptions below preserve
their original decision history; they do not describe the full current application.
No architecture change or release approval follows from this status update. See
[the mobile application guide](mobile-application.md) for current implementation.
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
| Language and package manager | Strict TypeScript mobile app, Node.js 24 tooling, npm workspace and root lockfile | No separate application backend or package manager |
| Backend and data | Supabase Auth, Postgres/RLS, Storage, RPCs and Edge Functions; service and Kael migrations exist | Payment settlement and commercial dispatch are not established by the current contracts |
| First user-facing slice | Entry/session gates followed by Customer service-request intake for the catalog; Worker and Kael paths are also present | Live end-to-end transaction and production readiness remain unverified |
| Identity and roles | Customer/Worker presentation modes with server-side worker grants | Worker onboarding/qualification and Admin are separate scope |
| Authentication | Phone and email client flows with Supabase Auth | Live tester verification, real SMS and native Keychain behavior are not evidenced here |
| Development/testing | Isolated Supabase Local; one connected hosted project has deployed schema and Kael components; no staging project | Hosted state is not a substitute for local tests or real-user acceptance |
| Kael | Mobile chat, server-backed sessions and existing Supabase Edge runtime | Provider quality, complete hosted user flow and commercial side effects remain limited or unverified |
| Platform and testing | iOS first; `apps/mobile/eas.json` has TestFlight and App Store build/submit profiles | No native build, upload or device verification is evidenced; Android is not configured |
| Visibility | Keep this repository public until the Deploy phase; the owner decides any change | Licensing; Deploy-phase visibility decision |

The current mobile UI includes Horizon screens, customer service intake and Kael
session controls. A configured EAS profile is not a build or release. CI runs
repository checks and isolated Supabase local verification on PR/main events; it
does not run native builds or verify a live Auth account. Earlier ADR recommendations
remain proposals wherever they go beyond the confirmed decisions.

## Current implementation and Issue #2 acceptance review

The first working customer transaction slice is manual service-request intake across
the service catalog, preceded by the access/session gates. The merged
[PR #122](https://github.com/manhtu0407/NestScout-Enterprise/pull/122) records the
forms, explicit confirmation, persisted idempotency key and limits: the app does not
claim a worker, price, schedule or payment is confirmed. Supabase migrations and
RLS/RPC tests own the backend boundary. This is an implemented slice, not evidence
of a commercial end-to-end service.

The confirmed user groups, Expo/React Native and TypeScript stack, Node/npm workspace,
Supabase boundaries, local setup, environment example, aggregate checks, CI and
TestFlight and App Store profiles are recorded in this document and the linked
technical guides. The connected Supabase project was observed `ACTIVE_HEALTHY` on
2026-11-11; its migration history includes `add_kael_provider_probe_window` at hosted
version `20261111074958`, and its `kael` Edge Function was `ACTIVE`, version 20, with
JWT verification enabled. These read-only hosted observations are not live tester
Auth, native-device or full-flow proof.

Issue #2 still needs owner decisions for database and Storage backup retention and
restore objectives, and operational health/error/cost alert ownership and thresholds.
The [operations guide](operations.md) now records preview/release steps, migration
sequencing and Kael function rollback; no native build, store release or rollback
drill is evidenced. The original README remains outdated because the repository
guard reserves it for separate owner authorization. This audit does not choose a new
environment or deployment architecture.

## Historical implementation baseline

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
`access`). Later implementation added the service-request intake, Customer/Worker
screens and Kael sessions summarized above.

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

**Dependencies / status:** One App, guest entry, Customer/Worker modes, Expo SDK 58,
strict TypeScript and the npm workspace are **IMPLEMENTED**. Service intake, related
backend workflow migrations and Kael sessions have since been added. Native
build/release, real SMS, commercial dispatch and payment settlement remain
**NOT VERIFIED or NOT IMPLEMENTED** as applicable.

## ADR 002 — Environment, data and AI trust boundaries

**Context:** Local disposable stacks, a hosted developer MCP and a connected hosted
Supabase project exist. The current repository includes service and Kael migrations,
RLS/RPC boundaries, and server-backed Kael operations; commercial role qualification
and payment settlement remain outside the verified contract.

**Alternatives:** Shared hosted development; isolated local development plus
separate hosted staging/Production; Supabase preview branches per change.

**Trade-offs:** Shared hosted development risks target confusion. Local plus separate
environments supports reproducible tests and bounded access but needs environment
ownership and promotion procedures. Preview branches add compute, retention and
cleanup costs; they are optional, not an assumed requirement.

**Confirmed:** Ordinary development and tests use isolated Supabase Local; there is
no Staging Project. The connected hosted project has applied application migrations
and a deployed Kael Edge Function, but it is not a fallback for local tests. The
current task makes no hosted writes or deployment. This supersedes the earlier
recommendation for separate hosted staging and Production projects.

Version future schema changes only
through canonical migrations, test compatibility/role denials and approve hosted
promotion separately. Reconcile the existing hosted RLS event hook before deciding
whether migrations manage it. Keep one generated database type artifact per approved
schema contract rather than handwritten duplicate table types.

The [foundation contracts](foundation-contracts.md) define environment/data
classification, guest and multi-role boundaries, and API conventions. Mobile Auth
and session flows now exist; live tester behavior, real SMS and identity linking are
not established by the local SDK suite. Discovery without sign-in does not require
creating anonymous Auth accounts. Each operation still needs its own backend
authorization; a presentation mode or generic mobile API is not an access grant.

Kael runtime access remains separate from developer MCP. The existing Edge runtime
has authenticated callers, session persistence and provider routing; spend windows
and live quality checks remain bounded. Data retention, observability and release
alerts still need explicit operational objectives before a public launch.

**Consequences:** More environment/access stewardship; each product capability needs
real allowed/denied tests and migration recovery evidence. Current feature-specific
local tests cover defined service and Kael boundaries, but do not prove hosted user
behavior, commercial dispatch or payment settlement.

**Reversibility:** Access/schema decisions are costly after data exists; prefer
compatible migrations and roll-forward fixes. Provider adapters are easier to replace
when domain contracts do not expose vendor-specific state.

**Dependencies / status:** Supabase Local, no Staging Project, server-side
authorization, Customer/Worker modes, phone/OTP direction and the Kael Service
Operator are **CONFIRMED**. Role qualification, sensitive-action policies, retention
and operational monitoring still have unverified or proposed parts. The current
service workflow contract and Kael guide describe the implemented boundary and gaps.

## ADR 003 — Native release and recovery

**Context:** CI verifies repository tooling and the isolated local database. EAS
has TestFlight and App Store profiles, but no native build/upload evidence exists. A
passing check grants no deployment authority.

**Alternatives:** Manual local signed builds; managed native builds such as EAS;
dedicated macOS build infrastructure. App-store rollout and hosted migration
promotion can be manual or separately approved CD.

**Trade-offs:** Local builds minimize new services but depend on maintained machines.
Managed builds simplify credentials/build images with provider costs and access
considerations. Dedicated macOS infrastructure adds maintenance and signing exposure.

**Confirmed:** Prioritize iOS and use the configured EAS TestFlight and App Store
profiles for store distribution. Android is not configured. Neither profile has
been built, uploaded or verified on a device.

**Recommendation:** Keep CI and CD separate: PR checks first, owner review/merge, then an explicitly
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

**Dependencies / status:** iOS priority and EAS/TestFlight/App Store configuration are
**CONFIRMED**. Native signing/build/upload, release budget, recovery objectives and
device verification remain **NOT VERIFIED** or pending owner decision.

## ADR 004 — Proprietary source and repository visibility

**Context:** The repository is currently public, without a selected license. Public
history remains externally copyable after a later visibility change; the repository
now contains mobile product code as well as engineering tooling.

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

### Historical Application Foundation V2 scope

Engineering Foundation V1 did not include application code. Application Foundation V2
added the initial Expo entry/auth/mode-gate slice. Later work added the service intake,
Customer/Worker data paths, and Kael runtime/session flows. Remaining gaps include
native iOS/TestFlight evidence, live Auth/SMS behavior, commercial dispatch and
settlement, database/Storage recovery objectives, and production health/cost alerts.

The [foundation contracts](foundation-contracts.md) define trust and environment
boundaries; they are not substitutes for the implemented Auth/RLS checks. Foundation
acceptance does not imply native-device, production or disaster-recovery readiness.
