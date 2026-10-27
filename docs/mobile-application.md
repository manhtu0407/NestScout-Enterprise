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

A launch with no session lands on the guest shell without a role chooser. A
restored session is verified with the server, then the capability lookup runs
before any protected route renders. Expo Router protected groups plus the
`EntryRedirect` destination keep guests out of Client and Worker routes, send an
unauthorized Worker deep link to Client, and avoid redirect loops. An unreachable
server never promotes Worker access: the account stays in Client and can retry.

Sign-in uses `signInWithOtp({ phone, options: { shouldCreateUser: true } })` and
`verifyOtp({ phone, token, type: 'sms' })` with the number normalized by
`libphonenumber-js` to `+84` E.164 (accepting `0…`, `84…`, `0084…` and `+84…`).
The phone and code are held in memory only; they are never placed in URLs, logs
or stored values. Success is reported only when Auth returns a session.

## Roles and modes

Authentication says who the person is. Worker mode requires a row in
`public.worker_access_grants` with `status = 'active'` for that exact user. The
app reads the caller's own row under the authenticated session (row level security
is the authority) and re-reads it on sign-in, resume, token refresh and every mode
switch. Loading, resolved, revoked and error are distinct; an error, a missing row
or a malformed row never grants Worker. The saved preferred mode is a keychain value
bound to one account and is ignored unless the backend currently grants Worker.

The grant table is deliberately minimal: user id, `active`/`revoked` status and
timestamps. Only trusted backend operators (`postgres`, `service_role`) can write
it; `anon` has no access and an authenticated user can read only their own row.
It is a technical access grant, not worker onboarding or qualification. Route
guards are navigation control only; future Worker operations need server-side
authorization of their own.

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

## Commands

```sh
npm ci --ignore-scripts
npm run check:mobile        # typecheck, lint and unit tests
npm run verify:mobile-sdk   # expo install --check (needs the Expo API)
npm --workspace apps/mobile run start
```

`npm run check` includes `check:mobile`. Native iOS builds, signing, TestFlight
and real SMS delivery are not part of this foundation.
