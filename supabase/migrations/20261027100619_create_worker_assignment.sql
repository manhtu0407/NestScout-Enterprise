create table nestscout_private.worker_dispatch_eligibility (
  user_id uuid primary key references auth.users (id),
  basis text not null check (basis = 'local_fixture'),
  active boolean not null
);
revoke all on table nestscout_private.worker_dispatch_eligibility from public, anon, authenticated;

create function nestscout_private.current_worker_eligible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'false'
    and exists (select 1 from public.worker_access_grants g
      join nestscout_private.worker_dispatch_eligibility e on e.user_id = g.user_id
      where g.user_id = auth.uid() and g.status = 'active' and e.active and e.basis = 'local_fixture');
$$;
revoke all on function nestscout_private.current_worker_eligible() from public, anon, authenticated;
grant execute on function nestscout_private.current_worker_eligible() to authenticated;

create unique index service_quotes_id_request on public.service_quotes (id, request_id);

create table public.service_invitations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id),
  quote_id uuid not null,
  worker_id uuid not null references auth.users (id),
  expires_at timestamptz not null,
  state text not null default 'open' check (state in ('open', 'accepted', 'declined', 'cancelled')),
  foreign key (quote_id, request_id) references public.service_quotes (id, request_id)
);

create table public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.service_requests (id),
  quote_id uuid not null,
  invitation_id uuid not null unique references public.service_invitations (id),
  worker_id uuid not null references auth.users (id),
  stage text not null default 'assigned' check (stage in ('assigned', 'en_route', 'arrived', 'working', 'paused')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  foreign key (quote_id, request_id) references public.service_quotes (id, request_id)
);

create table public.service_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  actor_id uuid not null references auth.users (id),
  event text not null check (event in ('assigned', 'en_route', 'arrived', 'working', 'paused')),
  version integer not null,
  created_at timestamptz not null default now(),
  unique (job_id, version)
);

alter table public.service_invitations enable row level security;
alter table public.service_jobs enable row level security;
alter table public.service_job_events enable row level security;
revoke all on table public.service_invitations, public.service_jobs, public.service_job_events from public, anon, authenticated;
grant select on table public.service_invitations, public.service_jobs, public.service_job_events to authenticated;

create policy service_invitations_select_worker on public.service_invitations
  for select to authenticated
  using (worker_id = (select auth.uid()) and (select nestscout_private.current_worker_eligible()));

create policy service_jobs_select_participant on public.service_jobs
  for select to authenticated
  using (coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and ((worker_id = (select auth.uid()) and (select nestscout_private.current_worker_eligible()))
      or exists (select 1 from public.service_requests r where r.id = request_id and r.owner_id = (select auth.uid()))));

create policy service_job_events_select_participant on public.service_job_events
  for select to authenticated
  using (exists (select 1 from public.service_jobs j where j.id = job_id));

create function nestscout_private.worker_offers()
returns table (invitation_id uuid, quote_id uuid, quote_version integer, scope text, amount_minor bigint, currency text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, q.id, q.version, q.scope, q.amount_minor, q.currency, i.expires_at
  from public.service_invitations i
  join public.service_quotes q on q.id = i.quote_id and q.request_id = i.request_id
  where i.worker_id = auth.uid() and nestscout_private.current_worker_eligible()
    and i.state = 'open' and i.expires_at > clock_timestamp() and q.accepted_at is not null
    and not exists (select 1 from public.service_jobs j where j.request_id = i.request_id);
$$;
revoke all on function nestscout_private.worker_offers() from public, anon, authenticated;
grant execute on function nestscout_private.worker_offers() to authenticated;

create function public.worker_offers()
returns table (invitation_id uuid, quote_id uuid, quote_version integer, scope text, amount_minor bigint, currency text, expires_at timestamptz)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.worker_offers(); $$;
revoke all on function public.worker_offers() from public, anon, authenticated;
grant execute on function public.worker_offers() to authenticated;

create function nestscout_private.worker_jobs()
returns table (job_id uuid, stage text, version integer, scope text, amount_minor bigint, currency text)
language sql stable security definer set search_path = ''
as $$
  select j.id, j.stage, j.version, q.scope, q.amount_minor, q.currency
  from public.service_jobs j join public.service_quotes q on q.id = j.quote_id and q.request_id = j.request_id
  where j.worker_id = auth.uid() and nestscout_private.current_worker_eligible();
$$;
revoke all on function nestscout_private.worker_jobs() from public, anon, authenticated;
grant execute on function nestscout_private.worker_jobs() to authenticated;

create function public.worker_jobs()
returns table (job_id uuid, stage text, version integer, scope text, amount_minor bigint, currency text)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.worker_jobs(); $$;
revoke all on function public.worker_jobs() from public, anon, authenticated;
grant execute on function public.worker_jobs() to authenticated;

create function nestscout_private.lock_current_worker()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid := auth.uid();
begin
  if v_worker is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  perform 1 from public.worker_access_grants g where g.user_id = v_worker and g.status = 'active' for share;
  if not found then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  perform 1 from nestscout_private.worker_dispatch_eligibility e
    where e.user_id = v_worker and e.active and e.basis = 'local_fixture' for share;
  if not found then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  return v_worker;
end;
$$;
revoke all on function nestscout_private.lock_current_worker() from public, anon, authenticated;

create function nestscout_private.accept_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_request_id uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker;
  if not found then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  v_request_id := v_invite.request_id;
  perform 1 from public.service_requests r where r.id = v_request_id for update;
  select * into v_invite from public.service_invitations i
    where i.id = p_invitation_id and i.worker_id = v_worker and i.request_id = v_request_id for update;
  if not found then raise exception using errcode = '42501', message = 'invitation unavailable'; end if;
  if v_invite.quote_id is distinct from p_quote_id or not exists
    (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.version = p_quote_version) then
    raise exception using errcode = '40001', message = 'stale terms';
  end if;
  if v_invite.state = 'accepted' then
    select j.id into v_job from public.service_jobs j where j.invitation_id = v_invite.id and j.worker_id = v_worker;
    if v_job is not null then return v_job; end if;
  end if;
  if v_invite.state <> 'open' or v_invite.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'invitation unavailable';
  end if;
  if not exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id
    and q.request_id = v_invite.request_id and q.accepted_at is not null) then
    raise exception using errcode = '22023', message = 'agreement unavailable';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id) then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  insert into public.service_jobs (request_id, quote_id, invitation_id, worker_id)
    values (v_invite.request_id, v_invite.quote_id, v_invite.id, v_worker) returning id into v_job;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (v_job, v_worker, 'assigned', 1);
  update public.service_invitations set state = 'accepted' where id = v_invite.id;
  return v_job;
end;
$$;
revoke all on function nestscout_private.accept_service_invitation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.accept_service_invitation(uuid, uuid, integer) to authenticated;

create function public.accept_service_invitation(p_invitation_id uuid, p_quote_id uuid, p_quote_version integer)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.accept_service_invitation(p_invitation_id, p_quote_id, p_quote_version); $$;
revoke all on function public.accept_service_invitation(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.accept_service_invitation(uuid, uuid, integer) to authenticated;

create function nestscout_private.advance_service_job(p_job_id uuid, p_version integer, p_next text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_job public.service_jobs%rowtype;
begin
  v_worker := nestscout_private.lock_current_worker();
  select * into v_job from public.service_jobs j where j.id = p_job_id and j.worker_id = v_worker for update;
  if not found then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  if p_version is not null and exists (select 1 from public.service_job_events e
    where e.job_id = p_job_id and e.version = p_version + 1 and e.actor_id = v_worker and e.event = p_next) then
    return p_version + 1;
  end if;
  if v_job.version is distinct from p_version then
    raise exception using errcode = '40001', message = 'stale job';
  end if;
  if p_next is null or not ((v_job.stage = 'assigned' and p_next = 'en_route')
    or (v_job.stage = 'en_route' and p_next = 'arrived')
    or (v_job.stage = 'arrived' and p_next = 'working')
    or (v_job.stage in ('assigned', 'en_route', 'arrived', 'working') and p_next = 'paused')) then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  update public.service_jobs set stage = p_next, version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (p_job_id, v_worker, p_next, v_job.version + 1);
  return v_job.version + 1;
end;
$$;
revoke all on function nestscout_private.advance_service_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function nestscout_private.advance_service_job(uuid, integer, text) to authenticated;

create function public.advance_service_job(p_job_id uuid, p_version integer, p_next text)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.advance_service_job(p_job_id, p_version, p_next); $$;
revoke all on function public.advance_service_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.advance_service_job(uuid, integer, text) to authenticated;
