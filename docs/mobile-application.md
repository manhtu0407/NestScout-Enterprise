# Mobile application foundation

Technical guide for `apps/mobile` under the root [engineering policy](../AGENTS.md).
Application Foundation V2 implements entry, phone sign-in, role resolution and
Client/Worker mode gates. It contains technical placeholders only: no service
catalog, booking, worker job, earnings, pricing or Kael behavior exists, and the
owner has not yet supplied process documents or final UI.

## Design fidelity contract

### Design foundation and development showcase

The [Apple HIG accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
and [haptics guidance](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)
inform the foundation. React Native's [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)
provides the Reduce Motion query and change event.

`src/theme/palette.ts` owns semantic Light/Dark colors; `src/theme/layout.ts`
owns spacing, geometry, opacity, elevation, motion durations and typography.
The Ocean Mint direction is represented by the teal and mint palette, but no
approved color specification or visual reference is present in this repository.
Exact brand fidelity remains unverified and the values require owner review.
Text uses the platform system font and React Native's default font scaling.
Text styles are semantic roles rather than a claim of native Dynamic Type ramps.

`features/shared` exports text, actions, icon actions, fields, surfaces, dividers,
status and state views, loading and safe-area screens. Existing specialized inputs
retain their behavior. Labels, state, non-color status text, 48-point minimum control
sizes and Light/Dark contrast are part of the component contract. Layout and
VoiceOver behavior at large sizes still need native verification. Icon buttons must
receive a meaningful label and a decorative child. Fields require a label; error
messages supplement the border and are included in the accessibility hint.

Icon-button feedback uses React Native animation with the system Reduce Motion
setting and starts conservatively without motion while the setting is unknown.
Other shared button feedback is immediate. Haptics are not emitted automatically:
no haptics module is installed. A future real consumer may add a compatible,
optional native haptic for meaningful actions, with a no-op fallback and no haptic
required for understanding state. No native material or glass effect is claimed.

Use the public `features/shared` exports and semantic tokens for Client and Worker
interfaces. The existing `design-governance.test.ts` checks visual literals in
feature and showcase styles; it does not prove semantic appropriateness or resolve
all dynamic styles. Review additions to the canonical tokens and component APIs.

Set `EXPO_PUBLIC_DESIGN_SHOWCASE=1` before starting Metro to open the development
showcase, and optionally set `EXPO_PUBLIC_DESIGN_REVISION` to label the source.
The label is operator-supplied, not an attestation. The root requires `__DEV__`;
the showcase does not mount application flows and cannot be selected in production.
Remove the variables and restart Metro to return to the application.

### iOS validation procedure

On 2026-10-29, Expo's [SDK version endpoint](https://exp.host/--/api/v2/versions)
reported React Native `0.88.0` for SDK 58, while its
[native-module endpoint](https://exp.host/--/api/v2/sdks/58.0.0/native-modules)
and the `expo@58.0.21` bundled matrix reported `0.88.1`. The CLI prefers the first
endpoint. The lockfile now selects the patch releases and React Native `0.88.1`
from the bundled matrix; `npm ci --ignore-scripts` succeeds, but the online
`npm run verify:mobile-sdk` rejects `0.88.1` and expects `0.88.0`. Expo's
[issue #52454](https://github.com/expo/expo/issues/52454) tracks the same discrepancy
and its CLI override. SDK compatibility remains blocked until the sources agree and
the online check passes. An offline success is not a substitute for the online check.

For the least intrusive device check, use an already installed Expo Go build that
matches SDK 58. Expo's [version-mismatch guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/)
says the iOS App Store version stops at SDK 54; SDK 58 on a physical iPhone needs a
compatible build distributed through an internal TestFlight team using `eas go`
and an Apple Developer Program membership. Expo's
[physical-device setup](https://docs.expo.dev/get-started/set-up-your-environment/?device=physical&mode=expo-go&platform=ios)
also requires Expo CLI and Expo Go to be signed in to the same account. Building or
distributing that client, creating accounts and changing credentials are separate
operations; none was performed for this increment. On a Mac, a compatible Expo Go
simulator build is another path without a physical-device provisioning profile.

An [EAS development build](https://docs.expo.dev/develop/development-builds/introduction/)
can build iOS from Windows. `apps/mobile/eas.json` defines only an internal
development profile and `expo-dev-client@58.0.17` is locked to the installed SDK's
matrix. The repository is linked to the existing `@nestscout/nestscout` project,
whose ID is `d984de7d-3c69-41a5-841f-a604d10d4f11`. The separate development
bundle identifier is `com.phanmanhtu.nestscout.dev`; its availability on the Apple
Developer portal remains unverified. `eas config` resolves the internal development
profile. No cloud build or native runtime has been verified.

On 2026-10-29, EAS showed an Apple team and existing certificates, but no registered
devices and no provisioning profile for the development identifier. The only stored
profile identified in the account belongs to the separate Home Services app. Do not
revoke or modify that app's certificate or profile. Apple authentication, team access,
identifier availability and device registration still require confirmation through
the official Apple and EAS flow. Confirm included build allowance immediately before
submitting a build; do not incur charges without separate authorization.

The installed global `eas` command fails because its pnpm `@oclif/core` installation
cannot resolve `tinyglobby`. On this Windows host, `npx.cmd --yes eas-cli@27.1.0 --version`
starts successfully without repairing the global installation or changing the
PowerShell execution policy; `whoami` confirmed an Expo login, and the selected project
resolved successfully. From `apps/mobile`:

1. Start `npx.cmd --yes eas-cli@27.1.0 device:create`. The owner confirms the
   `nestscout` account and completes Apple authentication and iPhone registration
   in the official flow. Never send credentials or device identifiers in chat or
   commit them to Git.
2. Confirm that `com.phanmanhtu.nestscout.dev` is available to the authorized team,
   then configure a separate development provisioning profile for that identifier
   and registered device. Prefer an existing valid certificate without changing or
   revoking it. Any Apple authentication or MFA stays with the owner.
3. Review and commit the intended configuration, record the clean source revision,
   and run `npx.cmd --yes eas-cli@27.1.0 config --platform ios --profile development`.
   After confirming allowance and build authorization, submit one build with
   `npx.cmd --yes eas-cli@27.1.0 build --platform ios --profile development`. Record the
   build ID and result separately from device runtime results.

For an iPhone session, install the approved internal development build, enable
[Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/) if required, and
use a network path between the phone and Metro. Check out the intended committed
revision in a clean worktree, record `git rev-parse HEAD` and `git status --short
--branch`, and run the SDK check. In PowerShell, from `apps/mobile`, set
`$env:EXPO_PUBLIC_DESIGN_SHOWCASE = '1'` and
`$env:EXPO_PUBLIC_DESIGN_REVISION = (git rev-parse HEAD)`, then run
`npm run start -- --dev-client --clear`. Open that server in the development client. Confirm the
displayed revision against the recorded commit and retain the server launch record,
device and OS build with each capture. The displayed label can be stale or manually
set, so it must not be treated as an attestation. Do not use secrets in either
public environment variable. Record the scenario, settings and observed outcome;
then stop the task-owned server and remove the two variables from the shell.
For application navigation and Worker deep links, restart Metro with the showcase
variable removed; the showcase replaces the application stack. Use authorized test
accounts and an accessible local test service, not production credentials, and record
the route, role, outcome and side effects. A phone's loopback address is not the
development computer's loopback address. Record Light/Dark, large Dynamic Type,
Vietnamese text, pressed/focus feedback, VoiceOver and measured touch targets on the
device. Retain device, OS, build ID, source revision and results; automated checks and
Metro bundling alone do not establish native behavior.

### Native verification boundary

Automated component and contrast tests do not establish native iOS appearance,
Dynamic Type, VoiceOver, Reduce Motion, touch geometry or Vietnamese wrapping.
Verify those on a simulator or device against an owner-approved reference when one
is available. Browser or static output is not native-device evidence.

## Versions

Expo SDK 58 (React Native 0.88, React 19.3.0, Expo Router 58) with TypeScript
strict mode, installed through the single root npm workspace and lockfile. Direct
dependencies are pinned exactly. The workspace uses the Expo SDK's TypeScript 6
while the repository tooling keeps the native-port TypeScript 7; the mobile ESLint
configuration redirects only its own process to TypeScript 6 for typescript-eslint:
the repository root's TypeScript 7 exposes no JavaScript compiler API, and the parser and
import resolver are nested under `eslint-config-expo`, so a module hook resolves those
three specifiers before `eslint-config-expo` is imported.
The root `overrides` entry for `react` keeps a single React copy for the test renderer.

## Ownership

| Location | Owns | Must not own |
| --- | --- | --- |
| `src/app` | Thin Expo Router files: one default export of a feature component, plus the root layout | State, Supabase access, policy |
| `src/features/access` | Guest entry, phone sign-in, session and capability state, mode preference, route policy, sign-out | Worker qualification, privileged grants |
| `src/features/client` | Client-only screens | Authorization, session code |
| `src/features/worker` | Worker-only screens | Entitlement granting |
| `src/features/shared` | UI used by both modes | Other features, privileged credentials |
| `src/lib` | Validated public config, the one Supabase client, keychain storage | Feature behavior |

`src/testing/module-boundaries.test.ts` enforces the import directions, public
`index.ts` entry points, thin routes and that only four files touch Supabase.

## Entry and sign-in

A launch with no session lands on the guest shell without a role chooser. A stored
session is only an unverified claim: the Auth server must confirm it with `getUser()`
before the account counts as verified, and the capability lookup must resolve before
any protected route renders. Expo Router protected groups plus the `EntryRedirect`
destination keep guests out of Client and Worker routes, send an unauthorized Worker
deep link to Client, and avoid redirect loops. Navigation is never authorization.

Sign-in uses `signInWithOtp({ phone, options: { shouldCreateUser: true } })` and
`verifyOtp({ phone, token, type: 'sms' })` with the number normalized by
`libphonenumber-js` to `+84` E.164 (accepting `0…`, `84…`, `0084…` and `+84…`).
The phone and code are held in memory only; they are never placed in URLs, logs
or stored values. Success is reported only when Auth returns a session with a user id.

## Identity, roles and modes

Authentication says who the person is. Worker mode needs ALL of the following, and
`deriveAccess` in `access-reducer.ts` is the single place that combines them:

1. **Verified identity.** `identity` becomes `verified` only when `getUser()` answers
   for the same account, or when an interactive OTP confirmation returns a session
   (the Auth server issued it for the code just confirmed). A session restored from
   storage and every auth event (`SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED`;
   `INITIAL_SESSION` is ignored) is a claim and never upgrades the identity. A
   `getUser()` answer for a different account does not verify the current one.
2. **A current backend grant.** A row in `public.worker_access_grants` with
   `status = 'active'` whose `user_id` equals the signed-in account, read under the
   authenticated session. Row level security is the authority; the client also checks
   the returned owner. Loading, resolved (`none`, `active`, `revoked`) and error are
   distinct. A missing, malformed, foreign, forbidden or failed row never grants Worker.
3. **A Worker selection.** The saved preference is a keychain value bound to one
   account and is only applied once 1 and 2 hold; it grants nothing by itself.

If the Auth server is unreachable, times out or answers in an unrecognised way, the
account stays signed in, in Client mode, with Worker status "unknown" and a retry
button. The recheck on foreground, on a token refresh and on every mode switch
repeats the checks. Every identity check and capability lookup carries a request id;
an answer for a superseded request, another account or a signed-out state is dropped.
A lookup the backend refuses with an authentication error withdraws verification and
asks `getUser()` again instead of signing out directly; only `getUser()` can end a
session.

The gateway judges one session and removes that same session. `verifyIdentity()`
reads the stored session once and sends that session's access token to `getUser()`.
When the server refuses it, the gateway reads the stored session again and signs out
locally only if its access token is still the refused one; it announces the removal
(`SIGNED_OUT`) before the answer returns. If a different session is stored by then (the
same account signed in again, another account signed in, or the token was refreshed),
that session was not judged: it is left alone and the answer is `unreachable`, so
nothing is authorized or removed and the next check judges the new session. A refusal
is never keyed on the account id, because two sessions of one account are different
sessions.

This is not atomic and the SDK offers nothing that would make it so. The client is
created without the optional lock, `signOut()` removes whichever session is stored when
it finishes, and it waits for a server request (`/logout`) before removing anything.
A session established between the comparison and that removal, including during the
request, is therefore still removed with the refused one. The outcome fails closed (the
user is signed out and signs in again) and is pinned by tests that name it as a known
limit. The SDK's own `getUser()` also removes the stored session when the server says
`session_not_found`, whichever session that is.

### Sign-out

Access state follows the stored session, not the outcome of the sign-out call. The
gateway calls `signOut({ scope: 'local' })`, and the SDK announces `SIGNED_OUT` only
after it has removed the session from storage; the provider enters the guest state
when it receives that event and not before. `AccessApi.signOut()` returns the gateway
outcome without changing state.

The pinned SDK returns from `signOut()` before removing anything when it cannot load
the stored session: with an expired access token and no connectivity, the refresh
fails with a retryable error, the SDK retries with backoff for roughly 25 seconds, and
then returns an error with the session still stored and no event. In that case the
account stays signed in, `SignOutControl` shows "Could not sign out" and the button
works as the retry. The SDK also caches a failed refresh for 60 seconds, so a retry
inside that window fails at once and a later one succeeds once connectivity is back.
While offline with an expired token the device therefore cannot be signed out; this
is the SDK's behavior, and the app does not delete the stored session behind the SDK's
back. When the SDK removes the session but the server cannot be told (`/logout` fails),
the event still fires, the app is signed out and the server-side session lapses on its
own; the call's error is not shown because the screen that would show it is gone. A
refused session whose removal returns an error is reported as `unreachable`, never as
removed.

The grant table is deliberately minimal: user id, `active`/`revoked` status and
timestamps. Only trusted backend operators (`postgres`, `service_role`) can write
it; `anon` has no access and an authenticated user can read only their own row.
It is a technical access grant, not worker onboarding or qualification. Route
guards are navigation control only; future Worker operations need server-side
authorization of their own.

### Error classification

`getUser()` errors end a session only when Supabase names a dead session or account
(`AuthSessionMissingError`/`session_not_found`, `bad_jwt`, `session_expired`,
`user_not_found`, `user_banned`, `refresh_token_not_found`,
`refresh_token_already_used`). HTTP status alone is not trusted: 401/403/404 with
other or no codes, 429, 5xx and transport errors keep the session unverified.
Capability lookups follow PostgREST semantics: `PGRST301/302/303` and an HTTP 401
(including anonymous `42501`) mean the token was refused; `42501` with 403 is
"denied"; `42P01`/`PGRST205` is a missing table; `PGRST116` or an unexpected row is
malformed; everything else, including `PGRST300`, is "unavailable". All of them deny Worker.

## Session storage

The Supabase session is persisted through `src/lib/chunked-storage.ts` into
`expo-secure-store` (iOS Keychain, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`). A value is
split into immutable chunks in one of two slots; a small manifest item (slot, count,
length, FNV-1a checksum) names the committed slot. A write fills the other slot and
then replaces the manifest, so a reader gets the previous complete value or the new
complete value. That guarantee depends on a single-item write being atomic, which the
Keychain's per-item add/update provides but this module cannot create across items.
Removing the previous generation is best effort: a failure leaves unreachable chunks
that the next write overwrites and never changes what is read. A missing chunk, a
checksum mismatch or a corrupt manifest is reported as `StorageIntegrityError`
(session restore then falls back to the guest shell) and is replaced by the next
write; `removeItem` clears the manifest and both slots, including after a lost manifest.
Operations are serialized per storage instance; the scheme does not coordinate
separate processes. Keys are encoded reversibly, so distinct keys cannot collide.
Values above 200 chunks are refused before any write. The mode preference lives in the
same store and is bound to one user id; it is cleared on sign-out.

## Configuration

Copy `apps/mobile/.env.example` to an ignored `.env` in `apps/mobile`. Everything in
it is bundled into the app and readable by anyone who installs it: never put a secret
key, `service_role` key, SMS, AI or signing credential there. The URL and publishable
key come from the local stack (`npm run db:status`). The target
must be `local`, the API URL a loopback or private-network origin and the key a
publishable (or local anon) key; secret and service_role keys are rejected.
Loopback ports are dynamic (`npm run db:status`). A physical iPhone cannot reach a
developer machine's `127.0.0.1`; a reviewed LAN path with explicit binding is
needed and the loopback binding guard must not be weakened.

The local `supabase/config.toml` keeps signup and phone providers disabled, so
phone sign-in is not operable end to end by default. Enabling it needs, in an
uncommitted local override, `[auth] enable_signup`, `[auth.sms] enable_signup` and
a provider or a local test configuration; test OTP values must never be committed.

## Timeouts and failure handling

Restoring a stored session (8 s), the identity check (8 s), each capability lookup
(10 s) and reading the saved preference (5 s) are bounded. A restore that times out or
fails opens the guest shell; an identity check that times out keeps the stored account
in Client, unverified; a lookup that times out resolves to Client with Worker status
unknown, also for a re-check during Worker mode; a preference read that fails resolves
to Client. These deadlines stop the app WAITING. Only the capability lookup is
actually cancelled (an `AbortSignal` is passed to the request and aborted on timeout or
when a newer lookup supersedes it). `getUser()`, `getSession()` and keychain reads have
no cancellation, so they may complete after the app moved on; their results are
discarded by request id and cannot change state.

## Gateway and source conventions

The `AuthGateway` is the seam between access state and the Supabase Auth client.
Tokens never cross it. `IdentityCheck` has three answers: `valid`; `invalid`, meaning
the server refused the stored session and it is already removed from the device;
`unreachable`, meaning no answer applies to the stored session (offline, server error,
unrecognised error, or the session was replaced while the check ran), so nothing is
authorized and nothing is removed. `restoreSession()` reads storage without asking the
server and is an unverified claim. `verifyOtp` treats the session returned by the Auth
server for the code just confirmed as a verified login. Auth state callbacks only
forward values, because calling Auth methods inside them can deadlock. `getUser()`
without a token reads the stored session itself, which leaves open which session was
judged, so the gateway reads the session once and sends its access token. Error codes
follow the [Supabase Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes) and the
[PostgREST error semantics](https://docs.postgrest.org/en/stable/references/errors.html).

Identity is `verified` only after the Auth server confirmed the account in this run.
Every reducer reset moves both request counters so answers to earlier checks and
lookups cannot be applied to the state that replaced them. A Worker request, whether
from the button or from a pre-login intent, is answered only after the lookup and the
identity check have both settled, and is granted only when both allow it. An auth event
that already named a session wins over the slower restore, and a stored preference
cannot override a backend answer that already denied Worker. Route policy and the
protected stack are navigation control only; every future Worker operation must be
authorized by the backend.

Deliberate failure handling, none of which affects what a reader or an authorization
decision sees: mode-preference writes and clears are cosmetic and their failures are
ignored; removal of superseded keychain chunks is best effort; an unreadable saved
preference resolves to no preference; a corrupt manifest is reported to the caller as
`StorageIntegrityError`. The checksum guards against truncated or altered chunks and
is not a security control. Distinct keys cannot collide because every character outside
`[A-Za-z0-9]` is encoded as `_<hex>_`. Chunks of a slot are written in ascending order
and deleted from the highest index so they stay contiguous if a delete fails midway; an
unreadable manifest is replaced, a failed read is not, so a transient keychain error
never discards a value that may still be intact; removal deletes the manifest first and
then sweeps both slots even when a manifest was lost.

Other contracts: `withDeadline` resolves with its fallback when the operation throws,
rejects or does not settle in time and cancels the request only through `onTimeout`;
callers discard late results by their own request identity. Phone numbers accept the
`0…`, `84…`, `0084…` and `+84…` presentations, reject a trunk `0` after the country
code (`+840…`), and are displayed masked. Auth failure messages are never forwarded
because they may repeat the phone number. The client accepts only loopback and
private-network Supabase origins, never defaults to a hosted project, and Expo inlines
only literal `process.env.EXPO_PUBLIC_*` references. `worker_access_grants` is a
server-controlled technical grant rather than onboarding or qualification; rows are
provisioned and revoked only by `postgres` and `service_role`.

Source files carry no explanatory comments; rationale lives in this document.
The root policy requires zero source comments, and `check:comments` enforces it over
the complete delivered state.

## Test coverage

| Layer | Evidence | Kind |
| --- | --- | --- |
| Reducer and route policy (`access-reducer.test.ts`, `route-policy.test.ts`) | Identity transitions, request ids, Worker predicate | Unit |
| Provider (`access-provider*.test.tsx`) | Event ordering, deferred promises, fake timers, account switches, late answers, aborts | Unit with fake gateway |
| `supabase-auth-gateway-sdk.test.tsx` | The real Auth client against a scripted Auth server and in-memory storage: error classification on SDK-produced errors, removal of a refused session, replacement before and after the comparison, sign-out with an expired token while offline, the retry cooldown, and the provider over the real gateway and restart. Nothing in it is evidence about the hosted or local Auth service | Unit against the real SDK, scripted server |
| Other gateway and repository tests | OTP contract, event forwarding and PostgREST response shapes | Unit against stubbed clients |
| `chunked-storage.test.ts` | Fault injection at every store call, restart, corruption, concurrency | Unit against an in-memory keychain |
| `navigation.test.tsx` | Real Expo Router tree through `renderRouter` with fake services | Component integration |
| `supabase/tests/database/worker-access-grants.test.sql` | RLS, grants, revocation, anonymous and cross-account denial | pgTAP, runs only on the canonical stack |

`navigation.test.tsx` imports the feature modules at the top of the file so that the
one-time module loading and, on a cold Jest cache, Babel transformation of the route tree
happen while the suite loads and not inside the first test's 5 second limit. Before this
the first test timed out when the suite ran from a cold cache on a CPU-starved core
(11.4 s on two of two runs) and passed in 2.9 s with it; the sporadic timeout seen on an
initial run is consistent with that cause.

Not covered: a real Auth or PostgREST service (the scripted server above is not one), a real Keychain, a native iOS build or
device, and real SMS delivery. Metro serving the bundle proves bundling only.

## Known dependency advisories

On 2026-10-29, `npm audit` reports 13 low and six high findings. Three high findings
are in Expo's command-line dependency chain, which
runs on developer machines and is not part of the iOS bundle: an `expo export
--platform ios` bundle on 2026-10-27 contained no `node-forge`, `zod` or `@expo/cli`
strings, and `npm ls --omit=dev` reaches them only through `expo` → `@expo/cli`. One advisory was resolved on 2026-10-27 by a lockfile-only update of
`node-forge` from 1.4.0 to 1.4.1 inside the existing `^1.4.0` ranges of `@expo/cli`
and `@expo/code-signing-certificates` (GHSA-86w9-cpqp-85rv; the 1.4.1 tarball adds the
canonical DigestInfo check to RSA PKCS#1 v1.5 verification and nothing else of
consequence, and its integrity matches the registry). That release is hours old, so a
review of it before relying on it is reasonable.

| Advisory | Package and path | Range | Patched | Preconditions | Assessment |
| --- | --- | --- | --- | --- | --- |
| GHSA-mrhx-c7xc-m3w5 | `zod` 3.25.76 nested in `@expo/cli` | `<4.6.6` | 4.6.6 (4.x only) | Large arrays without length bounds reaching a schema | Memory exhaustion of a developer tool process; advisory text describes the 4.x code path, so applicability to 3.25.76 is unconfirmed |

The other two findings (`@expo/cli`, `expo`) are only chains to that advisory.
`@expo/cli` requires `zod@^3.25.76`, and no 3.x release is patched. `npm audit fix
--force` proposes Expo SDK 54, a major downgrade of the whole app stack, and overriding
`zod` to a different major inside the CLI is untested; neither is applied. The
residual risk is **unresolved and requires owner acceptance**; it is not accepted by
the agent. Mitigations: run Expo tooling only on trusted developer machines and CI,
and re-run `npm audit` on every Expo SDK patch update.

The other three high findings are the `re2js` lookbehind denial-of-service advisory
and its `markdownlint` and `markdownlint-cli2` dependency chains. They affect the
repository lint path rather than the mobile bundle. `markdownlint` pins the affected
version, and npm proposes a major downgrade; no unsupported override was applied.

## Commands

```sh
npm ci --ignore-scripts
npm run check:mobile        # typecheck, lint and unit tests
npm run verify:mobile-sdk   # expo install --check (needs the Expo API)
npm --workspace apps/mobile run start
```

`npm run check` includes `check:mobile`. Native iOS builds, signing, TestFlight
and real SMS delivery are not part of this foundation.
