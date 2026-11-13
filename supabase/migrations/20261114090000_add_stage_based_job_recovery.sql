alter table nestscout_private.auto_dispatch_settings
  add column assigned_response_minutes integer not null default 120 check (assigned_response_minutes between 15 and 10080),
  add column visit_grace_minutes integer not null default 30 check (visit_grace_minutes between 5 and 1440),
  add column en_route_arrival_minutes integer not null default 120 check (en_route_arrival_minutes between 15 and 1440),
  add column arrival_escalation_minutes integer not null default 60 check (arrival_escalation_minutes between 10 and 1440),
  drop column reassign_idle_minutes;

alter table public.service_job_releases
  add column pauses jsonb not null default '[]'::jsonb,
  add column change_requests jsonb not null default '[]'::jsonb;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed', 'job_offered', 'work_approved',
    'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received', 'change_requested', 'change_decided',
    'job_auto_accepted', 'dispatch_exhausted', 'job_released', 'job_withdrawn', 'job_escalated'));

create table public.service_job_escalations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.service_jobs (id),
  request_id uuid not null references public.service_requests (id),
  worker_id uuid not null references auth.users (id),
  raised_by uuid not null references auth.users (id),
  kind text not null check (kind in ('no_progress_after_arrival')),
  job_version integer not null check (job_version > 0),
  note text check (note is null or char_length(note) between 1 and 500),
  operation_key uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (raised_by, operation_key),
  unique (job_id, kind)
);
create index service_job_escalations_request on public.service_job_escalations (request_id);
alter table public.service_job_escalations enable row level security;
revoke all on table public.service_job_escalations from public, anon, authenticated;
grant select on table public.service_job_escalations to authenticated;
create policy service_job_escalations_select_participant on public.service_job_escalations for select to authenticated
  using (
    coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') = 'false'
    and (worker_id = (select auth.uid())
      or exists (select 1 from public.service_requests r where r.id = service_job_escalations.request_id and r.owner_id = (select auth.uid())))
  );

create function nestscout_private.job_recovery(p_job_id uuid)
returns table (action text, available_at timestamptz, escalated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_job public.service_jobs%rowtype;
  v_pause public.service_job_pauses%rowtype;
  v_visit timestamptz;
  v_since timestamptz;
  v_resumed timestamptz;
  v_floor timestamptz;
begin
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  select * into v_job from public.service_jobs j where j.id = p_job_id;
  if not found then
    return;
  end if;
  select r.preferred_visit_at into v_visit from public.service_requests r where r.id = v_job.request_id;
  select max(e.created_at) into v_resumed from public.service_job_events e where e.job_id = v_job.id and e.event = 'resumed';
  v_floor := case when v_visit is null then null else v_visit + make_interval(mins => v_settings.visit_grace_minutes) end;
  if v_job.stage = 'assigned' then
    v_since := greatest(v_job.created_at, coalesce(v_resumed, '-infinity'::timestamptz));
    return query select 'reassign'::text,
      case when v_visit is null then v_since + make_interval(mins => v_settings.assigned_response_minutes)
        else greatest(v_since, v_visit) + make_interval(mins => v_settings.visit_grace_minutes) end,
      null::timestamptz;
  elsif v_job.stage = 'en_route' then
    select max(e.created_at) into v_since from public.service_job_events e where e.job_id = v_job.id and e.event = 'en_route';
    v_since := greatest(coalesce(v_since, v_job.created_at), coalesce(v_resumed, '-infinity'::timestamptz));
    return query select 'reassign'::text,
      greatest(v_since + make_interval(mins => v_settings.en_route_arrival_minutes), coalesce(v_floor, v_since)),
      null::timestamptz;
  elsif v_job.stage = 'paused' then
    select * into v_pause from public.service_job_pauses p where p.job_id = v_job.id and p.resumed_at is null;
    if found and v_pause.category = 'ordinary_interruption' and v_pause.prior_stage in ('assigned', 'en_route') then
      return query select 'reassign'::text,
        greatest(v_pause.created_at + make_interval(mins => v_settings.assigned_response_minutes), coalesce(v_floor, v_pause.created_at)),
        null::timestamptz;
    end if;
  elsif v_job.stage = 'arrived' then
    select max(e.created_at) into v_since from public.service_job_events e where e.job_id = v_job.id and e.event = 'arrived';
    v_since := greatest(coalesce(v_since, v_job.created_at), coalesce(v_resumed, '-infinity'::timestamptz));
    return query select 'escalate'::text,
      v_since + make_interval(mins => v_settings.arrival_escalation_minutes),
      (select min(x.created_at) from public.service_job_escalations x where x.job_id = v_job.id);
  end if;
end;
$$;
revoke all on function nestscout_private.job_recovery(uuid) from public, anon, authenticated;

create or replace function nestscout_private.release_job(p_job_id uuid, p_actor uuid, p_role text, p_reason text, p_note text, p_key uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.service_requests%rowtype;
  v_job public.service_jobs%rowtype;
  v_request_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_events jsonb;
  v_reports jsonb;
  v_pauses jsonb;
  v_changes jsonb;
  v_dispatch jsonb;
  v_label text;
  v_assigned boolean;
  v_action text;
  v_available timestamptz;
begin
  if p_key is null or p_actor is null or p_role is null or p_role not in ('worker', 'customer')
    or p_reason is null or p_reason not in ('unavailable', 'schedule_conflict', 'cannot_reach', 'other', 'no_show')
    or (v_note is not null and char_length(v_note) > 500) then
    raise exception using errcode = '22023', message = 'invalid release';
  end if;
  if exists (select 1 from public.service_job_releases x where x.released_by = p_actor and x.operation_key = p_key) then
    return jsonb_build_object('outcome', 'already_released');
  end if;
  select j.request_id into v_request_id from public.service_jobs j
    where j.id = p_job_id
      and ((p_role = 'worker' and j.worker_id = p_actor)
        or (p_role = 'customer' and exists (select 1 from public.service_requests r where r.id = j.request_id and r.owner_id = p_actor)));
  if v_request_id is null then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  select * into v_job from public.service_jobs j where j.id = p_job_id for update;
  if not found then
    raise exception using errcode = '40001', message = 'job changed';
  end if;
  select * into v_request from public.service_requests r where r.id = v_request_id for update;
  if p_role = 'worker' and p_version is distinct from v_job.version then
    raise exception using errcode = '40001', message = 'stale job';
  end if;
  select r.action, r.available_at into v_action, v_available from nestscout_private.job_recovery(v_job.id) r;
  if v_action is distinct from 'reassign' then
    raise exception using errcode = '22023', message = 'release not allowed at this stage';
  end if;
  if p_role = 'customer' and v_available > clock_timestamp() then
    raise exception using errcode = '22023', message = 'worker still has time';
  end if;
  if exists (select 1 from public.job_change_requests c where c.job_id = v_job.id and c.status = 'pending')
    or exists (select 1 from public.service_scope_changes s where s.job_id = v_job.id)
    or exists (select 1 from public.service_submissions s where s.job_id = v_job.id)
    or exists (select 1 from public.service_cases c where c.job_id = v_job.id)
    or exists (select 1 from public.worker_reviews w where w.job_id = v_job.id) then
    raise exception using errcode = '22023', message = 'job has open changes';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.version), '[]'::jsonb) into v_events from public.service_job_events e where e.job_id = v_job.id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.reported_from_version, r.id), '[]'::jsonb) into v_reports from public.service_job_reports r where r.job_id = v_job.id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb) into v_pauses from public.service_job_pauses p where p.job_id = v_job.id;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb) into v_changes from public.job_change_requests c where c.job_id = v_job.id;
  delete from public.service_job_reports where job_id = v_job.id;
  delete from public.service_job_pauses where job_id = v_job.id;
  delete from public.job_change_requests where job_id = v_job.id;
  delete from public.service_job_events where job_id = v_job.id;
  insert into public.service_job_releases (job_id, request_id, quote_id, invitation_id, worker_id, stage, job_version, released_by, released_by_role,
    reason, note, events, reports, pauses, change_requests, operation_key)
    values (v_job.id, v_job.request_id, v_job.quote_id, v_job.invitation_id, v_job.worker_id, v_job.stage, v_job.version, p_actor, p_role,
      p_reason, v_note, v_events, v_reports, v_pauses, v_changes, p_key);
  delete from public.service_jobs where id = v_job.id;
  v_dispatch := nestscout_private.dispatch_request(v_request.id, v_job.quote_id, 'worker_released');
  v_label := left(btrim(split_part(btrim(v_request.description), E'\n', 1)), 48);
  v_assigned := exists (select 1 from public.service_jobs j where j.request_id = v_request.id);
  if p_role = 'worker' then
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'job_released', v_request.id, 'Thợ đã rút khỏi việc',
        case
          when v_assigned then 'Thợ trước đã rút khỏi yêu cầu “' || coalesce(v_label, '') || '”. Một thợ khác đã nhận việc thay.'
          when v_dispatch ->> 'outcome' = 'invited' then 'Thợ trước đã rút khỏi yêu cầu “' || coalesce(v_label, '') || '”. Hệ thống đã mời thợ khác; bạn sẽ được báo khi có thợ nhận.'
          else 'Thợ trước đã rút khỏi yêu cầu “' || coalesce(v_label, '') || '” và chưa có thợ khác phù hợp. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.'
        end);
  else
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_job.worker_id, 'job_withdrawn', v_request.id, 'Khách đã mời thợ khác',
        'Khách đã mời thợ khác cho việc “' || coalesce(v_label, '') || '” vì chưa thấy bạn đến. Việc này không còn trong danh sách của bạn.');
  end if;
  return jsonb_build_object('outcome', 'released', 'dispatch', v_dispatch);
end;
$$;

create function nestscout_private.escalate_service_job(p_request_id uuid, p_key uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_request public.service_requests%rowtype;
  v_job public.service_jobs%rowtype;
  v_job_id uuid;
  v_action text;
  v_available timestamptz;
  v_label text;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_request_id is null or p_key is null or (v_note is not null and char_length(v_note) > 500) then
    raise exception using errcode = '22023', message = 'invalid escalation';
  end if;
  if exists (select 1 from public.service_job_escalations x where x.raised_by = v_owner and x.operation_key = p_key) then
    return jsonb_build_object('outcome', 'already_escalated');
  end if;
  select * into v_request from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner;
  if not found then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  select j.id into v_job_id from public.service_jobs j where j.request_id = p_request_id;
  if v_job_id is null then
    raise exception using errcode = '22023', message = 'no worker assigned';
  end if;
  select * into v_job from public.service_jobs j where j.id = v_job_id for update;
  if not found then
    raise exception using errcode = '40001', message = 'job changed';
  end if;
  select r.action, r.available_at into v_action, v_available from nestscout_private.job_recovery(v_job.id) r;
  if v_action is distinct from 'escalate' then
    raise exception using errcode = '22023', message = 'escalation not allowed at this stage';
  end if;
  if exists (select 1 from public.service_job_escalations x where x.job_id = v_job.id) then
    return jsonb_build_object('outcome', 'already_escalated');
  end if;
  if v_available > clock_timestamp() then
    raise exception using errcode = '22023', message = 'worker still has time';
  end if;
  insert into public.service_job_escalations (job_id, request_id, worker_id, raised_by, kind, job_version, note, operation_key)
    values (v_job.id, v_request.id, v_job.worker_id, v_owner, 'no_progress_after_arrival', v_job.version, v_note, p_key);
  v_label := left(btrim(split_part(btrim(v_request.description), E'\n', 1)), 48);
  insert into public.notifications (recipient_id, kind, request_id, title, body)
    values (v_job.worker_id, 'job_escalated', v_request.id, 'Khách báo chưa thấy bạn bắt đầu',
      'Khách báo bạn đã đến nhưng chưa bắt đầu việc “' || coalesce(v_label, '') || '”. Hãy bắt đầu việc hoặc báo sự cố; yêu cầu đã được chuyển để xử lý.');
  return jsonb_build_object('outcome', 'escalated');
end;
$$;
revoke all on function nestscout_private.escalate_service_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.escalate_service_job(uuid, uuid, text) to authenticated;

create function public.escalate_service_job(p_request_id uuid, p_key uuid, p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.escalate_service_job(p_request_id, p_key, p_note); $$;
revoke all on function public.escalate_service_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.escalate_service_job(uuid, uuid, text) to authenticated;

drop function public.get_dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_state(uuid, uuid[]);

create function nestscout_private.dispatch_state(p_owner uuid, p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz, job_stage text, can_escalate boolean, escalate_at timestamptz, escalated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
begin
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  return query
  with f as (
    select r.id as rid, r.service_id as sid, r.cancelled_at is not null as cancelled,
      jj.id is not null as has_job,
      exists (select 1 from public.service_quotes q where q.request_id = r.id and q.accepted_at is not null) as has_accepted,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as live,
      (select min(i.expires_at) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as next_expiry,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at <= clock_timestamp()) as lapsed,
      (select count(*) from public.service_invitations i where i.request_id = r.id) as total,
      jj.stage as job_stage,
      rec.action as rec_action, rec.available_at as rec_at, rec.escalated_at as rec_escalated,
      d.round_count, d.last_outcome as last_round_outcome, d.manual_used, d.last_invited, d.last_empty
    from public.service_requests r
    left join lateral (select j.id, j.stage from public.service_jobs j where j.request_id = r.id) jj on true
    left join lateral nestscout_private.job_recovery(jj.id) rec on jj.id is not null
    left join lateral (
      select count(*) as round_count,
        (array_agg(x.outcome order by x.round desc))[1] as last_outcome,
        count(*) filter (where x.reason = 'manual_retry' and x.outcome = 'invited') as manual_used,
        max(x.created_at) filter (where x.outcome = 'invited') as last_invited,
        max(x.created_at) filter (where x.outcome = 'no_eligible_worker' and x.reason in ('manual_retry', 'recovery')) as last_empty
      from public.service_dispatch_rounds x where x.request_id = r.id
    ) d on true
    where r.id = any (p_request_ids) and r.owner_id = p_owner
  ), s as (
    select f.*,
      case
        when f.cancelled then 'cancelled'
        when f.has_job then 'assigned'
        when not f.has_accepted then 'awaiting_acceptance'
        when f.live > 0 then 'searching'
        when f.lapsed > 0 then 'recovering'
        when f.sid is null then 'needs_service'
        when f.total = 0 and f.round_count = 0 then 'not_dispatched'
        when f.total = 0 then 'no_match'
        else 'exhausted'
      end as st,
      greatest(f.last_invited + make_interval(mins => v_settings.retry_cooldown_minutes),
        f.last_empty + make_interval(secs => v_settings.empty_retry_cooldown_seconds)) as retry_at
    from f
  )
  select s.rid, s.st, s.live::integer, s.next_expiry, s.round_count::integer,
    s.st in ('not_dispatched', 'no_match', 'exhausted') and v_settings.enabled
      and (s.st = 'not_dispatched' or s.manual_used < v_settings.max_manual_retries)
      and (s.retry_at is null or s.retry_at <= clock_timestamp()),
    s.st not in ('cancelled', 'assigned'),
    s.st = 'needs_service',
    case when s.retry_at > clock_timestamp() then s.retry_at end,
    case when s.st in ('not_dispatched', 'no_match', 'exhausted') then greatest(v_settings.max_manual_retries - s.manual_used, 0)::integer end,
    s.last_round_outcome,
    s.st = 'assigned' and coalesce(s.rec_action = 'reassign' and s.rec_at <= clock_timestamp(), false),
    case when s.st = 'assigned' and s.rec_action = 'reassign' then s.rec_at end,
    s.job_stage,
    s.st = 'assigned' and coalesce(s.rec_action = 'escalate' and s.rec_escalated is null and s.rec_at <= clock_timestamp(), false),
    case when s.st = 'assigned' and s.rec_action = 'escalate' and s.rec_escalated is null then s.rec_at end,
    case when s.st = 'assigned' and s.rec_action = 'escalate' then s.rec_escalated end
  from s;
end;
$$;
revoke all on function nestscout_private.dispatch_state(uuid, uuid[]) from public, anon, authenticated;

create function nestscout_private.dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz, job_stage text, can_escalate boolean, escalate_at timestamptz, escalated_at timestamptz)
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
  if p_request_ids is null or cardinality(p_request_ids) > 100 then
    raise exception using errcode = '22023', message = 'invalid request';
  end if;
  return query select * from nestscout_private.dispatch_state(v_owner, p_request_ids);
end;
$$;
revoke all on function nestscout_private.dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function nestscout_private.dispatch_summary(uuid[]) to authenticated;

create function public.get_dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz, job_stage text, can_escalate boolean, escalate_at timestamptz, escalated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from nestscout_private.dispatch_summary(p_request_ids); $$;
revoke all on function public.get_dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.get_dispatch_summary(uuid[]) to authenticated;
