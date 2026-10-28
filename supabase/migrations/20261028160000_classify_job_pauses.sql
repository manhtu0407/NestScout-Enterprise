alter table public.service_job_events drop constraint service_job_events_event_check;
alter table public.service_job_events add constraint service_job_events_event_check
  check (event in ('assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted',
    'accepted', 'revision_requested', 'disputed', 'scope_proposed', 'scope_approved', 'scope_rejected',
    'delay_reported', 'absence_reported', 'safety_escalated', 'resume_requested', 'resumed'));

create table public.service_job_pauses (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  category text not null check (category in ('ordinary_interruption', 'safety_concern')),
  prior_stage text not null check (prior_stage in ('assigned', 'en_route', 'arrived', 'working')),
  paused_by uuid not null references auth.users (id),
  paused_from_version integer not null check (paused_from_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  escalated_from_version integer check (escalated_from_version > 0),
  escalated_at timestamptz,
  resume_requested_by uuid references auth.users (id),
  resume_requested_from_version integer check (resume_requested_from_version > 0),
  resume_requested_at timestamptz,
  resumed_by uuid references auth.users (id),
  resumed_from_version integer check (resumed_from_version > 0),
  resumed_at timestamptz,
  check ((escalated_at is null) = (escalated_from_version is null)),
  check ((resume_requested_at is null) = (resume_requested_by is null)
    and (resume_requested_at is null) = (resume_requested_from_version is null)),
  check ((resumed_at is null) = (resumed_by is null) and (resumed_at is null) = (resumed_from_version is null)),
  check (resumed_at is null or resume_requested_at is not null),
  check (category = 'ordinary_interruption' or resumed_at is null),
  check (escalated_at is null or category = 'safety_concern')
);
create unique index service_job_pauses_one_open on public.service_job_pauses (job_id) where resumed_at is null;

alter table public.service_job_pauses enable row level security;
revoke all on table public.service_job_pauses from public, anon, authenticated;
grant select (id, job_id, category, prior_stage, paused_from_version, created_at, escalated_at,
  resume_requested_at, resumed_at) on public.service_job_pauses to authenticated;
create policy service_job_pauses_select_participant on public.service_job_pauses
  for select to authenticated using (exists (select 1 from public.service_jobs j where j.id = job_id));

insert into public.service_job_pauses (job_id, category, prior_stage, paused_by, paused_from_version, created_at)
select j.id, 'safety_concern',
  coalesce((select e.event from public.service_job_events e
    where e.job_id = j.id and e.version < coalesce(p.version, j.version) and e.event in ('assigned', 'en_route', 'arrived', 'working')
    order by e.version desc limit 1), 'assigned'),
  coalesce(p.actor_id, j.worker_id), greatest(coalesce(p.version, j.version) - 1, 1), coalesce(p.created_at, clock_timestamp())
from public.service_jobs j
left join lateral (select e.version, e.actor_id, e.created_at from public.service_job_events e
  where e.job_id = j.id and e.event = 'paused' order by e.version desc limit 1) p on true
where j.stage = 'paused';

create function public.worker_pauses()
returns table (job_id uuid, category text, prior_stage text, paused_from_version integer, resume_requested boolean, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select p.job_id, p.category, p.prior_stage, p.paused_from_version,
    p.category = 'ordinary_interruption' and p.resume_requested_at is not null, p.created_at
  from public.service_job_pauses p
  where p.resumed_at is null and p.job_id in (select w.job_id from nestscout_private.worker_jobs() w)
  order by p.job_id;
$$;
revoke all on function public.worker_pauses() from public, anon, authenticated;
grant execute on function public.worker_pauses() to authenticated;

create function public.customer_pauses()
returns table (job_id uuid, category text, prior_stage text, paused_from_version integer, resume_requested boolean, created_at timestamptz)
language sql stable security invoker set search_path = ''
as $$
  select p.job_id, p.category, p.prior_stage, p.paused_from_version,
    p.category = 'ordinary_interruption' and p.resume_requested_at is not null, p.created_at
  from public.service_job_pauses p
  where p.resumed_at is null and p.job_id in (
    select j.id from public.service_jobs j join public.service_requests r on r.id = j.request_id
    where r.owner_id = (select auth.uid()))
  order by p.job_id;
$$;
revoke all on function public.customer_pauses() from public, anon, authenticated;
grant execute on function public.customer_pauses() to authenticated;

create function nestscout_private.job_has_dispute(p_job_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.service_cases c where c.job_id = p_job_id and c.kind = 'dispute')
    or exists (select 1 from public.service_submissions s where s.job_id = p_job_id and s.decision = 'disputed');
$$;
revoke all on function nestscout_private.job_has_dispute(uuid) from public, anon, authenticated;

create or replace function nestscout_private.advance_service_job(p_job_id uuid, p_version integer, p_next text)
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
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  if p_version is not null and p_next is distinct from 'paused' and exists (select 1 from public.service_job_events e
    where e.job_id = p_job_id and e.version = p_version + 1 and e.actor_id = v_worker and e.event = p_next) then
    return p_version + 1;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if p_next is null or not ((v_job.stage = 'assigned' and p_next = 'en_route')
    or (v_job.stage = 'en_route' and p_next = 'arrived')
    or (v_job.stage = 'arrived' and p_next = 'working')) then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  update public.service_jobs set stage = p_next, version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, p_next, v_job.version + 1);
  return v_job.version + 1;
end;
$$;

create function nestscout_private.pause_service_job(p_job_id uuid, p_version integer, p_category text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_job public.service_jobs%rowtype;
  v_pause public.service_job_pauses%rowtype;
  v_open boolean;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_category is null or p_category not in ('ordinary_interruption', 'safety_concern') or p_version is null then
    raise exception using errcode = '22023', message = 'invalid pause';
  end if;
  select * into v_job from public.service_jobs j where j.id = p_job_id and j.worker_id = v_worker for update;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select * into v_pause from public.service_job_pauses p where p.job_id = p_job_id and p.resumed_at is null;
  v_open := found;
  if v_open and exists (select 1 from public.service_job_events e where e.job_id = p_job_id and e.version = p_version + 1
    and e.actor_id = v_worker and ((e.event = 'paused' and v_pause.paused_from_version = p_version and v_pause.category = p_category)
      or (e.event = 'safety_escalated' and v_pause.escalated_from_version = p_version and p_category = 'safety_concern'))) then
    return p_version + 1;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if v_job.stage in ('assigned', 'en_route', 'arrived', 'working') then
    insert into public.service_job_pauses (job_id, category, prior_stage, paused_by, paused_from_version)
      values (p_job_id, p_category, v_job.stage, v_worker, p_version);
    update public.service_jobs set stage = 'paused', version = version + 1 where id = p_job_id;
    insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, 'paused', v_job.version + 1);
    return v_job.version + 1;
  end if;
  if v_job.stage = 'paused' and p_category = 'safety_concern' and v_pause.category = 'ordinary_interruption' then
    update public.service_job_pauses set category = 'safety_concern', escalated_from_version = p_version,
      escalated_at = clock_timestamp() where id = v_pause.id;
    update public.service_jobs set version = version + 1 where id = p_job_id;
    insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, 'safety_escalated', v_job.version + 1);
    return v_job.version + 1;
  end if;
  raise exception using errcode = '22023', message = 'invalid transition';
end;
$$;
revoke all on function nestscout_private.pause_service_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function nestscout_private.pause_service_job(uuid, integer, text) to authenticated;

create function public.pause_service_job(p_job_id uuid, p_version integer, p_category text)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.pause_service_job(p_job_id, p_version, p_category); $$;
revoke all on function public.pause_service_job(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.pause_service_job(uuid, integer, text) to authenticated;

create function nestscout_private.request_service_resume(p_job_id uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
  v_job public.service_jobs%rowtype;
  v_pause public.service_job_pauses%rowtype;
  v_open boolean;
begin
  v_worker := nestscout_private.lock_current_worker();
  select * into v_job from public.service_jobs j where j.id = p_job_id and j.worker_id = v_worker for update;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select * into v_pause from public.service_job_pauses p where p.job_id = p_job_id and p.resumed_at is null;
  v_open := found;
  if v_open and p_version is not null and v_pause.resume_requested_by = v_worker and v_pause.resume_requested_from_version = p_version
    and exists (select 1 from public.service_job_events e where e.job_id = p_job_id and e.version = p_version + 1
      and e.actor_id = v_worker and e.event = 'resume_requested') then
    return p_version + 1;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if v_job.stage <> 'paused' or not v_open or v_pause.category <> 'ordinary_interruption' or v_pause.resume_requested_at is not null then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  if exists (select 1 from public.service_scope_changes s where s.job_id = p_job_id and s.decision = 'pending') then
    raise exception using errcode = '22023', message = 'scope decision pending';
  end if;
  if nestscout_private.job_has_dispute(p_job_id) then
    raise exception using errcode = '22023', message = 'dispute hold';
  end if;
  update public.service_job_pauses set resume_requested_by = v_worker, resume_requested_from_version = p_version,
    resume_requested_at = clock_timestamp() where id = v_pause.id;
  update public.service_jobs set version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, 'resume_requested', v_job.version + 1);
  return v_job.version + 1;
end;
$$;
revoke all on function nestscout_private.request_service_resume(uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.request_service_resume(uuid, integer) to authenticated;

create function public.request_service_resume(p_job_id uuid, p_version integer)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.request_service_resume(p_job_id, p_version); $$;
revoke all on function public.request_service_resume(uuid, integer) from public, anon, authenticated;
grant execute on function public.request_service_resume(uuid, integer) to authenticated;

create function nestscout_private.consent_service_resume(p_job_id uuid, p_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_job public.service_jobs%rowtype;
  v_pause public.service_job_pauses%rowtype;
  v_open boolean;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  select j.* into v_job from public.service_jobs j join public.service_requests r on r.id = j.request_id
    where j.id = p_job_id and r.owner_id = v_owner for update of j;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  if p_version is not null and exists (select 1 from public.service_job_events e where e.job_id = p_job_id
    and e.version = p_version + 1 and e.actor_id = v_owner and e.event = 'resumed') then
    return p_version + 1;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  select * into v_pause from public.service_job_pauses p where p.job_id = p_job_id and p.resumed_at is null for update;
  v_open := found;
  if v_job.stage <> 'paused' or not v_open or v_pause.category <> 'ordinary_interruption'
    or v_pause.resume_requested_at is null or v_pause.resume_requested_from_version + 1 <> v_job.version then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  if nestscout_private.job_has_dispute(p_job_id) then
    raise exception using errcode = '22023', message = 'dispute hold';
  end if;
  if not exists (select 1 from public.worker_access_grants g
      join nestscout_private.worker_dispatch_eligibility e on e.user_id = g.user_id
      where g.user_id = v_job.worker_id and g.status = 'active' and e.active and e.basis = 'local_fixture') then
    raise exception using errcode = '42501', message = 'worker unavailable';
  end if;
  update public.service_job_pauses set resumed_by = v_owner, resumed_from_version = p_version,
    resumed_at = clock_timestamp() where id = v_pause.id;
  update public.service_jobs set stage = v_pause.prior_stage, version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_owner, 'resumed', v_job.version + 1);
  return v_job.version + 1;
end;
$$;
revoke all on function nestscout_private.consent_service_resume(uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.consent_service_resume(uuid, integer) to authenticated;

create function public.consent_service_resume(p_job_id uuid, p_version integer)
returns integer language sql security invoker set search_path = ''
as $$ select nestscout_private.consent_service_resume(p_job_id, p_version); $$;
revoke all on function public.consent_service_resume(uuid, integer) from public, anon, authenticated;
grant execute on function public.consent_service_resume(uuid, integer) to authenticated;
