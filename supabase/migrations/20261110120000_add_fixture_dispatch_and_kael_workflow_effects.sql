create table nestscout_private.fixture_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  basis text not null check (basis = 'local_fixture'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
revoke all on table nestscout_private.fixture_operators from public, anon, authenticated;

alter table public.service_quotes add column issued_by uuid references auth.users (id);
alter table public.service_quotes add column issue_key uuid;
create unique index service_quotes_issue_key on public.service_quotes (request_id, issue_key) where issue_key is not null;

alter table public.service_invitations add column invited_by uuid references auth.users (id);
alter table public.service_invitations add column created_at timestamptz not null default now();

create function nestscout_private.lock_fixture_operator()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid := auth.uid();
begin
  if v_operator is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  perform 1 from nestscout_private.fixture_operators o
    where o.user_id = v_operator and o.active and o.basis = 'local_fixture' for share;
  if not found then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  return v_operator;
end;
$$;
revoke all on function nestscout_private.lock_fixture_operator() from public, anon, authenticated;

create function nestscout_private.fixture_worker_dispatchable(p_worker uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.worker_access_grants g
      join nestscout_private.worker_dispatch_eligibility e on e.user_id = g.user_id
      join public.worker_public_profiles p on p.worker_id = g.user_id
    where g.user_id = p_worker and g.status = 'active' and e.active and e.basis = 'local_fixture'
      and p.accepting_jobs and cardinality(nestscout_private.worker_missing_items(p_worker)) = 0);
$$;
revoke all on function nestscout_private.fixture_worker_dispatchable(uuid) from public, anon, authenticated;

create function nestscout_private.issue_fixture_quote(p_request_id uuid, p_key uuid, p_scope text, p_amount_minor bigint, p_valid_minutes integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid := nestscout_private.lock_fixture_operator();
  v_scope text := btrim(coalesce(p_scope, ''));
  v_existing public.service_quotes%rowtype;
  v_version integer;
  v_id uuid;
begin
  if p_request_id is null or p_key is null or char_length(v_scope) not between 1 and 4000
    or p_amount_minor is null or p_amount_minor not between 1 and 9007199254740991
    or p_valid_minutes is null or p_valid_minutes not between 5 and 10080 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  perform 1 from public.service_requests r where r.id = p_request_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'request unavailable';
  end if;
  select * into v_existing from public.service_quotes q where q.request_id = p_request_id and q.issue_key = p_key;
  if found then
    if v_existing.scope is distinct from v_scope or v_existing.amount_minor is distinct from p_amount_minor or v_existing.issued_by is distinct from v_operator then
      raise exception using errcode = '22023', message = 'issue key conflict';
    end if;
    return v_existing.id;
  end if;
  if exists (select 1 from public.service_quotes q where q.request_id = p_request_id and q.accepted_at is not null)
    or exists (select 1 from public.service_jobs j where j.request_id = p_request_id) then
    raise exception using errcode = '22023', message = 'agreement unavailable';
  end if;
  select coalesce(max(q.version), 0) + 1 into v_version from public.service_quotes q where q.request_id = p_request_id;
  insert into public.service_quotes (request_id, version, scope, amount_minor, currency, expires_at, basis, issued_by, issue_key)
    values (p_request_id, v_version, v_scope, p_amount_minor, 'VND', clock_timestamp() + make_interval(mins => p_valid_minutes),
      'local_fixture', v_operator, p_key)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function nestscout_private.issue_fixture_quote(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function nestscout_private.issue_fixture_quote(uuid, uuid, text, bigint, integer) to authenticated;

create function public.issue_fixture_quote(p_request_id uuid, p_key uuid, p_scope text, p_amount_minor bigint, p_valid_minutes integer)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.issue_fixture_quote(p_request_id, p_key, p_scope, p_amount_minor, p_valid_minutes); $$;
revoke all on function public.issue_fixture_quote(uuid, uuid, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.issue_fixture_quote(uuid, uuid, text, bigint, integer) to authenticated;

create function nestscout_private.invite_fixture_worker(p_request_id uuid, p_worker_id uuid, p_valid_minutes integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid := nestscout_private.lock_fixture_operator();
  v_quote uuid;
  v_id uuid;
begin
  if p_request_id is null or p_worker_id is null or p_valid_minutes is null or p_valid_minutes not between 5 and 1440 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  perform 1 from public.service_requests r where r.id = p_request_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'request unavailable';
  end if;
  select q.id into v_quote from public.service_quotes q where q.request_id = p_request_id and q.accepted_at is not null;
  if v_quote is null then
    raise exception using errcode = '22023', message = 'agreement unavailable';
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = p_request_id) then
    raise exception using errcode = '40001', message = 'already assigned';
  end if;
  if exists (select 1 from public.service_requests r where r.id = p_request_id and r.owner_id = p_worker_id) then
    raise exception using errcode = '22023', message = 'worker unavailable';
  end if;
  perform 1 from public.worker_access_grants g where g.user_id = p_worker_id and g.status = 'active' for share;
  if not nestscout_private.fixture_worker_dispatchable(p_worker_id) then
    raise exception using errcode = '22023', message = 'worker unavailable';
  end if;
  select i.id into v_id from public.service_invitations i
    where i.request_id = p_request_id and i.worker_id = p_worker_id and i.state = 'open' and i.expires_at > clock_timestamp();
  if v_id is not null then
    return v_id;
  end if;
  insert into public.service_invitations (request_id, quote_id, worker_id, expires_at, invited_by)
    values (p_request_id, v_quote, p_worker_id, clock_timestamp() + make_interval(mins => p_valid_minutes), v_operator)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function nestscout_private.invite_fixture_worker(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function nestscout_private.invite_fixture_worker(uuid, uuid, integer) to authenticated;

create function public.invite_fixture_worker(p_request_id uuid, p_worker_id uuid, p_valid_minutes integer)
returns uuid language sql security invoker set search_path = ''
as $$ select nestscout_private.invite_fixture_worker(p_request_id, p_worker_id, p_valid_minutes); $$;
revoke all on function public.invite_fixture_worker(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.invite_fixture_worker(uuid, uuid, integer) to authenticated;

create function nestscout_private.fixture_dispatch_queue()
returns table (request_id uuid, description text, location text, created_at timestamptz, latest_quote_id uuid, latest_quote_version integer,
  quote_state text, accepted_quote_id uuid, open_invitations integer, job_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.lock_fixture_operator();
  return query
  select r.id, left(r.description, 300), r.location, r.created_at, q.id, q.version,
    case when q.id is null then 'none' when q.accepted_at is not null then 'accepted' when q.rejected_at is not null then 'rejected'
      when q.expires_at <= clock_timestamp() then 'expired' else 'issued' end,
    (select a.id from public.service_quotes a where a.request_id = r.id and a.accepted_at is not null),
    (select count(*)::integer from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()),
    (select j.id from public.service_jobs j where j.request_id = r.id)
  from public.service_requests r
  left join lateral (select * from public.service_quotes x where x.request_id = r.id order by x.version desc limit 1) q on true
  order by r.created_at desc
  limit 100;
end;
$$;
revoke all on function nestscout_private.fixture_dispatch_queue() from public, anon, authenticated;
grant execute on function nestscout_private.fixture_dispatch_queue() to authenticated;

create function public.fixture_dispatch_queue()
returns table (request_id uuid, description text, location text, created_at timestamptz, latest_quote_id uuid, latest_quote_version integer,
  quote_state text, accepted_quote_id uuid, open_invitations integer, job_id uuid)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.fixture_dispatch_queue(); $$;
revoke all on function public.fixture_dispatch_queue() from public, anon, authenticated;
grant execute on function public.fixture_dispatch_queue() to authenticated;

create function nestscout_private.fixture_dispatch_candidates()
returns table (worker_id uuid, display_name text, trade text, area text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.lock_fixture_operator();
  return query
  select p.worker_id, p.display_name, p.trade, p.area
  from public.worker_public_profiles p
  where nestscout_private.fixture_worker_dispatchable(p.worker_id)
  order by p.display_name, p.worker_id;
end;
$$;
revoke all on function nestscout_private.fixture_dispatch_candidates() from public, anon, authenticated;
grant execute on function nestscout_private.fixture_dispatch_candidates() to authenticated;

create function public.fixture_dispatch_candidates()
returns table (worker_id uuid, display_name text, trade text, area text)
language sql stable security invoker set search_path = ''
as $$ select * from nestscout_private.fixture_dispatch_candidates(); $$;
revoke all on function public.fixture_dispatch_candidates() from public, anon, authenticated;
grant execute on function public.fixture_dispatch_candidates() to authenticated;

alter table public.kael_tasks drop constraint kael_tasks_kind_check;
alter table public.kael_tasks add constraint kael_tasks_kind_check
  check (kind in ('general', 'service_request', 'customer_lookup', 'worker_assist', 'research', 'writing', 'workflow_action'));

alter table nestscout_private.kael_approvals drop constraint kael_approvals_tool_check;
alter table nestscout_private.kael_approvals add constraint kael_approvals_tool_check
  check (tool in ('service_request_submit', 'service_quote_decision', 'worker_offer_decision', 'worker_job_advance', 'work_submission_decision'));

create function nestscout_private.kael_json_int(p_value jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[0-9]{1,9}$' then (p_value #>> '{}')::integer end;
$$;
revoke all on function nestscout_private.kael_json_int(jsonb) from public, anon, authenticated;

create function nestscout_private.kael_json_uuid(p_value jsonb)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p_value #>> '{}')::uuid end;
$$;
revoke all on function nestscout_private.kael_json_uuid(jsonb) from public, anon, authenticated;

create function nestscout_private.kael_worker_dispatchable(p_worker uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.worker_access_grants g
    join nestscout_private.worker_dispatch_eligibility e on e.user_id = g.user_id
    where g.user_id = p_worker and g.status = 'active' and e.active and e.basis = 'local_fixture');
$$;
revoke all on function nestscout_private.kael_worker_dispatchable(uuid) from public, anon, authenticated;

create function nestscout_private.kael_effect_target_valid(p_actor uuid, p_tool text, p_args jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quote public.service_quotes%rowtype;
  v_invite public.service_invitations%rowtype;
  v_job public.service_jobs%rowtype;
  v_submission public.service_submissions%rowtype;
  v_version integer;
  v_decision text := p_args ->> 'decision';
  v_reason text := p_args ->> 'reason';
begin
  if p_tool = 'service_quote_decision' then
    v_version := nestscout_private.kael_json_int(p_args -> 'quote_version');
    select q.* into v_quote from public.service_quotes q join public.service_requests r on r.id = q.request_id
      where q.id = nestscout_private.kael_json_uuid(p_args -> 'quote_id') and r.owner_id = p_actor;
    return found and v_decision in ('accepted', 'rejected') and v_quote.version = v_version
      and v_quote.accepted_at is null and v_quote.rejected_at is null and v_quote.expires_at > clock_timestamp()
      and not exists (select 1 from public.service_quotes x where x.request_id = v_quote.request_id
        and (x.version > v_quote.version or x.accepted_at is not null));
  elsif p_tool = 'worker_offer_decision' then
    v_version := nestscout_private.kael_json_int(p_args -> 'quote_version');
    select * into v_invite from public.service_invitations i
      where i.id = nestscout_private.kael_json_uuid(p_args -> 'invitation_id') and i.worker_id = p_actor;
    return found and v_decision in ('accept', 'decline') and nestscout_private.kael_worker_dispatchable(p_actor)
      and v_invite.state = 'open' and v_invite.expires_at > clock_timestamp()
      and v_invite.quote_id = nestscout_private.kael_json_uuid(p_args -> 'quote_id')
      and exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.version = v_version and q.accepted_at is not null)
      and not exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id);
  elsif p_tool = 'worker_job_advance' then
    v_version := nestscout_private.kael_json_int(p_args -> 'version');
    select * into v_job from public.service_jobs j
      where j.id = nestscout_private.kael_json_uuid(p_args -> 'job_id') and j.worker_id = p_actor;
    return found and nestscout_private.kael_worker_dispatchable(p_actor) and v_job.version = v_version
      and ((v_job.stage = 'assigned' and p_args ->> 'next' = 'en_route')
        or (v_job.stage = 'en_route' and p_args ->> 'next' = 'arrived')
        or (v_job.stage = 'arrived' and p_args ->> 'next' = 'working'));
  elsif p_tool = 'work_submission_decision' then
    v_version := nestscout_private.kael_json_int(p_args -> 'job_version');
    select s.* into v_submission from public.service_submissions s
      join public.service_jobs j on j.id = s.job_id
      join public.service_requests r on r.id = j.request_id
      where s.id = nestscout_private.kael_json_uuid(p_args -> 'submission_id') and r.owner_id = p_actor
        and j.version = v_version and j.stage = 'submitted';
    return found and v_submission.decision = 'pending'
      and ((v_decision = 'accepted' and coalesce(v_reason, '') = '')
        or (v_decision = 'revision_requested' and char_length(btrim(coalesce(v_reason, ''))) between 1 and 4000));
  end if;
  return false;
end;
$$;
revoke all on function nestscout_private.kael_effect_target_valid(uuid, text, jsonb) from public, anon, authenticated;

create or replace function nestscout_private.kael_request_approval(p_actor uuid, p_run_id uuid, p_task_id uuid, p_expected_version integer, p_tool text,
  p_args jsonb, p_fingerprint text, p_summary text, p_details jsonb, p_ttl_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_task public.kael_tasks;
  v_from text;
  v_approval uuid;
  v_expires timestamptz;
begin
  if v_run.id is null or p_tool is null
    or p_tool not in ('service_request_submit', 'service_quote_decision', 'worker_offer_decision', 'worker_job_advance', 'work_submission_decision')
    or p_fingerprint !~ '^[0-9a-f]{64}$'
    or p_ttl_seconds not between 60 and 3600 or jsonb_typeof(p_args) <> 'object' or jsonb_typeof(p_details) is distinct from 'object'
    or char_length(btrim(coalesce(p_summary, ''))) = 0 then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kael-effect:' || v_actor::text, 0));
  if nestscout_private.kael_effect_unresolved(v_actor, p_tool, null) then
    return jsonb_build_object('status', 'unresolved');
  end if;
  select * into v_task from public.kael_tasks t where t.id = p_task_id and t.owner_id = v_actor for update;
  if not found or v_task.status not in ('running', 'waiting_for_input') or p_args ->> 'task_id' is distinct from v_task.id::text then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_task.version <> p_expected_version then
    return jsonb_build_object('status', 'stale');
  end if;
  if p_tool = 'service_request_submit' then
    if v_task.kind <> 'service_request'
      or coalesce(jsonb_array_length(v_task.artifact #> '{draft,missing}'), 1) <> 0
      or char_length(btrim(coalesce(v_task.artifact #>> '{draft,description}', ''))) = 0
      or p_args ->> 'description' is distinct from v_task.artifact #>> '{draft,description}'
      or p_args ->> 'location' is distinct from v_task.artifact #>> '{draft,location}'
      or p_args ->> 'preferred_time' is distinct from v_task.artifact #>> '{draft,preferred_time}' then
      return jsonb_build_object('status', 'invalid');
    end if;
  elsif v_task.kind <> 'workflow_action' or not nestscout_private.kael_effect_target_valid(v_actor, p_tool, p_args) then
    return jsonb_build_object('status', 'invalid');
  end if;
  update nestscout_private.kael_approvals set status = 'superseded' where task_id = v_task.id and status = 'pending';
  v_from := v_task.status;
  update public.kael_tasks set status = 'waiting_for_approval', version = version + 1, updated_at = clock_timestamp(),
    summary = case when p_tool = 'service_request_submit' then 'Đang chờ bạn xác nhận gửi yêu cầu' else 'Đang chờ bạn xác nhận thao tác' end
    where id = v_task.id returning * into v_task;
  v_expires := clock_timestamp() + make_interval(secs => p_ttl_seconds);
  insert into nestscout_private.kael_approvals (owner_id, task_id, run_id, tool, args, fingerprint, summary, details, task_version, expires_at)
    values (v_actor, v_task.id, v_run.id, p_tool, p_args, p_fingerprint, left(p_summary, 200), p_details, v_task.version, v_expires)
    returning id into v_approval;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, 'approval_requested', v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'approval_id', v_approval, 'expires_at', v_expires, 'task', nestscout_private.kael_task_json(v_task));
end;
$$;

create function nestscout_private.kael_effect_observed(p_actor uuid, p_approval nestscout_private.kael_approvals, p_resource uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_args jsonb := p_approval.args;
begin
  if p_resource is null then
    return null;
  end if;
  if p_approval.tool = 'service_request_submit' then
    return case when exists (select 1 from public.service_requests r
      where r.id = p_resource and r.owner_id = p_actor and r.submission_key = p_approval.id) then 'service_request' end;
  elsif p_approval.tool = 'service_quote_decision' then
    return case when exists (select 1 from public.service_quotes q
      where q.id = p_resource and q.id = nestscout_private.kael_json_uuid(v_args -> 'quote_id')
        and ((v_args ->> 'decision' = 'accepted' and q.accepted_by = p_actor) or (v_args ->> 'decision' = 'rejected' and q.rejected_by = p_actor)))
      then 'service_quote' end;
  elsif p_approval.tool = 'worker_offer_decision' then
    if v_args ->> 'decision' = 'accept' then
      return case when exists (select 1 from public.service_jobs j
        where j.id = p_resource and j.worker_id = p_actor and j.invitation_id = nestscout_private.kael_json_uuid(v_args -> 'invitation_id'))
        then 'service_job' end;
    end if;
    return case when exists (select 1 from public.service_invitations i
      where i.id = p_resource and i.id = nestscout_private.kael_json_uuid(v_args -> 'invitation_id') and i.worker_id = p_actor and i.state = 'declined')
      then 'service_invitation' end;
  elsif p_approval.tool = 'worker_job_advance' then
    return case when exists (select 1 from public.service_job_events e
      where e.job_id = p_resource and e.job_id = nestscout_private.kael_json_uuid(v_args -> 'job_id') and e.actor_id = p_actor
        and e.version = nestscout_private.kael_json_int(v_args -> 'version') + 1 and e.event = v_args ->> 'next')
      then 'service_job' end;
  elsif p_approval.tool = 'work_submission_decision' then
    return case when exists (select 1 from public.service_submissions s
      where s.id = p_resource and s.id = nestscout_private.kael_json_uuid(v_args -> 'submission_id')
        and s.decided_by = p_actor and s.decision = v_args ->> 'decision')
      then 'service_submission' end;
  end if;
  return null;
end;
$$;
revoke all on function nestscout_private.kael_effect_observed(uuid, nestscout_private.kael_approvals, uuid) from public, anon, authenticated;

create or replace function nestscout_private.kael_complete_approval(p_actor uuid, p_run_id uuid, p_approval_id uuid, p_outcome text, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := nestscout_private.kael_server_actor(p_actor);
  v_run public.kael_runs := nestscout_private.kael_running_run(p_run_id, v_actor);
  v_approval nestscout_private.kael_approvals;
  v_task public.kael_tasks;
  v_outcome text := p_outcome;
  v_resource uuid;
  v_kind text;
  v_result jsonb;
  v_from text;
  v_status text;
  v_summary text;
  v_artifact jsonb;
begin
  if p_outcome not in ('succeeded', 'failed', 'uncertain') then
    raise exception using errcode = '22023', message = 'invalid outcome';
  end if;
  select * into v_approval from nestscout_private.kael_approvals a
    where a.id = p_approval_id and a.owner_id = v_actor and a.status = 'consumed' for update;
  if not found or v_run.id is null or v_approval.effect_run_id is distinct from v_run.id then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_task from public.kael_tasks t where t.id = v_approval.task_id and t.owner_id = v_actor for update;
  if v_approval.outcome in ('succeeded', 'failed') then
    return jsonb_build_object('status', 'final', 'outcome', v_approval.outcome, 'result', v_approval.result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  if v_outcome = 'succeeded' then
    begin
      v_resource := (p_result ->> 'resource_id')::uuid;
    exception when invalid_text_representation then
      v_resource := null;
    end;
    v_kind := nestscout_private.kael_effect_observed(v_actor, v_approval, v_resource);
    if v_kind is null then
      v_outcome := 'uncertain';
    end if;
  end if;
  v_from := v_task.status;
  v_artifact := v_task.artifact;
  if v_outcome = 'succeeded' then
    v_status := 'completed';
    v_summary := case v_approval.tool
      when 'service_request_submit' then 'Đã gửi yêu cầu dịch vụ; chưa có thợ hay lịch hẹn được xác nhận'
      when 'service_quote_decision' then case when v_approval.args ->> 'decision' = 'accepted'
        then 'Đã chấp nhận báo giá; chưa có thợ nhận việc' else 'Đã từ chối báo giá' end
      when 'worker_offer_decision' then case when v_approval.args ->> 'decision' = 'accept'
        then 'Đã nhận việc; công việc đã được giao cho bạn' else 'Đã từ chối lời mời' end
      when 'worker_job_advance' then 'Đã cập nhật tiến độ công việc'
      else case when v_approval.args ->> 'decision' = 'accepted'
        then 'Đã nghiệm thu công việc; thanh toán chưa được xác nhận' else 'Đã yêu cầu thợ sửa lại' end
    end;
    v_result := jsonb_build_object('resource_kind', v_kind, 'resource_id', v_resource);
    v_artifact := v_artifact || jsonb_build_object('effect_result', jsonb_build_object('status', 'succeeded', 'resource_kind', v_kind, 'resource_id', v_resource));
  elsif v_outcome = 'failed' then
    v_status := 'waiting_for_input';
    v_summary := case when v_approval.tool = 'service_request_submit' then 'Hệ thống chưa nhận yêu cầu; bản nháp vẫn được giữ'
      else 'Hệ thống chưa thực hiện thao tác; chưa có gì thay đổi' end;
    v_result := jsonb_build_object('reason', left(coalesce(p_result ->> 'reason', 'backend_refused'), 80));
  else
    v_status := 'paused';
    v_summary := case when v_approval.tool = 'service_request_submit' then 'Chưa xác định được kết quả gửi; có thể xác nhận lại an toàn'
      else 'Chưa xác định được kết quả thao tác; có thể kiểm tra lại an toàn' end;
    v_result := jsonb_build_object('reason', case when p_outcome = 'succeeded' then 'unverified_result'
      else left(coalesce(p_result ->> 'reason', 'unverified_result'), 80) end);
  end if;
  if v_task.version <> v_approval.effect_task_version or v_from not in ('running', 'cancelled', 'failed')
    or (v_from = 'running' and not nestscout_private.kael_task_transition_allowed(v_from, v_status)) then
    v_result := jsonb_build_object('reason', 'task_changed');
    update nestscout_private.kael_approvals set outcome = 'uncertain', result = v_result where id = v_approval.id;
    return jsonb_build_object('status', 'conflict', 'outcome', 'uncertain', 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  if v_from <> 'running' then
    update nestscout_private.kael_approvals set outcome = v_outcome, result = v_result where id = v_approval.id;
    if v_outcome = 'succeeded' then
      update public.kael_tasks set artifact = v_artifact, version = version + 1, updated_at = clock_timestamp()
        where id = v_task.id returning * into v_task;
      insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
        values (v_task.id, v_actor, v_run.id, 'effect_succeeded', v_from, v_task.status, v_task.version);
    end if;
    return jsonb_build_object('status', 'ok', 'outcome', v_outcome, 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
  end if;
  update nestscout_private.kael_approvals set outcome = v_outcome, result = v_result where id = v_approval.id;
  update public.kael_tasks set status = v_status, summary = v_summary, artifact = v_artifact, version = version + 1, updated_at = clock_timestamp()
    where id = v_task.id returning * into v_task;
  insert into public.kael_task_events (task_id, owner_id, run_id, event, from_status, to_status, version)
    values (v_task.id, v_actor, v_run.id, 'effect_' || v_outcome, v_from, v_task.status, v_task.version);
  return jsonb_build_object('status', 'ok', 'outcome', v_outcome, 'result', v_result, 'task', nestscout_private.kael_task_json(v_task));
end;
$$;
