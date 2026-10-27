create table public.worker_access_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint worker_access_grants_revocation_consistent
    check ((status = 'revoked') = (revoked_at is not null))
);

alter table public.worker_access_grants enable row level security;

revoke all on table public.worker_access_grants from public, anon, authenticated;
grant select on table public.worker_access_grants to authenticated;

create policy worker_access_grants_select_own on public.worker_access_grants
  for select to authenticated
  using ((select auth.uid()) = user_id);
