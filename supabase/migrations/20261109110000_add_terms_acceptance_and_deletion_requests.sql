create table public.terms_acceptances (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document text not null check (document in ('terms')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]+(\.[0-9]+)*)?$'),
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (user_id, document, version)
);

create table public.account_deletion_requests (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  requested_at timestamptz not null default clock_timestamp()
);

alter table public.terms_acceptances enable row level security;
alter table public.account_deletion_requests enable row level security;
revoke all on table public.terms_acceptances, public.account_deletion_requests from public, anon, authenticated;
grant select on table public.terms_acceptances, public.account_deletion_requests to authenticated;

create policy terms_acceptances_select_owner on public.terms_acceptances
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create policy account_deletion_requests_select_owner on public.account_deletion_requests
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false');

create function nestscout_private.accept_terms(p_document text, p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_accepted timestamptz;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_document is distinct from 'terms' or p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(-v[0-9]+(\.[0-9]+)*)?$' then
    raise exception using errcode = '22023', message = 'invalid decision';
  end if;
  insert into public.terms_acceptances (user_id, document, version) values (v_owner, p_document, p_version)
  on conflict (user_id, document, version) do nothing;
  select a.accepted_at into v_accepted from public.terms_acceptances a
  where a.user_id = v_owner and a.document = p_document and a.version = p_version;
  return v_accepted;
end;
$$;
revoke all on function nestscout_private.accept_terms(text, text) from public, anon, authenticated;
grant execute on function nestscout_private.accept_terms(text, text) to authenticated;

create function public.accept_terms(p_document text, p_version text)
returns timestamptz language sql security invoker set search_path = ''
as $$ select nestscout_private.accept_terms(p_document, p_version); $$;
revoke all on function public.accept_terms(text, text) from public, anon, authenticated;
grant execute on function public.accept_terms(text, text) to authenticated;

create function nestscout_private.request_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_requested timestamptz;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  insert into public.account_deletion_requests (user_id) values (v_owner) on conflict (user_id) do nothing;
  select r.requested_at into v_requested from public.account_deletion_requests r where r.user_id = v_owner;
  return v_requested;
end;
$$;
revoke all on function nestscout_private.request_account_deletion() from public, anon, authenticated;
grant execute on function nestscout_private.request_account_deletion() to authenticated;

create function public.request_account_deletion()
returns timestamptz language sql security invoker set search_path = ''
as $$ select nestscout_private.request_account_deletion(); $$;
revoke all on function public.request_account_deletion() from public, anon, authenticated;
grant execute on function public.request_account_deletion() to authenticated;

create function nestscout_private.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  delete from public.account_deletion_requests where user_id = v_owner;
  return found;
end;
$$;
revoke all on function nestscout_private.cancel_account_deletion() from public, anon, authenticated;
grant execute on function nestscout_private.cancel_account_deletion() to authenticated;

create function public.cancel_account_deletion()
returns boolean language sql security invoker set search_path = ''
as $$ select nestscout_private.cancel_account_deletion(); $$;
revoke all on function public.cancel_account_deletion() from public, anon, authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
