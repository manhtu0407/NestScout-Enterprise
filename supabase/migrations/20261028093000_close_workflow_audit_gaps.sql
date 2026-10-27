alter table public.service_quotes
  add column basis text not null default 'local_fixture' check (basis = 'local_fixture');
alter table public.service_invitations
  add column basis text not null default 'local_fixture' check (basis = 'local_fixture');

alter table public.service_submissions add column correction_note text
  check (correction_note is null or char_length(btrim(correction_note)) between 1 and 4000);
update public.service_submissions set correction_note = decision_reason where decision = 'revision_requested';
alter table public.service_submissions add constraint service_submissions_note_matches_decision
  check ((decision = 'revision_requested') = (correction_note is not null));

revoke select on table public.service_submissions from authenticated;
grant select (id, job_id, submitted_by, submitted_from_version, evidence, decision, decided_at,
  decided_from_version, correction_note, created_at) on public.service_submissions to authenticated;

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
    or (v_job.stage in ('assigned', 'en_route', 'arrived', 'working') and p_next = 'paused')) then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  update public.service_jobs set stage = p_next, version = version + 1 where id = p_job_id;
  insert into public.service_job_events (job_id, actor_id, event, version) values (p_job_id, v_worker, p_next, v_job.version + 1);
  return v_job.version + 1;
end;
$$;

create or replace function nestscout_private.decide_service_scope(p_proposal_id uuid, p_job_version integer, p_sequence integer, p_decision text)
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
  if v_job.stage not in ('working', 'paused') or v_proposal.decision <> 'pending' then
    raise exception using errcode = '22023', message = 'invalid transition';
  end if;
  update public.service_scope_changes set decision = p_decision, decided_by = v_owner,
    decided_from_version = p_job_version, decided_at = clock_timestamp() where id = p_proposal_id;
  update public.service_jobs set version = version + 1 where id = v_job.id;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (v_job.id, v_owner, case p_decision when 'approved' then 'scope_approved' else 'scope_rejected' end, v_job.version + 1);
  return p_proposal_id;
end;
$$;

create or replace function nestscout_private.decide_service_submission(p_submission_id uuid, p_version integer, p_decision text, p_reason text)
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
    decision_reason = nullif(btrim(p_reason), ''),
    correction_note = case p_decision when 'revision_requested' then btrim(p_reason) else null end
    where id = p_submission_id;
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

alter table nestscout_private.kael_tool_audit drop constraint kael_tool_audit_outcome_check;
alter table nestscout_private.kael_tool_audit add constraint kael_tool_audit_outcome_check
  check (outcome in ('allowed', 'unavailable', 'rate_limited'));

create or replace function nestscout_private.kael_read_context(p_kind text, p_resource_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_actor uuid := auth.uid();
  v_stage text;
  v_outcome text := 'unavailable';
  v_result jsonb := jsonb_build_object('status', 'unavailable');
begin
  if v_actor is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    return v_result;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  if (select count(*) from nestscout_private.kael_tool_audit a
      where a.actor_id = v_actor and a.outcome <> 'rate_limited'
        and a.created_at > clock_timestamp() - interval '1 minute') >= 20 then
    if not exists (select 1 from nestscout_private.kael_tool_audit a
        where a.actor_id = v_actor and a.outcome = 'rate_limited'
          and a.created_at > clock_timestamp() - interval '1 minute') then
      insert into nestscout_private.kael_tool_audit (actor_id, resource_kind, resource_id, outcome)
        values (v_actor, case when p_kind in ('customer_request', 'worker_job') then p_kind else 'invalid' end,
          p_resource_id, 'rate_limited');
    end if;
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if char_length(p_kind) <= 32 and p_kind = 'customer_request' and p_resource_id is not null
    and exists (select 1 from public.service_requests r where r.id = p_resource_id and r.owner_id = v_actor) then
    v_outcome := 'allowed';
    v_result := jsonb_build_object('status', 'ok', 'kind', 'customer_request', 'resource_id', p_resource_id, 'state', 'request_received');
  elsif char_length(p_kind) <= 32 and p_kind = 'worker_job' and p_resource_id is not null and nestscout_private.current_worker_eligible() then
    select j.stage into v_stage from public.service_jobs j where j.id = p_resource_id and j.worker_id = v_actor;
    if found then
      v_outcome := 'allowed';
      v_result := jsonb_build_object('status', 'ok', 'kind', 'worker_job', 'resource_id', p_resource_id, 'state', v_stage);
    end if;
  end if;
  insert into nestscout_private.kael_tool_audit (actor_id, resource_kind, resource_id, outcome)
    values (v_actor, case when p_kind in ('customer_request', 'worker_job') then p_kind else 'invalid' end, p_resource_id, v_outcome);
  return v_result;
end;
$$;
