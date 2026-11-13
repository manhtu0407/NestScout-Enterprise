alter table nestscout_private.auto_dispatch_settings
  add column max_active_jobs_per_worker integer not null default 3 check (max_active_jobs_per_worker between 1 and 20),
  add column visit_conflict_minutes integer not null default 120 check (visit_conflict_minutes between 15 and 1440),
  add column reassign_idle_minutes integer not null default 120 check (reassign_idle_minutes between 5 and 10080);

alter table public.service_dispatch_rounds drop constraint service_dispatch_rounds_reason_check;
alter table public.service_dispatch_rounds add constraint service_dispatch_rounds_reason_check
  check (reason in ('quote_accepted', 'declined', 'expired', 'manual_retry', 'recovery', 'worker_released'));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed', 'job_offered', 'work_approved',
    'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received', 'change_requested', 'change_decided',
    'job_auto_accepted', 'dispatch_exhausted', 'job_released', 'job_withdrawn'));

create function nestscout_private.worker_unavailable_reason(p_worker_id uuid, p_request_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_visit timestamptz;
begin
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if (select count(*) from public.service_jobs j where j.worker_id = p_worker_id and j.stage not in ('submitted', 'completed'))
    >= v_settings.max_active_jobs_per_worker then
    return 'capacity';
  end if;
  select r.preferred_visit_at into v_visit from public.service_requests r where r.id = p_request_id;
  if v_visit is not null and exists (
    select 1 from public.service_jobs j
    join public.service_requests r2 on r2.id = j.request_id
    where j.worker_id = p_worker_id and j.stage not in ('submitted', 'completed') and j.request_id <> p_request_id
      and r2.preferred_visit_at is not null
      and abs(extract(epoch from (r2.preferred_visit_at - v_visit))) < v_settings.visit_conflict_minutes * 60) then
    return 'schedule_conflict';
  end if;
  return null;
end;
$$;
revoke all on function nestscout_private.worker_unavailable_reason(uuid, uuid) from public, anon, authenticated;

create or replace function nestscout_private.assign_invitation(p_invitation_id uuid, p_worker_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_reason text;
begin
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id and i.worker_id = p_worker_id;
  if not found then
    raise exception using errcode = '42501', message = 'invitation unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('worker_capacity:' || p_worker_id::text, 0));
  v_reason := nestscout_private.worker_unavailable_reason(p_worker_id, v_invite.request_id);
  if v_reason = 'capacity' then
    raise exception using errcode = '40001', message = 'worker at capacity';
  elsif v_reason = 'schedule_conflict' then
    raise exception using errcode = '40001', message = 'schedule conflict';
  end if;
  insert into public.service_jobs (request_id, quote_id, invitation_id, worker_id)
    values (v_invite.request_id, v_invite.quote_id, v_invite.id, p_worker_id) returning id into v_job;
  insert into public.service_job_events (job_id, actor_id, event, version)
    values (v_job, p_worker_id, 'assigned', 1);
  update public.service_invitations set state = 'accepted' where id = v_invite.id;
  return v_job;
end;
$$;

create or replace function nestscout_private.auto_accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.service_invitations%rowtype;
  v_job uuid;
  v_label text;
begin
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id;
  if not found then
    return null;
  end if;
  perform 1 from public.service_requests r where r.id = v_invite.request_id for update;
  select * into v_invite from public.service_invitations i where i.id = p_invitation_id for update;
  if v_invite.state <> 'open' or v_invite.expires_at <= clock_timestamp()
    or exists (select 1 from public.service_requests r where r.id = v_invite.request_id and r.cancelled_at is not null)
    or not exists (select 1 from public.service_quotes q where q.id = v_invite.quote_id and q.accepted_at is not null)
    or exists (select 1 from public.service_jobs j where j.request_id = v_invite.request_id)
    or not nestscout_private.fixture_worker_dispatchable(v_invite.worker_id)
    or nestscout_private.worker_unavailable_reason(v_invite.worker_id, v_invite.request_id) is not null
    or not exists (select 1 from public.kael_autonomy a where a.user_id = v_invite.worker_id and a.role = 'worker' and a.mode = 'auto') then
    return null;
  end if;
  begin
    v_job := nestscout_private.assign_invitation(v_invite.id, v_invite.worker_id);
  exception when serialization_failure then
    return null;
  end;
  select left(btrim(split_part(btrim(r.description), E'\n', 1)), 48) into v_label from public.service_requests r where r.id = v_invite.request_id;
  insert into public.notifications (recipient_id, kind, request_id, title, body)
    values (v_invite.worker_id, 'job_auto_accepted', v_invite.request_id, 'Kael đã nhận việc giúp bạn',
      'Việc “' || coalesce(v_label, '') || '” khớp hồ sơ của bạn nên Kael đã nhận. Bạn có thể xem trong Đã nhận việc.');
  return v_job;
end;
$$;

create or replace function nestscout_private.dispatch_request(p_request_id uuid, p_quote_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_request public.service_requests%rowtype;
  v_round integer;
  v_worker uuid;
  v_invitation uuid;
  v_invited integer := 0;
  v_automatic_used integer;
  v_manual_used integer;
  v_retry_at timestamptz;
  v_outcome text;
  v_customer_started boolean := p_reason in ('manual_retry', 'recovery');
  v_label text;
begin
  if p_reason is null or p_reason not in ('quote_accepted', 'declined', 'expired', 'manual_retry', 'recovery', 'worker_released') then
    raise exception using errcode = '22023', message = 'invalid dispatch reason';
  end if;
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if not v_settings.enabled then
    return jsonb_build_object('outcome', 'dispatch_disabled');
  end if;
  select * into v_request from public.service_requests r where r.id = p_request_id for update;
  if not found or not exists (select 1 from public.service_quotes q
    where q.id = p_quote_id and q.request_id = p_request_id and q.accepted_at is not null) then
    return jsonb_build_object('outcome', 'invalid_request');
  end if;
  if v_request.cancelled_at is not null then
    return jsonb_build_object('outcome', 'cancelled');
  end if;
  if exists (select 1 from public.service_jobs j where j.request_id = p_request_id) then
    return jsonb_build_object('outcome', 'already_assigned');
  end if;
  if v_request.service_id is null then
    return jsonb_build_object('outcome', 'needs_service');
  end if;
  update public.service_invitations set state = 'expired'
    where request_id = p_request_id and state = 'open' and expires_at <= clock_timestamp();
  if exists (select 1 from public.service_invitations i
    where i.request_id = p_request_id and i.state = 'open' and i.expires_at > clock_timestamp()) then
    return jsonb_build_object('outcome', 'already_searching');
  end if;
  select coalesce(max(d.round), 0) + 1,
    count(*) filter (where d.reason not in ('manual_retry', 'worker_released') and d.outcome <> 'limit_reached'),
    count(*) filter (where d.reason = 'manual_retry' and d.outcome = 'invited'),
    greatest(max(d.created_at) filter (where d.outcome = 'invited') + make_interval(mins => v_settings.retry_cooldown_minutes),
      max(d.created_at) filter (where d.outcome = 'no_eligible_worker' and d.reason in ('manual_retry', 'recovery'))
        + make_interval(secs => v_settings.empty_retry_cooldown_seconds))
    into v_round, v_automatic_used, v_manual_used, v_retry_at
    from public.service_dispatch_rounds d where d.request_id = p_request_id;
  if v_customer_started then
    if p_reason = 'manual_retry' and v_manual_used >= v_settings.max_manual_retries then
      return jsonb_build_object('outcome', 'limit_reached');
    end if;
    if v_retry_at is not null and v_retry_at > clock_timestamp() then
      return jsonb_build_object('outcome', 'cooldown', 'next_retry_at', v_retry_at);
    end if;
  end if;
  v_label := left(btrim(split_part(btrim(v_request.description), E'\n', 1)), 48);
  if not v_customer_started and p_reason <> 'worker_released' and v_automatic_used >= v_settings.max_rounds then
    insert into public.service_dispatch_rounds (request_id, quote_id, round, invited_count, reason, outcome)
      values (p_request_id, p_quote_id, v_round, 0, p_reason, 'limit_reached');
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'dispatch_exhausted', p_request_id, 'Đã hết lượt tìm thợ tự động',
        'Yêu cầu “' || coalesce(v_label, '') || '” đã hết lượt tìm thợ tự động. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.');
    return jsonb_build_object('outcome', 'limit_reached', 'round', v_round, 'invited', 0);
  end if;
  for v_worker in
    select p.worker_id from public.worker_public_profiles p
    where v_request.service_id = any (p.service_ids)
      and p.worker_id <> v_request.owner_id
      and nestscout_private.fixture_worker_dispatchable(p.worker_id)
      and nestscout_private.worker_unavailable_reason(p.worker_id, p_request_id) is null
      and not exists (select 1 from public.service_invitations i
        where i.request_id = p_request_id and i.worker_id = p.worker_id
          and (i.state in ('open', 'accepted', 'cancelled')
            or (i.state = 'declined' and coalesce(i.resolved_at, i.created_at) > clock_timestamp() - make_interval(mins => v_settings.reinvite_declined_after_minutes))
            or (i.state = 'expired' and i.expires_at > clock_timestamp() - make_interval(mins => v_settings.reinvite_expired_after_minutes))))
      and (select count(*) from public.service_invitations i where i.request_id = p_request_id and i.worker_id = p.worker_id) < v_settings.max_invites_per_worker
    order by (select count(*) from public.service_invitations i where i.request_id = p_request_id and i.worker_id = p.worker_id),
      (select count(*) from public.service_jobs j where j.worker_id = p.worker_id and j.stage not in ('submitted', 'completed')),
      p.worker_id
    limit v_settings.max_invites
  loop
    exit when exists (select 1 from public.service_jobs j where j.request_id = p_request_id);
    insert into public.service_invitations (request_id, quote_id, worker_id, expires_at)
      values (p_request_id, p_quote_id, v_worker, clock_timestamp() + make_interval(mins => v_settings.offer_minutes))
      returning id into v_invitation;
    v_invited := v_invited + 1;
    perform nestscout_private.auto_accept_invitation(v_invitation);
  end loop;
  v_outcome := case when v_invited > 0 then 'invited' else 'no_eligible_worker' end;
  insert into public.service_dispatch_rounds (request_id, quote_id, round, invited_count, reason, outcome)
    values (p_request_id, p_quote_id, v_round, v_invited, p_reason, v_outcome);
  if v_invited = 0 and not v_customer_started and p_reason <> 'worker_released' then
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'dispatch_exhausted', p_request_id, 'Chưa có thợ nhận việc',
        'Yêu cầu “' || coalesce(v_label, '') || '” chưa có thợ nhận. Bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.');
  end if;
  return jsonb_build_object('outcome', v_outcome, 'round', v_round, 'invited', v_invited);
end;
$$;

drop function public.get_dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_state(uuid, uuid[]);

create function nestscout_private.dispatch_state(p_owner uuid, p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz)
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
      exists (select 1 from public.service_jobs j where j.request_id = r.id) as has_job,
      exists (select 1 from public.service_quotes q where q.request_id = r.id and q.accepted_at is not null) as has_accepted,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as live,
      (select min(i.expires_at) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at > clock_timestamp()) as next_expiry,
      (select count(*) from public.service_invitations i where i.request_id = r.id and i.state = 'open' and i.expires_at <= clock_timestamp()) as lapsed,
      (select count(*) from public.service_invitations i where i.request_id = r.id) as total,
      (select j.stage from public.service_jobs j where j.request_id = r.id) as job_stage,
      (select greatest(j.created_at, coalesce(r.preferred_visit_at, j.created_at)) from public.service_jobs j where j.request_id = r.id) as job_clock,
      d.round_count, d.last_outcome as last_round_outcome, d.manual_used, d.last_invited, d.last_empty
    from public.service_requests r
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
    s.st = 'assigned' and s.job_stage = 'assigned' and s.job_clock + make_interval(mins => v_settings.reassign_idle_minutes) <= clock_timestamp(),
    case when s.st = 'assigned' and s.job_stage = 'assigned' then s.job_clock + make_interval(mins => v_settings.reassign_idle_minutes) end
  from s;
end;
$$;
revoke all on function nestscout_private.dispatch_state(uuid, uuid[]) from public, anon, authenticated;

create function nestscout_private.dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz)
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
  can_reassign boolean, reassign_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from nestscout_private.dispatch_summary(p_request_ids); $$;
revoke all on function public.get_dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.get_dispatch_summary(uuid[]) to authenticated;


create table public.service_job_releases (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique,
  request_id uuid not null references public.service_requests (id),
  quote_id uuid not null,
  invitation_id uuid not null references public.service_invitations (id),
  worker_id uuid not null references auth.users (id),
  stage text not null,
  job_version integer not null,
  released_by uuid not null references auth.users (id),
  released_by_role text not null check (released_by_role in ('worker', 'customer')),
  reason text not null check (reason in ('unavailable', 'schedule_conflict', 'cannot_reach', 'other', 'no_show')),
  note text check (note is null or char_length(note) between 1 and 500),
  events jsonb not null default '[]'::jsonb,
  reports jsonb not null default '[]'::jsonb,
  operation_key uuid not null,
  released_at timestamptz not null default now(),
  unique (released_by, operation_key)
);
create index service_job_releases_request on public.service_job_releases (request_id);
alter table public.service_job_releases enable row level security;
revoke all on table public.service_job_releases from public, anon, authenticated;
grant select on table public.service_job_releases to authenticated;
create policy service_job_releases_select_participant on public.service_job_releases for select to authenticated
  using (
    coalesce(((select auth.jwt()) ->> 'is_anonymous'), 'false') = 'false'
    and (worker_id = (select auth.uid())
      or exists (select 1 from public.service_requests r where r.id = service_job_releases.request_id and r.owner_id = (select auth.uid())))
  );

create function nestscout_private.release_job(p_job_id uuid, p_actor uuid, p_role text, p_reason text, p_note text, p_key uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings nestscout_private.auto_dispatch_settings%rowtype;
  v_request public.service_requests%rowtype;
  v_job public.service_jobs%rowtype;
  v_request_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_events jsonb;
  v_reports jsonb;
  v_dispatch jsonb;
  v_label text;
  v_assigned boolean;
begin
  if p_key is null or p_actor is null or p_role is null or p_role not in ('worker', 'customer')
    or p_reason is null or p_reason not in ('unavailable', 'schedule_conflict', 'cannot_reach', 'other', 'no_show')
    or (v_note is not null and char_length(v_note) > 500) then
    raise exception using errcode = '22023', message = 'invalid release';
  end if;
  if exists (select 1 from public.service_job_releases x where x.released_by = p_actor and x.operation_key = p_key) then
    return jsonb_build_object('outcome', 'already_released');
  end if;
  select j.request_id into v_request_id from public.service_jobs j where j.id = p_job_id;
  if v_request_id is null then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  select * into v_request from public.service_requests r where r.id = v_request_id for update;
  select * into v_job from public.service_jobs j where j.id = p_job_id for update;
  if not found then
    raise exception using errcode = '40001', message = 'job changed';
  end if;
  if (p_role = 'worker' and v_job.worker_id <> p_actor) or (p_role = 'customer' and v_request.owner_id <> p_actor) then
    raise exception using errcode = '42501', message = 'job unavailable';
  end if;
  if p_role = 'worker' and p_version is distinct from v_job.version then
    raise exception using errcode = '40001', message = 'stale job';
  end if;
  if v_job.stage not in ('assigned', 'en_route') then
    raise exception using errcode = '22023', message = 'release not allowed at this stage';
  end if;
  select * into v_settings from nestscout_private.auto_dispatch_settings;
  if p_role = 'customer' and (v_job.stage <> 'assigned'
    or greatest(v_job.created_at, coalesce(v_request.preferred_visit_at, v_job.created_at)) + make_interval(mins => v_settings.reassign_idle_minutes) > clock_timestamp()) then
    raise exception using errcode = '22023', message = 'worker still has time';
  end if;
  if exists (select 1 from public.job_change_requests c where c.job_id = v_job.id)
    or exists (select 1 from public.service_scope_changes s where s.job_id = v_job.id)
    or exists (select 1 from public.service_job_pauses p where p.job_id = v_job.id)
    or exists (select 1 from public.service_submissions s where s.job_id = v_job.id)
    or exists (select 1 from public.service_cases c where c.job_id = v_job.id)
    or exists (select 1 from public.worker_reviews w where w.job_id = v_job.id) then
    raise exception using errcode = '22023', message = 'job has open changes';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.version), '[]'::jsonb) into v_events from public.service_job_events e where e.job_id = v_job.id;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.reported_from_version, r.id), '[]'::jsonb) into v_reports from public.service_job_reports r where r.job_id = v_job.id;
  delete from public.service_job_reports where job_id = v_job.id;
  delete from public.service_job_events where job_id = v_job.id;
  insert into public.service_job_releases (job_id, request_id, quote_id, invitation_id, worker_id, stage, job_version, released_by, released_by_role,
    reason, note, events, reports, operation_key)
    values (v_job.id, v_job.request_id, v_job.quote_id, v_job.invitation_id, v_job.worker_id, v_job.stage, v_job.version, p_actor, p_role,
      p_reason, v_note, v_events, v_reports, p_key);
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
revoke all on function nestscout_private.release_job(uuid, uuid, text, text, text, uuid, integer) from public, anon, authenticated;

create function nestscout_private.release_service_job(p_job_id uuid, p_version integer, p_key uuid, p_reason text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker uuid;
begin
  v_worker := nestscout_private.lock_current_worker();
  return nestscout_private.release_job(p_job_id, v_worker, 'worker', p_reason, p_note, p_key, p_version);
end;
$$;
revoke all on function nestscout_private.release_service_job(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function nestscout_private.release_service_job(uuid, integer, uuid, text, text) to authenticated;

create function public.release_service_job(p_job_id uuid, p_version integer, p_key uuid, p_reason text, p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.release_service_job(p_job_id, p_version, p_key, p_reason, p_note); $$;
revoke all on function public.release_service_job(uuid, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.release_service_job(uuid, integer, uuid, text, text) to authenticated;

create function nestscout_private.request_service_reassignment(p_request_id uuid, p_key uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_job uuid;
begin
  if v_owner is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_request_id is null or p_key is null then
    raise exception using errcode = '22023', message = 'invalid release';
  end if;
  if exists (select 1 from public.service_job_releases x where x.released_by = v_owner and x.operation_key = p_key) then
    return jsonb_build_object('outcome', 'already_released');
  end if;
  if not exists (select 1 from public.service_requests r where r.id = p_request_id and r.owner_id = v_owner) then
    raise exception using errcode = '42501', message = 'request unavailable';
  end if;
  select j.id into v_job from public.service_jobs j where j.request_id = p_request_id;
  if v_job is null then
    raise exception using errcode = '22023', message = 'no worker assigned';
  end if;
  return nestscout_private.release_job(v_job, v_owner, 'customer', 'no_show', p_note, p_key, null);
end;
$$;
revoke all on function nestscout_private.request_service_reassignment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function nestscout_private.request_service_reassignment(uuid, uuid, text) to authenticated;

create function public.request_service_reassignment(p_request_id uuid, p_key uuid, p_note text default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.request_service_reassignment(p_request_id, p_key, p_note); $$;
revoke all on function public.request_service_reassignment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.request_service_reassignment(uuid, uuid, text) to authenticated;

