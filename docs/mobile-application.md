# Mobile application

Technical guide for `apps/mobile` under the root [engineering policy](../AGENTS.md).
The initial Application Foundation V2 entry and mode-gate slice has expanded. The
current source includes Customer and Worker areas, service-request intake across the
service catalog, job activity, Kael conversations and persisted Kael sessions, plus
account and worker data flows. Supabase owns Auth, Postgres, Storage, RPCs and the
Kael Edge Function boundary.

These are implemented application paths with local and contract coverage, not proof
of complete commercial dispatch, payment settlement, live SMS delivery or production
readiness. A native iOS build, TestFlight/App Store upload and device behavior remain
unverified. See [architecture decisions](architecture.md),
[service workflow contracts](service-workflow.md), and
[Supabase development](supabase-development.md) for their separate boundaries.

## Design fidelity contract

The iOS icon `apps/mobile/assets/horizon/app-icon.png` is a reconstructed render
of the third, white-background mascot variant in the owner-supplied
`NestScout Kael Mascot Style Guide.png` (source SHA-256
`b15f95e9b647f80a9809bb238e692f2263b23271d931e5d4a2671d97b34bc0cf`).
The opaque 1024-pixel PNG has SHA-256
`23f1f799222a6c5746227a9c580e388bd1883265ea60d0487d6b97ed40c39277`.

### Design foundation

The [Apple HIG accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility)
and [haptics guidance](https://developer.apple.com/design/human-interface-guidelines/playing-haptics)
inform the foundation. React Native's [AccessibilityInfo](https://reactnative.dev/docs/accessibilityinfo)
provides the Reduce Motion query and change event.

`src/theme/palette.ts` owns semantic Light/Dark colors; `src/theme/layout.ts`
owns spacing, geometry, opacity, elevation, motion durations and typography.
The prior NestScout Horizon design discussion records Sea Glass Mint `#A5E6D8`,
Ocean Mist `#8FE3D4`, Sea Teal `#145C57`, Dark Neutral `#253436` and Soft
Background `#F5FBF9` as reference colors. The palette uses these exact values for
brand roles, light canvas and text, the light action accent, and the dark action
accent and foreground. Other semantic colors remain application values; an exact
approved dark, high-contrast and component-state specification was not found.
The supplied iOS foundation ZIP explicitly marks its example colors provisional.
Native fidelity and the role mappings remain subject to visual review.
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
Other shared button feedback is immediate. Shared controls intentionally emit no
haptics: ordinary presses, typing, scrolling and animation do not justify them.
If a future meaningful confirmation, destructive action or stage change warrants
haptics, its owner must use a compatible platform API only when available, avoid
duplicate feedback, and keep the action functional when haptics are unavailable,
disabled or fail. Text and visual state must communicate the outcome independently.
No haptics module, native haptic implementation or native material is claimed.

Use the public `features/shared` exports and semantic tokens for Client and Worker
interfaces. The existing `design-governance.test.ts` checks visual literals in
feature styles; it does not prove semantic appropriateness or resolve
all dynamic styles. Review additions to the canonical tokens and component APIs.

### SDK metadata

The existing Expo SDK 58 metadata disagreement is tracked in
[Expo issue #52454](https://github.com/expo/expo/issues/52454). The installed
lockfile retains the bundled matrix versions; the online SDK check previously
rejected React Native `0.88.1` in favor of `0.88.0`. No workaround is applied.

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
| `src/features/worker` | Worker mode shell (role switch, sign-out) | Entitlement granting |
| `src/features/shared` | UI used by both modes, including the glass surfaces, press controls and icon set | Other features, privileged credentials |
| `src/features/horizon` | Kael chat shell, sidebar, preview | Authorization, session code |
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

Removal is not atomic across the gateway comparison and the SDK call. If a different
session replaces the refused one after the comparison but before `signOut()` reads
storage, the SDK signs out the replacement too; the outcome fails closed and the
user signs in again. In `2.119.0`, local sign-out removes the session before awaiting
`/logout`, so a new session established while that server request waits remains stored.
Both boundaries are pinned by tests. The SDK's `getUser()` also removes the stored
session when the server says `session_not_found`, whichever session is then stored.

### Sign-out

Access state follows the SDK auth event, not the sign-out result. The gateway calls
`signOut({ scope: 'local' })`; when the SDK removes the session it emits `SIGNED_OUT`
and the provider enters the guest state. `AccessApi.signOut()` still returns the
gateway outcome without overriding the event-driven state.

In `@supabase/supabase-js`/`@supabase/auth-js` `2.119.0`, local sign-out removes the
stored session before its best-effort `/logout` request. If that request fails, the
SDK returns the network error while the app is already signed out; the server may
retain the refresh token until expiry. If the access token has expired, the SDK
first attempts refresh. A retryable offline/5xx failure takes roughly 25 seconds,
then the local scope removes the session, emits `SIGNED_OUT` and returns the error.
The app does not delete SDK storage directly or claim that the server revoked a
refresh token when no successful server request occurred.

The `2.119.0` release notes include a `global` sign-out fix, and its versioned Auth
source also removes a local session after a retryable refresh failure. The SDK suite
checks replacement timing, refresh, local offline removal and server logout/revocation
against a scripted Auth server. It does not prove hosted Auth behavior. Upstream
[issue #2795](https://github.com/supabase/supabase-js/issues/2795) records the
original `2.118.0` behavior; compare it with the
[versioned `2.119.0` source](https://github.com/supabase/supabase-js/blob/v2.119.0/packages/core/auth-js/src/GoTrueClient.ts).

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
| `supabase-auth-gateway-sdk.test.tsx` | The real Auth client against a scripted Auth server and in-memory storage: error classification, refused-session removal, replacement before comparison and during `/logout`, offline expired-token removal, refresh and server refresh-token rejection after successful logout, plus provider state and restart. Nothing in it is evidence about a hosted or local Auth service | Unit against the real SDK, scripted server |
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

The Expo/Zod finding tracked by Issue #42 is resolved in the lockfile on
`main` `9b4cc9b`: Expo remains `58.0.23`, `@expo/cli` is `58.1.19`, and the
resolved Zod is `4.6.7`. The current `npm audit` does not report
GHSA-mrhx-c7xc-m3w5. The previously recorded `node-forge` update remains in the
same lockfile.

| Advisory | Package and path | Affected / fixed | Preconditions | Assessment |
| --- | --- | --- | --- | --- |
| GHSA-mrhx-c7xc-m3w5 | Zod under Expo tooling | `<4.6.6` / `4.6.6+` | Oversized collections reach a Zod schema | Resolved by the current Expo CLI dependency graph; no Expo downgrade or forced override |
| GHSA-gg6h-894w-4m9c | `markdownlint-cli2` → `markdownlint` → `re2js` | `<2.8.7` / `2.8.7` | Lookbehind mode with repeated matching APIs | Fixed by the root `re2js` patch override; development-only, outside the mobile bundle |

The audit on this maintenance branch found `re2js` `2.8.6` through the
development-only `markdownlint` dependency. The root npm override pins the compatible
patch `2.8.7`. npm's suggested `--force` fix downgrades `markdownlint-cli2`; that
downgrade was not used. The post-fix `npm audit` on 2026-11-11 exits 1 with 1 low,
29 moderate, no high and no critical findings. Remaining advisories include
`glob`/`minimatch` through Expo tooling and other development dependencies; the
named Zod and RE2JS advisories are absent. The full findings remain visible for
separate review.

## Commands

```sh
npm ci --ignore-scripts
npm run check:mobile        # typecheck, lint and unit tests
npm run verify:mobile-sdk   # expo install --check (needs the Expo API)
npm --workspace apps/mobile run start
```

`npm run check` includes `check:mobile`. `apps/mobile/eas.json` has TestFlight and
App Store build/submit profiles, but no EAS build or upload is evidenced here.
Native device behavior, live Auth/OTP and real SMS delivery are separate checks.

## Horizon development preview

The offline design showcase, the Horizon sample preview and the Kael motion and workflow labs
were removed; every design now runs in the live application. Run `npm run preview:local`
for the local stack, or the hosted target below for the approved Supabase project.

For authorized Kael-only production verification, launch the web build with
`EXPO_PUBLIC_NESTSCOUT_TARGET=kael-hosted-preview`,
`EXPO_PUBLIC_SUPABASE_URL=https://axpdymbusiwxfzurfclg.supabase.co`, and that
project's `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use an authorized disposable
Supabase Auth account in the Preview sign-in dialog. This target mounts the
real Kael chat and memory settings with a separate Preview session. It omits
business navigation and approval controls. The hosted target is available on
web at any origin and in any build mode, but never to native builds, and still
requires the pinned HTTPS origin, a publishable key and Supabase Auth. Regular
local targets keep their private-network restriction. TestFlight
(`testflight`) and App Store (`app-store`) builds are release iOS builds that
read dedicated `EXPO_PUBLIC_TESTFLIGHT_SUPABASE_*` or
`EXPO_PUBLIC_APP_STORE_SUPABASE_*` variables and accept only the same pinned
origin. No AI provider credential exists in any client target.

In the application, selecting Worker from a guest session starts phone sign-in;
an authenticated Worker request rechecks the existing access capability. A
cancelled request cannot switch modes when a late check returns. Horizon draft
text and selected images are held in memory, remain with the current account,
and are transferred from a guest only when the guest starts the Worker sign-in
from the mode picker. An unrelated sign-in, account change or sign-out clears
the prior account's Horizon draft. Browser object URLs are released when images
are removed or their owning draft is cleared. Drafts do not survive an app
restart. Chat and image analysis are not connected; an attempted send preserves
the draft and reports that it was not sent.

The composer menu can attach a photo taken with the camera (`expo-image-picker`,
`NSCameraUsageDescription`); it joins the same attachments as a library photo and is
not sent. The microphone converts speech to text on the client
(`expo-speech-recognition`, language `vi-VN`, `NSMicrophoneUsageDescription` and
`NSSpeechRecognitionUsageDescription`). Stopping places the transcript in the composer
for the user to edit and send; cancelling discards it, and nothing is sent
automatically. No audio is recorded, stored or uploaded by the application. On iOS the
operating system may process the speech with Apple. Both features need a native
rebuild for the permission strings; they have not been run on a device, and Vietnamese
accuracy and on-device processing are not verified.
Browser rendering does not verify the native iOS runtime.

### Liquid Glass controls

The three controls in the chat header (sidebar button, new-conversation and
options pill), the conversation options menu and the three sidebar controls
(search button, floating new-conversation capsule and account button) are the
only glass surfaces in the Horizon flow. Glass is reserved for the control and navigation layer; list
rows, chat bubbles, the composer and every other content surface stay solid,
and glass is never stacked on glass. The recipe follows the sibling HomeServices
prototype (`GlassSurface`, `LiquidControlButton`, `LiquidPillButton`,
`LiquidPopUpButton`) adapted to this workspace's tokens in `src/theme`.

`GlassSurface` renders one of three paths. Where `expo-glass-effect` reports both
`isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` it draws a native
`GlassView` with the regular style and no custom tint, so the system owns the
refraction and the person's Liquid Glass setting. Only the primary action, the
sidebar new-conversation capsule, uses the `accent` tone: a mint `tintColor` on
the native view, a translucent mint fill with a soft shadow on the fallback and
a solid mint surface under Reduce Transparency. Otherwise it draws a
translucent surface with a frost highlight and a gradient rim (react-native-svg);
on web a CSS backdrop filter supplies the blur. Reduce Transparency replaces
glass with a solid neutral surface on every path, and Reduce Motion replaces the
press and menu springs with short fades.
Opacity is never animated on a glass surface because it flattens the native
effect; the menu fades its content and the scrim instead.

The press spring (stiffness 320, damping 22), the menu pop spring (stiffness
200, damping 14) and the control sizes live in `horizonLayout.glass`; the fills,
shadows and gradient stops live in `horizonColors.liquid`. The native `GlassView`
path, Reduce Transparency on a device and the iOS 26 or later refraction are NOT
VERIFIED: only the web fallback and Jest were exercised. There is no `expo-blur`
fallback, so Android and older iOS show the translucent surface without blur.

### Icon design reference

The icon set in `features/shared/ui/icon.tsx` follows the Lucide visual language.
Lucide is the reference for every new or changed icon:
<https://lucide.dev/icons/>. Coding agents look icons up there first, reuse the
Lucide name where one exists, and keep the Lucide construction: a 24 by 24 grid,
a 2 px stroke, round line caps and joins, and no fills except for dots. Do not
invent a new glyph while a Lucide equivalent exists.

### Skeleton loading states

A skeleton is a placeholder shaped like the content that is still loading: grey
blocks for avatars and text lines with a soft mint highlight sweeping across
them. It replaces a spinner only while something is genuinely loading and never
stands in for an error or for invented data.

Two places use it. The first-open screen of the Horizon home flow renders
`KaelHomeLoading` while the access state is `bootstrapping` or `resolving`
(`EntryRedirect` takes a `pending` render prop and keeps its original
accessibility label, so the busy announcement is unchanged). Its blocks match the
real header, the Kael avatar position, the chat area and the composer, so the
screen does not jump when the home screen replaces it. The sidebar renders
`RecentSkeleton` in the "Gần đây" group while `recentLoading` is true. The other
sidebar rows are static content and are never skeletonised.

`Skeleton` is the labelled root (progress bar role, `aria-busy`) and owns one
shared sweep so every block moves in step; `SkeletonBlock` is a single block.
Skeletons are content, not controls, so they are solid and never glass. With
Reduce Motion the sweep is stopped and the blocks stay still. Sizes and the sweep
timing live in `horizonLayout.skeleton`; the base colour and highlight stops live
in `horizonColors.skeleton`.

The signed-in sidebar reads persisted Kael sessions through `useKaelSessions`;
its session query status drives the real recent-session loading skeleton. The
design preview (`HorizonPreview`) still simulates its own loading state for
`horizonLayout.skeleton.previewDuration`. The preview timer is not a live-query
signal. On a device, the sweep and Reduce Motion are NOT VERIFIED: only the web
preview and Jest were exercised.

### Kael progress motion

Kael's chat and its progress sheet carry a few small animations. They show state
the app already knows about and never stand in for state it does not have.

- `KaelThinkingRow` appears in the chat only while `kaelPhase` is `clarifying` or
  `matching`. It joins a dot loader, a status line that shimmers and swaps text
  when the phase changes, and `KaelStepNotes`, the fixed description of the step.
  The notes are shown at once and are not presented as live reasoning. The runtime's
  task and approval events are not mapped to these illustrative phase labels.
- When the phase carries an issue (`needs_information`, `unmatched` or
  `unavailable`, the B01, B02 and B04 branches of the
  [service workflow](service-workflow.md)), the loader and shimmer stop and the
  wording says what is wrong. The row never keeps implying progress while matching
  is unavailable, and it never claims a worker was found.
- `KaelStreamingText` reveals an assistant message word by word. It only animates
  messages added after the screen opened, and when a message grows it animates
  only the new words, so a future chunked response needs no change.
- The progress sheet shows a spinner that becomes a check at `completed`. The
  check means the work is finished, not that it was paid: the sheet says payment
  is not confirmed, because completion does not imply settlement and payment
  verification is disabled.
- A recent session in the sidebar shimmers its subtitle only while its phase is
  `clarifying` or `matching`.

These eight phase labels remain a presentation model. The live
chat does not map runtime events to `kaelPhase` or its issue field; it displays the
runtime's activity, task and approval signals instead. A dedicated Kael Work flow
is not shipped. All durations and sizes live in
`horizonLayout.kaelMotion` and the colours in `horizonColors.kaelMotion`. With
Reduce Motion every animation is replaced by static text. On a device the motion and Reduce Motion are NOT VERIFIED:
only the web preview and Jest were exercised.

### App-wide motion

Small shared motion pieces in `features/horizon` replace abrupt changes of state:

- `Presence` fades and slides content in and out and keeps it mounted until the
  exit ends. The role banner, the composer error and the worker jobs notice use it,
  with `useRetained` holding the last message so the text does not vanish before the
  exit finishes. The saved workers screen uses it to open the profile details and to
  fade a card out before it is removed.
- `PopBadge` and `RollingNumber` animate the sidebar and group badges: the badge pops
  in when a count appears, the number rolls when it changes and the badge leaves when
  the count returns to zero.
- `HeartToggle` swaps the outline and filled heart with a short pop. In the saved
  workers list pressing it unsaves the worker; the card fades out and is then removed.

Nothing here adds a delay to a frequent action: exits are 160 ms and enters 220 ms.
No two notices ever share a slot in the app today, so there is no notice stack. The
sample figures on the earnings and quotes screens are not animated, because a
counting animation would make sample data look like live data. Durations and sizes are
in `horizonLayout.appMotion`, colours in `horizonColors.appMotion`, and Reduce Motion
replaces movement with a short fade. Behaviour on a
device is NOT VERIFIED.

## Worker jobs

The Worker sidebar entries New jobs, Accepted, In progress, Awaiting review and
History read Supabase through `features/shared/worker-repository.ts`. The
`useWorkerData` hook loads the worker snapshot and the `worker_job_cards()` projection
together, maps them with `worker-views.ts`, and sends every command (accept, decline,
advance, pause, resume, submit, propose scope, report) through one `perform` function
that reloads afterwards. Submit, scope proposal and report forms generate an
idempotency key when the form opens and reuse it for retries until the form closes. An
invitation shows no address or customer name until the worker accepts it. A safety
pause cannot be resumed. Worker mode uses the shared persisted Kael session and turn
runtime; its separate prompt landing remains preview-only. Sample data and local
simulation remain only in `HorizonPreview` (`useSampleWorkerJobs`), where the screen
shows its sample footnote. Drafts are not persisted across app restarts. Native
device behavior is NOT VERIFIED.

## Worker profile

The Worker sidebar entries Profile and certificates, Areas and services, and Customer
reviews read and write Supabase through `features/shared/worker-profile-repository.ts`.
`useWorkerData` loads `my_worker_profile()` with the job data, and `performProfile` sends
every profile command (save profile, save coverage, availability, add and remove
certificate) and reloads afterwards. A worker without a profile sees a creation form and
is asked to create one before choosing areas, services or reading reviews. A saved profile
is `worker_submitted` and never listed: only the operator changes `listed` and a
certificate `status`, and customers see neither until then. Certificates are titles with
a verification status; no document upload exists. Coverage and the availability switch in
the sidebar are stored on the profile, but no automatic matching reads them yet, so they do
not route jobs. Customers can review a worker whose profile is not listed, so ratings
accumulate before approval; the rating shows only from three reviews. Sample data and
local simulation remain only in `HorizonPreview` (`SampleWorkerProfileScreen`). Native
device behavior is NOT VERIFIED.

## Worker earnings

The Worker sidebar entries Earnings and Payout read `worker_earnings()` through
`features/shared/worker-earnings-repository.ts`; `useWorkerData` loads it with the jobs.
The function lists the worker's completed jobs that have an acceptance event, newest
first (at most 500), with the amount of the latest approved scope change or the quote
amount, and the acceptance day in `Asia/Ho_Chi_Minh`. `toEarningsView` buckets those days
on the client (today, the last seven days, the current month, a seven-day chart) using
the Vietnam day, so a late-evening acceptance counts for the next calendar day. The
figures are the value of work the customer accepted: no platform fee is deducted and no
payment is confirmed, and the screen says so. Payout is an honest closed state, with no
balance, no amount field and no withdraw button, until payment confirmation and a payout
process exist. The sidebar shows today's accepted value and the next job (first assigned,
else first active) from the same data, and placeholders while it loads. Sample figures
remain only in `HorizonPreview`. Native device behavior is NOT VERIFIED.

## Worker support and notifications

Help and Settings in the Worker sidebar are the same account-level screens as for
customers; Help sends `submit_support_request` for any verified account. Worker
notifications reuse the `notifications` table with eight extra kinds (`job_offered`,
`work_approved`, `revision_requested`, `work_disputed`, `scope_approved`, `scope_rejected`,
`resume_agreed`, `review_received`). They are created by database triggers on new open
invitations, customer decisions recorded as job events and new reviews, never by the
client, and their text carries only the request title. `readNotifications` takes an
audience and asks the server for only that audience's kinds, so a user holding both roles
sees customer notices as a customer and worker notices as a worker. The Notifications
entry of the Worker sidebar shows an unread badge; opening a notice marks it read and moves
to the matching tab (new offers, history, awaiting customer, in progress or reviews).
Notices for a job being offered, resumed or reviewed depend on those events existing, and
offers arrive only through the fixture operator commands described in the service workflow. The preview
does not simulate worker notifications. Native device behavior is NOT VERIFIED.

## Customer, Kael and Worker lifecycle

The Requests screen lets the owner store a preferred visit time for a request that
has no assigned Worker yet: a day from the calendar and a time slot, saved through
`set_request_preferred_visit` and labelled as a wish, not a confirmed appointment.
Workers see that time on the offer and the job. When the Worker submits work, the
request card shows the evidence with three decisions: accept (a second confirmation
states that acceptance is not payment), request a correction and open a dispute, each
with a reason where required, all through `decide_service_submission`.

"Hỏi Kael" on requests, quotes, saved workers and Worker jobs returns to the Kael chat
with a prompt about that item placed in the composer. Nothing is sent until the user
sends it, so consent and confirmation rules are unchanged. The button appears only
where the screen is connected to Kael. Kael replies offer copy, a rating with a closed
set of reasons stored through `set_kael_feedback`, regenerate for the latest reply
when no confirmation is pending (it resends the previous user message as a new turn;
approvals cannot be replayed), and read-aloud only where the runtime provides speech
synthesis. A Kael question event shows tappable answers that are sent as the next
message. A Worker whose public profile is not listed cannot be saved, and the screen
says so instead of reporting a connection failure.

### AI data sharing and legal documents

Terms and Privacy remain available to read in Settings and are marked as drafts pending
legal review. The beta does not ask users to accept them or record legal acceptance.
Missing operator details in the draft therefore do not block account access or workflow
testing.

Authorizing Kael provider requests is a separate, explicit choice. A signed-in account
without an `ai_sharing` record sees no card or dialog; sending a message sends nothing and
the composer explains that the Share data with AI switch in Settings › Privacy must be turned
on first. The same choice can be changed at any time with that switch. Before the switch, the screen explains that prompts, conversation
history, related request and job details, and reply preferences may be sent to the
configured model provider. When web search is enabled, the search query may also be sent
to Perplexity. No Kael message is sent without an `ai_sharing` record; both the app and
the backend enforce this. Users can withdraw the choice in Settings › Privacy. Turning
on AI sharing does not accept the Terms or Privacy Policy.

### Kael citations

A Kael reply may carry source markers of the form `kael:SOURCE_ID@REVISION#HASH`. The reply
view hides them and, once the reply is complete, looks each one up in
`kael_knowledge_sources` with the caller's own session. It shows a numbered source chip
only when a currently published row matches the id, revision and hash, and the chip opens
the stored title and excerpt. An unmatched marker is dropped without a chip. The hosted
project had no knowledge rows on 2026-11-14, so no chip appears there until sources are
ingested; community-sourced citations have no data source and are not shown.

### Follow-up on a selected passage

A complete Kael reply has a select-passage action. It shows the reply text, and the highlighted
passage can be sent back to Kael with Explain, Improve, Shorten, Tone or Grammar as an ordinary
follow-up message. Nothing is sent until an action is chosen. The recommendation card has no
runtime event that carries options with confidence, so it is not shown in the live chat.

### Preview launch commands

`npm run preview:local` serves the app on port 8085 against the Supabase Local stack of the
current checkout (start it first with `npm run db:start`). It runs from the checkout that contains
the script, so a Preview restarted from a worktree always serves that worktree's code,
never another checkout's. It clears the Metro cache on start. A Preview configuration that
points at a script outside the repository, or at a different checkout, can serve an older
build that lacks the features merged since.

### Local Preview verification

The Preview runs the real app against Supabase Local with
`EXPO_PUBLIC_NESTSCOUT_TARGET=local`, the local API URL and the local publishable key,
on port 8085. Disposable accounts are created through the local Auth admin API with
email and password and signed in through the Email path. Worker grant, fixture
eligibility, readiness documents and the fixture operator row are inserted in the local
database because no client can grant them. Locally the Kael Edge function has no model
credential, so a chat turn ends with `provider_unavailable`; the Kael-coordinated
effects are verified by the real-gateway integration test in
`scripts/supabase-mcp.integration.test.mjs`, where only the model turns are scripted.
Fixture Worker accounts require a trusted active Worker grant and fixture eligibility,
but can accept test invitations without uploading identity documents. A public Worker
listing still requires an identity document. On web, the slide-to-confirm control needs
a pointer drag with intermediate moves, and its accessibility action is available only
to native assistive technologies.
