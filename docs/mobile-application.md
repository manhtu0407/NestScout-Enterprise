# Mobile application foundation

Technical guide for `apps/mobile` under the root [engineering policy](../AGENTS.md).
Application Foundation V2 implements entry, phone sign-in, role resolution and
Client/Worker mode gates. It contains technical placeholders only: no service
catalog, booking, worker job, earnings, pricing or Kael behavior exists, and the
owner has not yet supplied process documents or final UI.

## Versions

Expo SDK 58 (React Native 0.88, React 19.3.0, Expo Router 58) with TypeScript
strict mode, installed through the single root npm workspace and lockfile. Direct
dependencies are pinned exactly. The workspace uses the Expo SDK's TypeScript 6
while the repository tooling keeps the native-port TypeScript 7; the mobile ESLint
configuration redirects only its own process to TypeScript 6 for typescript-eslint.
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

Copy `apps/mobile/.env.example` to an ignored `.env` in `apps/mobile`. The target
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

## Test coverage

| Layer | Evidence | Kind |
| --- | --- | --- |
| Reducer and route policy (`access-reducer.test.ts`, `route-policy.test.ts`) | Identity transitions, request ids, Worker predicate | Unit |
| Provider (`access-provider*.test.tsx`) | Event ordering, deferred promises, fake timers, account switches, late answers, aborts | Unit with fake gateway |
| `supabase-auth-gateway-sdk.test.ts` | The real Auth client against a scripted Auth server and in-memory storage: error classification on SDK-produced errors, removal of a refused session, replacement before and after the comparison | Unit against the real SDK, scripted server |
| Other gateway and repository tests | OTP contract, event forwarding and PostgREST response shapes | Unit against stubbed clients |
| `chunked-storage.test.ts` | Fault injection at every store call, restart, corruption, concurrency | Unit against an in-memory keychain |
| `navigation.test.tsx` | Real Expo Router tree through `renderRouter` with fake services | Component integration |
| `supabase/tests/database/worker-access-grants.test.sql` | RLS, grants, revocation, anonymous and cross-account denial | pgTAP, runs only on the canonical stack |

Not covered: a real Auth or PostgREST service (the scripted server above is not one), a real Keychain, a native iOS build or
device, and real SMS delivery. Metro serving the bundle proves bundling only.

## Known dependency advisories

`npm audit` reports five high findings, all in Expo's command-line tooling, which runs
on developer machines and is not part of the Metro iOS bundle (verified for
`node-forge`, `zod` and the code-signing package). They reduce to two advisories:

| Advisory | Package and path | Range | Patched | Preconditions | Assessment |
| --- | --- | --- | --- | --- | --- |
| GHSA-86w9-cpqp-85rv | `node-forge` 1.4.0 via `@expo/cli` and `@expo/code-signing-certificates` | `<=1.4.0` | none published | Verifying attacker-supplied RSA PKCS#1 v1.5 signatures | Not used by app code; relevant only if Expo code-signing tooling verifies untrusted signatures. `expo-updates` is not installed |
| GHSA-mrhx-c7xc-m3w5 | `zod` 3.25.76 nested in `@expo/cli` | `<4.6.6` | 4.6.6 (4.x only) | Large arrays without length bounds reaching a schema | Memory exhaustion of a developer tool process; advisory text describes the 4.x code path, so applicability to 3.25.76 is unconfirmed |

The three remaining findings (`@expo/cli`, `@expo/code-signing-certificates`, `expo`)
are only chains to those two. `npm audit fix --force` proposes Expo SDK 54, a major
downgrade of the whole app stack, and overriding `zod` to a different major inside the
CLI is untested; neither is applied. The residual risk is **unresolved and requires
owner acceptance**; it is not accepted by the agent. Mitigations: run Expo tooling
only on trusted developer machines and CI, never feed it untrusted certificates, and
re-run `npm audit` on every Expo SDK patch update.

## Commands

```sh
npm ci --ignore-scripts
npm run check:mobile        # typecheck, lint and unit tests
npm run verify:mobile-sdk   # expo install --check (needs the Expo API)
npm --workspace apps/mobile run start
```

`npm run check` includes `check:mobile`. Native iOS builds, signing, TestFlight
and real SMS delivery are not part of this foundation.
