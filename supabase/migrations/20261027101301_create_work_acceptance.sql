alter table public.service_jobs drop constraint service_jobs_stage_check;
alter table public.service_jobs add constraint service_jobs_stage_check
  check (stage in ('assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted', 'completed'));

alter table public.service_job_events drop constraint service_job_events_event_check;
alter table public.service_job_events add constraint service_job_events_event_check
  check (event in ('assigned', 'en_route', 'arrived', 'working', 'paused', 'submitted', 'accepted', 'revision_requested', 'disputed'));

create table public.service_submissions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  submitted_by uuid not null references auth.users (id),
  submission_key uuid not null,
  submitted_from_version integer not null check (submitted_from_version > 0),
  evidence text not null check (char_length(btrim(evidence)) between 1 and 4000),
  decision text not null default 'pending' check (decision in ('pending', 'accepted', 'revision_requested', 'disputed')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decided_from_version integer,
  decision_reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (submitted_by, submission_key),
  check ((decision = 'pending' and decided_at is null and decided_by is null and decided_from_version is null)
    or (decision <> 'pending' and decided_at is not null and decided_by is not null and decided_from_version is not null))
);
create unique index service_submissions_one_pending on public.service_submissions (job_id) where decision = 'pending';

create table public.service_cases (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  submission_id uuid references public.service_submissions (id),
  kind text not null check (kind in ('dispute', 'aftercare')),
  opened_by uuid not null references auth.users (id),
  operation_key uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  unique (opened_by, operation_key),
  check ((kind = 'dispute') = (submission_id is not null))
);

alter table public.service_submissions enable row level security;
alter table public.service_cases enable row level security;
revoke all on table public.service_submissions, public.service_cases from public, anon, authenticated;
grant select on table public.service_submissions, public.service_cases to authenticated;

create policy service_submissions_select_participant on public.service_submissions
  for select to authenticated using (exists (select 1 from public.service_jobs j where j.id = job_id));
create policy service_cases_select_participant on public.service_cases
  for select to authenticated using (opened_by = (select auth.uid())
    and exists (select 1 from public.service_jobs j where j.id = job_id));

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
  if p_version is not null and exists (select 1 from public.service_job_events e
    where e.job_id = p_job_id and e.version = p_version + 1 and e.actor_id = v_worker and e.event = p_next) then
    return p_version + 1;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if p_next is null or not ((v_job.stage = 'assigned' and p_next = 'en_route')
    or (v_job.stage = 'en_route' and p_next = 'arrived')
    or (v_job.stage = 'arrived' and p_next = 'working')
    or (v_job.stage in ('assigned', 'en_route', 'arrived', 'working', 'submitted') and p_next = 'paused')) then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  update public.service_jobs set stage = p_next, version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, p_next, v_job.version + 1);
  return v_job.version + 1;
end;
$$;

create function nestscout_private.submit_service_work(p_job_id uuid, p_version integer, p_key uuid, p_evidence text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_worker uuid;
  v_job public.service_jobs%rowtype;
  v_previous public.service_submissions%rowtype;
  v_submission uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  if p_key is null or p_evidence is null or char_length(btrim(p_evidence)) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid evidence';
  end if;
  select * into v_job from public.service_jobs j where j.id = p_job_id and j.worker_id = v_worker for update;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select * into v_previous from public.service_submissions s where s.submitted_by = v_worker and s.submission_key = p_key;
  if found then
    if v_previous.job_id <> p_job_id or v_previous.evidence <> btrim(p_evidence)
      or v_previous.submitted_from_version is distinct from p_version then
      raise exception using errcode = '22023', message = 'submission key conflict';
    end if;
    return v_previous.id;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if v_job.stage <> 'working' then raise exception using errcode = '22023', message = 'invalid transition'; end if;
  insert into public.service_submissions (job_id, submitted_by, submission_key, submitted_from_version, evidence)
    values (p_job_id, v_worker, p_key, p_version, btrim(p_evidence)) returning id into v_submission;
  update public.service_jobs set stage = 'submitted', version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, 'submitted', v_job.version + 1);
  return v_submission;
end;
$$;
revoke all on function nestscout_private.submit_service_work(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.submit_service_work(uuid, integer, uuid, text) to authenticated;

create function public.submit_service_work(p_job_id uuid, p_version integer, p_key uuid, p_evidence text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.submit_service_work(p_job_id, p_version, p_key, p_evidence); $$;
revoke all on function public.submit_service_work(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_service_work(uuid, integer, uuid, text) to authenticated;

create function nestscout_private.decide_service_submission(p_submission_id uuid, p_version integer, p_decision text, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_submission public.service_submissions%rowtype;
  v_job public.service_jobs%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'submission unavailable';
  end if;
  if p_decision not in ('accepted', 'revision_requested', 'disputed') or p_decision is null
    or (p_decision <> 'accepted' and (p_reason is null or char_length(btrim(p_reason)) not between 1 and 4000))
    or (p_decision = 'accepted' and p_reason is not null) then
    raise exception using errcode = '22023', message = 'invalid decision';
  end if;
  select s.* into v_submission from public.service_submissions s
    join public.service_jobs j on j.id = s.job_id
    join public.service_requests r on r.id = j.request_id
    where s.id = p_submission_id and r.owner_id = v_owner;
  if not found then raise exception using errcode = '42501', message = 'submission unavailable'; end if;
  select * into v_job from public.service_jobs j where j.id = v_submission.job_id for update;
  if not found or not exists (select 1 from public.service_requests r where r.id = v_job.request_id and r.owner_id = v_owner) then
    raise exception using errcode = '42501', message = 'submission unavailable';
  end if;
  select * into v_submission from public.service_submissions s where s.id = p_submission_id and s.job_id = v_job.id for update;
  if not found then raise exception using errcode = '42501', message = 'submission unavailable'; end if;
  if v_submission.decision = p_decision and v_submission.decided_by = v_owner
    and v_submission.decided_from_version = p_version
    and v_submission.decision_reason is not distinct from nullif(btrim(p_reason), '') then
    return v_submission.id;
  end if;
  if v_job.version is distinct from p_version then raise exception using errcode = '40001', message = 'stale job'; end if;
  if v_job.stage <> 'submitted' or v_submission.decision <> 'pending' then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  update public.service_submissions set decision = p_decision, decided_by = v_owner,
    decided_at = clock_timestamp(), decided_from_version = p_version,
    decision_reason = nullif(btrim(p_reason), '') where id = p_submission_id;
  if p_decision = 'disputed' then
    insert into public.service_cases (job_id, submission_id, kind, opened_by, operation_key, reason)
      values (v_job.id, p_submission_id, 'dispute', v_owner, gen_random_uuid(), btrim(p_reason));
  end if;
  update public.service_jobs set stage = case p_decision when 'accepted' then 'completed'
    when 'revision_requested' then 'working' else 'submitted' end, version = version + 1 where id = v_job.id;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (v_job.id, v_owner, p_decision, v_job.version + 1);
  return p_submission_id;
end;
$$;
revoke all on function nestscout_private.decide_service_submission(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function nestscout_private.decide_service_submission(uuid, integer, text, text) to authenticated;

create function public.decide_service_submission(p_submission_id uuid, p_version integer, p_decision text, p_reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.decide_service_submission(p_submission_id, p_version, p_decision, p_reason); $$;
revoke all on function public.decide_service_submission(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.decide_service_submission(uuid, integer, text, text) to authenticated;

create function nestscout_private.open_service_aftercare(p_job_id uuid, p_key uuid, p_reason text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_job public.service_jobs%rowtype;
  v_case public.service_cases%rowtype;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  if p_key is null or p_reason is null or char_length(btrim(p_reason)) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid reason';
  end if;
  select j.* into v_job from public.service_jobs j join public.service_requests r on r.id = j.request_id
    where j.id = p_job_id and r.owner_id = v_owner for update of j;
  if not found then raise exception using errcode = '42501', message = 'job unavailable'; end if;
  select * into v_case from public.service_cases c where c.opened_by = v_owner and c.operation_key = p_key;
  if found then
    if v_case.job_id <> p_job_id or v_case.kind <> 'aftercare' or v_case.reason <> btrim(p_reason) then
      raise exception using errcode = '22023', message = 'case key conflict';
    end if;
    return v_case.id;
  end if;
  if v_job.stage <> 'completed' then raise exception using errcode = '22023', message = 'job not completed'; end if;
  insert into public.service_cases (job_id, kind, opened_by, operation_key, reason)
    values (p_job_id, 'aftercare', v_owner, p_key, btrim(p_reason)) returning * into v_case;
  return v_case.id;
end;
$$;
revoke all on function nestscout_private.open_service_aftercare(uuid, uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.open_service_aftercare(uuid, uuid, text) to authenticated;

create function public.open_service_aftercare(p_job_id uuid, p_key uuid, p_reason text)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.open_service_aftercare(p_job_id, p_key, p_reason); $$;
revoke all on function public.open_service_aftercare(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.open_service_aftercare(uuid, uuid, text) to authenticated;
