alter table public.service_job_events drop constraint service_job_events_event_check;
alter table public.service_job_events add constraint service_job_events_event_check
  check (event in ('assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted',
    'accepted', 'revision_requested', 'disputed', 'scope_proposed', 'scope_approved', 'scope_rejected'));

create table public.service_scope_changes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  proposed_by uuid not null references auth.users (id),
  proposal_key uuid not null,
  proposed_from_version integer not null check (proposed_from_version > 0),
  sequence integer not null check (sequence > 0),
  old_scope text not null,
  old_amount_minor bigint not null,
  new_scope text not null check (char_length(btrim(new_scope)) between 1 and 4000),
  new_amount_minor bigint not null check (new_amount_minor between 0 and 9007199254740991),
  currency text not null check (currency = 'VND'),
  rationale text not null check (char_length(btrim(rationale)) between 1 and 4000),
  basis text not null check (basis = 'local_fixture'),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id),
  decided_from_version integer,
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (job_id, sequence),
  unique (proposed_by, proposal_key),
  check ((decision = 'pending' and decided_by is null and decided_from_version is null and decided_at is null)
    or (decision <> 'pending' and decided_by is not null and decided_from_version is not null and decided_at is not null))
);
create unique index service_scope_changes_one_pending on public.service_scope_changes (job_id) where decision = 'pending';
alter table public.service_scope_changes enable row level security;
revoke all on table public.service_scope_changes from public, anon, authenticated;
grant select on table public.service_scope_changes to authenticated;
create policy service_scope_changes_select_participant on public.service_scope_changes
  for select to authenticated using (exists (select 1 from public.service_jobs j where j.id = job_id));

create function nestscout_private.block_unapproved_scope()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if exists (select 1 from public.service_scope_changes s where s.job_id = new.job_id and s.decision = 'pending') then
    raise exception using errcode = '22023', message = 'scope decision pending';
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.block_unapproved_scope() from public, anon, authenticated;
create trigger service_submissions_block_unapproved_scope before insert on public.service_submissions
  for each row execute function nestscout_private.block_unapproved_scope();

create function nestscout_private.block_start_with_unapproved_scope()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.stage = 'working' and old.stage <> 'working'
    and exists (select 1 from public.service_scope_changes s where s.job_id = new.id and s.decision = 'pending') then
    raise exception using errcode = '22023', message = 'scope decision pending';
  end if;
  return new;
end;
$$;
revoke all on function nestscout_private.block_start_with_unapproved_scope() from public, anon, authenticated;
create trigger service_jobs_block_unapproved_scope before update on public.service_jobs
  for each row execute function nestscout_private.block_start_with_unapproved_scope();

create function nestscout_private.propose_service_scope(p_job_id uuid, p_version integer, p_key uuid, p_scope text, p_amount bigint, p_rationale text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_worker uuid;
  v_job public.service_jobs%rowtype;
  v_previous public.service_scope_changes%rowtype;
  v_scope text;
  v_amount bigint;
  v_sequence integer;
  v_proposal uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_key is null or p_scope is null or char_length(btrim(p_scope)) not between 1 and 4000
    or p_rationale is null or char_length(btrim(p_rationale)) not between 1 and 4000
    or p_amount is null or p_amount not between 0 and 9007199254740991 then
    raise exception using errcode = '22023', message = 'invalid proposal';
  end if;
  select * into v_job from public.service_jobs j where j.id = p_job_id and j.worker_id = v_worker for update;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select * into v_previous from public.service_scope_changes s where s.proposed_by = v_worker and s.proposal_key = p_key;
  if found then
    if v_previous.job_id <> p_job_id or v_previous.proposed_from_version is distinct from p_version
      or v_previous.new_scope <> btrim(p_scope) or v_previous.new_amount_minor <> p_amount
      or v_previous.rationale <> btrim(p_rationale) then
      raise exception using errcode = '22023', message = 'proposal key conflict';
    end if;
    return v_previous.id;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if v_job.stage <> 'working' or exists (select 1 from public.service_scope_changes s where s.job_id = p_job_id and s.decision = 'pending') then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  select s.new_scope, s.new_amount_minor into v_scope, v_amount from public.service_scope_changes s
    where s.job_id = p_job_id and s.decision = 'approved' order by s.sequence desc limit 1;
  if not found then
    select q.scope, q.amount_minor into v_scope, v_amount from public.service_quotes q where q.id = v_job.quote_id;
  end if;
  select coalesce(max(s.sequence), 0) + 1 into v_sequence from public.service_scope_changes s where s.job_id = p_job_id;
  insert into public.service_scope_changes (job_id, proposed_by, proposal_key, proposed_from_version, sequence,
    old_scope, old_amount_minor, new_scope, new_amount_minor, currency, rationale, basis)
    values (p_job_id, v_worker, p_key, p_version, v_sequence, v_scope, v_amount, btrim(p_scope), p_amount, 'VND', btrim(p_rationale), 'local_fixture')
    returning id into v_proposal;
  update public.service_jobs set version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, 'scope_proposed', v_job.version + 1);
  return v_proposal;
end;
$$;
revoke all on function nestscout_private.propose_service_scope(uuid, integer, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function nestscout_private.propose_service_scope(uuid, integer, uuid, text, bigint, text) to authenticated;

create function public.propose_service_scope(p_job_id uuid, p_version integer, p_key uuid, p_scope text, p_amount bigint, p_rationale text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.propose_service_scope(p_job_id, p_version, p_key, p_scope, p_amount, p_rationale); $$;
revoke all on function public.propose_service_scope(uuid, integer, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.propose_service_scope(uuid, integer, uuid, text, bigint, text) to authenticated;

create function nestscout_private.decide_service_scope(p_proposal_id uuid, p_job_version integer, p_sequence integer, p_decision text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_proposal public.service_scope_changes%rowtype;
  v_job public.service_jobs%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'proposal unavailable';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid decision';
  end if;
  select s.* into v_proposal from public.service_scope_changes s
    join public.service_jobs j on j.id = s.job_id join public.service_requests r on r.id = j.request_id
    where s.id = p_proposal_id and r.owner_id = v_owner;
  if not found then raise exception using errcode = '42501', message = 'proposal unavailable'; end if;
  select * into v_job from public.service_jobs j where j.id = v_proposal.job_id for update;
  if not found or not exists (select 1 from public.service_requests r where r.id = v_job.request_id and r.owner_id = v_owner) then
    raise exception using errcode = '42501', message = 'proposal unavailable';
  end if;
  select * into v_proposal from public.service_scope_changes s where s.id = p_proposal_id and s.job_id = v_job.id for update;
  if not found then raise exception using errcode = '42501', message = 'proposal unavailable'; end if;
  if v_proposal.sequence is distinct from p_sequence then raise exception using errcode = '40001', message = 'stale proposal'; end if;
  if v_proposal.decision = p_decision and v_proposal.decided_by = v_owner and v_proposal.decided_from_version = p_job_version then
    return v_proposal.id;
  end if;
  if v_job.version is distinct from p_job_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if v_job.stage <> 'working' or v_proposal.decision <> 'pending' then raise exception using errcode = '22023', message = 'invalid transition'; end if;
  update public.service_scope_changes set decision = p_decision, decided_by = v_owner,
    decided_from_version = p_job_version, decided_at = clock_timestamp() where id = p_proposal_id;
  update public.service_jobs set version = version + 1 where id = v_job.id;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (v_job.id, v_owner, case p_decision when 'approved' then 'scope_approved' else 'scope_rejected' end, v_job.version + 1);
  return p_proposal_id;
end;
$$;
revoke all on function nestscout_private.decide_service_scope(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function nestscout_private.decide_service_scope(uuid, integer, integer, text) to authenticated;

create function public.decide_service_scope(p_proposal_id uuid, p_job_version integer, p_sequence integer, p_decision text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.decide_service_scope(p_proposal_id, p_job_version, p_sequence, p_decision); $$;
revoke all on function public.decide_service_scope(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.decide_service_scope(uuid, integer, integer, text) to authenticated;

create or replace function nestscout_private.worker_jobs()
returns table (job_id uuid, stage text, version integer, scope text, amount_minor bigint, currency text)
language sql stable security definer set search_path = ''
as $$
  select j.id, j.stage, j.version, coalesce(s.new_scope, q.scope), coalesce(s.new_amount_minor, q.amount_minor), q.currency
  from public.service_jobs j join public.service_quotes q on q.id = j.quote_id and q.request_id = j.request_id
  left join lateral (select c.new_scope, c.new_amount_minor from public.service_scope_changes c
    where c.job_id = j.id and c.decision = 'approved' order by c.sequence desc limit 1) s on true
  where j.worker_id = auth.uid() and nestscout_private.current_worker_eligible();
$$;
