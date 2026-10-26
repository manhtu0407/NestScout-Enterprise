---
name: be-auth-rls
description: "Implement or audit Supabase Auth, grants and row-level security at the database trust boundary, with real allowed and denied identities. Use for cross-user exposure and ownership policies; exclude UI-only login changes, Kael tool approvals and generic migration formatting."
metadata:
  library: nestscout-engineering-skills
  domain: backend
  specialty: supabase-authorization
  consumer: codex,claude-code
  version: "1.0.0"
---
# Authentication and row authorization

Prove who can perform which operation on which rows through the real access path.
Read root `AGENTS.md` and [technical references](references/source-evidence.md).

## Inputs and selection

Require actual tables/views/functions, role and ownership requirements, exposed
schemas, JWT verification path, grants, policies and allowed test target. Recover
existing rules from approved code/specifications; do not invent NestScout role
entitlements. An authenticated role alone does not establish object access.

- Positive: “Another signed-in customer can update this customer's row.”
- Negative: “Style a login button” or “Approve an agent's refund tool.”
- Neighbor: `kael-tool-permissions` controls executor approvals; this skill controls
  database authorization. `be-schema-migrations` owns rollout/history concerns.

## Procedure

1. Map caller to verified identity, role, membership and object ownership. Distinguish
   unauthenticated API access from Supabase anonymous sign-in, which can use the
   authenticated database role. Verify JWT signature/issuer/audience/expiry with
   the actual supported library; decoding a payload is not verification.
2. Inspect the intersection of schema usage/table or function grants and RLS.
   Enable RLS on exposed tables, restrict unnecessary grants and define the
   intended policies. No grant can make an RLS-denied row accessible; a missing
   grant can still deny a policy-permitted operation. Test both layers.
3. Inspect SELECT/INSERT/UPDATE/DELETE separately. For UPDATE, check visibility
   plus USING for old rows and WITH CHECK for new rows, especially ownership
   reassignment. INSERT needs its new-row check; SELECT absence may appear as zero
   rows. Check applicable permissive/restrictive policy combinations.
4. Trace bypass paths: owner/BYPASSRLS/service roles, views, RPC functions and
   security-definer code. On supported PostgreSQL versions, security-invoker
   views can preserve caller RLS. For a justified definer function inspect owner,
   safe search_path, qualified objects, caller checks and EXECUTE grants.
   Do not add elevated execution to make a failing client request pass.
5. Never trust user-editable user_metadata for authorization. Trusted app metadata
   still has token freshness/revocation limits; sensitive membership decisions
   need the approved source of truth. Do not expose secret/service-role keys to
   mobile clients, fixtures or transcripts. Use the caller-scoped access path.
6. For an authorized change, preserve existing client response contracts and
   implement policies in the existing migration/test workflow. Do not deploy,
   rotate keys, change hosted users or weaken verification while troubleshooting.
7. Test with two distinct ordinary users, cross-owner and cross-role targets,
   unauthenticated/anonymous identities and intended privileged paths. A database
   owner executing SET ROLE incorrectly or a service-role client can invalidate
   the test; record the effective role, claims and actual request path.

## Validation and recovery

Include allowed own-row read/write, denied other-row read/write, forged owner,
ownership reassignment, missing/revoked membership, expired/invalid token,
view/RPC access and any intended admin exception. Count affected rows and inspect
unchanged protected data; “no error” or an empty list alone is not the oracle.

Use the existing owned local stack and relevant database tests. No product role
contract means BLOCKED_PRODUCT for that decision; absent runtime/identity evidence
means BLOCKED for enforcement. Keep the previous policy diff available for scoped
recovery, but do not restore a known exposure merely to eliminate a client error.

## Output and completion

Return role × operation × object allow/deny evidence, bypass-path findings,
exact file/line and authorized diff, commands/exits and unresolved assumptions.
Complete when the relevant trust boundaries and negative cases have execution
evidence, or label them unverified. Audit requests stay read-only. Root policy
governs sensitive or external operations; no source snippet expands that scope.
