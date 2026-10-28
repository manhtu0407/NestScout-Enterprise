create schema nestscout_private;
revoke all on schema nestscout_private from public, anon, authenticated;
grant usage on schema nestscout_private to authenticated;

create table public.service_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id),
  version integer not null check (version > 0),
  scope text not null check (char_length(btrim(scope)) between 1 and 4000),
  amount_minor bigint not null check (amount_minor between 0 and 9007199254740991),
  currency text not null check (currency = 'VND'),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  unique (request_id, version),
  check ((accepted_at is null) = (accepted_by is null))
);

create unique index service_quotes_one_acceptance on public.service_quotes (request_id) where accepted_at is not null;

alter table public.service_quotes enable row level security;
revoke all on table public.service_quotes from public, anon, authenticated;
grant select on table public.service_quotes to authenticated;

create policy service_quotes_select_owner on public.service_quotes
  for select to authenticated
  using (coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from public.service_requests r where r.id = request_id and r.owner_id = (select auth.uid())));

create function nestscout_private.accept_service_quote(p_quote_id uuid, p_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_request_id uuid;
  v_quote public.service_quotes%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select q.request_id into v_request_id
  from public.service_quotes q
  join public.service_requests r on r.id = q.request_id
  where q.id = p_quote_id and r.owner_id = v_owner;
  if v_request_id is null then
    raise exception using errcode = '42501', message = 'quote unavailable';
  end if;

  perform 1 from public.service_requests r where r.id = v_request_id and r.owner_id = v_owner for update;
  if not found then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  select * into v_quote from public.service_quotes q where q.id = p_quote_id and q.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'quote unavailable'; end if;
  if v_quote.version is distinct from p_version then
    raise exception using errcode = '40001', message = 'stale quote';
  end if;
  if v_quote.accepted_at is not null then
    return v_quote.id;
  end if;
  if exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.accepted_at is not null)
    or exists (select 1 from public.service_quotes q where q.request_id = v_request_id and q.version > v_quote.version) then
    raise exception using errcode = '40001', message = 'stale quote';
  end if;
  if v_quote.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'quote expired';
  end if;

  update public.service_quotes
    set accepted_at = clock_timestamp(), accepted_by = v_owner
    where id = p_quote_id;
  return p_quote_id;
end;
$$;

revoke all on function nestscout_private.accept_service_quote(uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.accept_service_quote(uuid, integer) to authenticated;

create function public.accept_service_quote(p_quote_id uuid, p_version integer)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select nestscout_private.accept_service_quote(p_quote_id, p_version);
$$;

revoke all on function public.accept_service_quote(uuid, integer) from public, anon, authenticated;
grant execute on function public.accept_service_quote(uuid, integer) to authenticated;
