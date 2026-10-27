# Foundation contracts

Technical contracts for later application consumers, under the sole root
[engineering policy](../AGENTS.md) and the owner's
[architecture decisions](architecture.md). These contracts introduce no runtime,
environment loader, endpoint, schema, auth provider or additional policy.

## Environment contract

| Boundary | Inputs and owner | Behavior / exposure |
| --- | --- | --- |
| Repository tooling | `package.json`, lockfile, `scripts/tools.json` | Node 24/npm and pinned tools; no application dotenv inputs |
| Local database/testing | `supabase/config.toml`, image lock and `scripts/supabase-local.mjs` | Checkout + branch identity, dynamic loopback endpoints, local Docker; no linked project or remote fallback |
| Developer MCP | Existing project-scoped hosted read-only settings and guarded local bridge | Diagnostic tools only; client approval still applies; credentials stay outside Git |
| Mobile public config | `apps/mobile/src/lib/config.ts`, `apps/mobile/.env.example` | `EXPO_PUBLIC_NESTSCOUT_TARGET=local`, a loopback or private-network API URL and a publishable key; values shipped in the bundle are public, and secret or service_role keys are rejected |
| Future trusted execution | Operation owner, only when a real service is approved | Privileged/provider credentials stay outside clients and Git; never inferred from developer MCP access |
| Hosted environments | Owner at the Deploy phase | No Staging Project or additional remote environment; no Production writes/deploy in this foundation |

The tooling requires no `.env` file. `validateLocalFiles()` rejects root/Supabase
dotenv variants other than `.env.example` and both CLI link formats.
`localEnvironment()` scrubs ambient Postgres/Supabase/database target selectors;
the wrapper validates Docker, stack identity and loopback bindings. Run the
[existing commands](supabase-development.md#installation-and-local-runtime), rather
than direct CLI commands with target overrides. Never copy hosted credentials or
raw stack-status JSON into an example, log or fixture.

No `.env.example` is added before an App consumer defines its variable names.
With that consumer, document each input's name, public/secret classification,
requiredness, format, source and target. Missing, malformed or mismatched target
inputs must fail clearly; no default to a hosted project or cross-environment
fallback. Supply a sanitized example with placeholders only. Local endpoint
discovery must handle dynamic ports. A physical iPhone cannot reach a developer's
loopback URL: a later device connectivity design needs explicit access boundaries;
do not weaken the existing binding guard to claim native verification.

Mobile bundles may contain a Supabase publishable key, or the pinned local
runtime's supported legacy anon equivalent. An API key identifies the calling
component, not a signed-in user. Secret/service-role keys, database passwords,
management tokens, SMS/AI provider secrets and native signing material never belong
in the mobile bundle, public config, Git, fixtures or telemetry. Prefixing a value
as public does not make a secret safe. Sessions, OTPs and phone numbers also need
redaction; ignored local files do not provide authorization to export their data.

## Identity and authorization boundaries

| Caller/state | Foundation boundary | Later verification with real consumers |
| --- | --- | --- |
| Guest, no sign-in | Discover only an explicitly approved public data projection; no anonymous Auth account required | Public discovery succeeds; private columns/rows and protected effects remain inaccessible |
| Account with one or more roles | Backend verifies identity, current capability and object access for every operation | Allowed role/object succeeds; another account, absent/revoked role and forged actor fail |
| Client/Worker App mode | Presentation preference; never an authorization source | Editing UI state or request role fields cannot gain permissions |
| Privileged operation | Explicit trusted boundary and object authorization before the effect | Ordinary callers cannot reach bypass paths; tests observe effective role and side effects |
| Developer MCP / future Kael | Separate identities and authorities | Developer access never becomes a product role or Kael tool permission |

Clients/Workers are product capabilities, not a mandate to create PostgreSQL roles
or a role enum now. An authenticated Supabase role alone does not establish object
authorization. User-editable metadata and body-supplied actor IDs are untrusted.
Even trusted JWT membership claims can become stale; choose the authoritative
membership/revocation path with the operation's risk and consistency requirements.

Future exposed tables need explicit grants and RLS policies, including allowed and
denied reads/writes across users and roles. Inspect views, function EXECUTE grants,
security-definer code and effective request/database identity for bypass paths.
A client initialized with a service-role key may send a user's bearer token instead;
initialization alone does not prove the effective role. Keep privileged keys out of
clients regardless. Reuse `supabase/tests/database/security.test.sql` and generated
`supabase/database.types.ts`; extend them with real feature contracts, without
handwritten duplicate table types or reliance on a hosted auto-RLS hook.

Phone + OTP is the confirmed sign-in direction, with Vietnam as the initial phone
market. Application Foundation defines validation and normalization to `+84` E.164
form before identity lookup, preserving a single canonical identity across input
formats. It also defines abuse/rate limits, expiry/replay handling, phone-change
reverification, recovery and account linking. No guessed phone regex, SMS traffic,
OTP fixture credentials or role entitlement is implemented. The mobile app calls
the Supabase Auth phone API with the normalized number; SMS delivery needs an
owner-approved provider, so it is not configured. Google/Facebook
remain later secondary methods; they must link through the approved account model,
not silently create a separate account or grant a Worker capability.

## API conventions for future consumers

Use Supabase's supported Data/Auth API contracts when accessing those services.
No custom API server, global envelope, URL hierarchy or transport SDK is selected.
For each actual operation, record caller class, method/path or RPC, accepted input,
output, data exposure, authorization owner, effect and failure behavior alongside
its owning implementation. Use generated database types at the data boundary and
explicit public projections at client boundaries; types do not validate requests.

- Validate untrusted inputs at the execution boundary: shape, size, formats and
  permitted fields. Derive actor identity from verified credentials. Define any
  unknown-field handling and prevent ownership/role mass assignment.
- Preserve truthful transport outcomes. For owned HTTP endpoints, distinguish
  malformed input (400), missing/invalid authentication (401), denied access (403),
  absent resource (404), state conflict (409), rate limit (429) and upstream/internal
  failure (5xx). Choose a consistent 404 concealment rule where resource existence
  is private. Do not rewrite native Auth/Data API errors or turn failures into 200.
- Custom errors expose a stable machine code, safe message and sanitized request
  correlation ID. Detailed SQL errors, stack traces, credentials, tokens, OTPs,
  full phone numbers and private request bodies remain out of public responses/logs.
  Exact code names and envelopes belong to the real consumer contract.
- Bound result sizes and define deterministic pagination/order with a tie-breaker
  for list operations. Use explicit timezone/UTC timestamp semantics; date-only
  values retain their domain meaning. Define currency/precision only with an actual
  money operation, not a speculative payment module.
- Bound downstream duration and cancellation. Retry only under the operation's
  documented safety rules. A mutation timeout may leave an unknown outcome; use
  reconciliation rather than an assumed failure. Where duplicate effects are
  credible, scope an idempotency key to actor + operation, compare request content,
  atomically retain the outcome and test concurrent retries. Do not add an unused
  idempotency framework before such an operation exists.
- Keep compatible changes additive for installed mobile clients; review breaking
  schema/API changes with their actual consumers and migration/roll-forward plan.
  Select API versioning and supported-client windows when an API exists.

The existing `be-auth-rls`, `be-schema-migrations`, `be-transaction-integrity` and
`be-edge-api` skills cover implementation workflows when their concrete triggers
exist. They do not require creating those modules now. No wording-only automated
check can prove these future contracts: add allowed/denied, malformed-input,
duplicate/concurrency and failure tests at the real boundary as each risk appears.

## Verification boundary and references

Current executable checks cover repository identity, index/working snapshots,
secrets, workflows, tests, skill format and isolated local DB metadata. Passing them
does not establish guest access, OTP delivery, account linking, multi-role
authorization or native-device behavior. Those are **OUT OF SCOPE** until their
application consumers are supplied. Hosted CI requires separate owner authority;
local checks cannot be reported as hosted results.

Official references reviewed for these contracts on 2026-10-27:

- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Phone sign-in and SMS setup](https://supabase.com/docs/guides/auth/phone-login)

Inspect the installed versions and current docs again before implementing an App
consumer. These references authorize no provider setup or hosted operation.
