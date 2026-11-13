alter table nestscout_private.auto_dispatch_settings
  add column review_timeout_minutes integer not null default 30 check (review_timeout_minutes between 5 and 1440);

alter table public.service_job_escalations
  add column takeover_count integer not null default 0 check (takeover_count >= 0),
  add column review_history jsonb not null default '[]' check (jsonb_typeof(review_history) = 'array');

create table nestscout_private.operator_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  basis text not null check (basis = 'beta_program'),
  reference text not null check (char_length(btrim(reference)) between 3 and 120),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint operator_grants_window check (expires_at > granted_at and expires_at <= granted_at + interval '90 days')
);
revoke all on table nestscout_private.operator_grants from public, anon, authenticated;

create table nestscout_private.operator_grant_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null check (action in ('granted', 'revoked')),
  reference text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on table nestscout_private.operator_grant_events from public, anon, authenticated;

create function nestscout_private.grant_beta_operator(p_user uuid, p_reference text, p_days integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text := btrim(coalesce(p_reference, ''));
  v_expires timestamptz;
begin
  if p_user is null or char_length(v_reference) not between 3 and 120 or p_days is null or p_days not between 1 and 90 then
    raise exception using errcode = '22023', message = 'invalid operator grant';
  end if;
  perform 1 from auth.users u where u.id = p_user and not coalesce(u.is_anonymous, false);
  if not found then
    raise exception using errcode = '22023', message = 'operator account unavailable';
  end if;
  v_expires := clock_timestamp() + make_interval(days => p_days);
  insert into nestscout_private.operator_grants (user_id, basis, reference, granted_at, expires_at)
    values (p_user, 'beta_program', v_reference, clock_timestamp(), v_expires)
    on conflict (user_id) do update
      set reference = excluded.reference, granted_at = excluded.granted_at, expires_at = excluded.expires_at, revoked_at = null;
  insert into nestscout_private.operator_grant_events (user_id, action, reference, expires_at) values (p_user, 'granted', v_reference, v_expires);
  return v_expires;
end;
$$;
revoke all on function nestscout_private.grant_beta_operator(uuid, text, integer) from public, anon, authenticated;

create function nestscout_private.revoke_beta_operator(p_user uuid, p_reference text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text := btrim(coalesce(p_reference, ''));
  v_revoked integer;
begin
  if p_user is null or char_length(v_reference) not between 3 and 120 then
    raise exception using errcode = '22023', message = 'invalid operator revocation';
  end if;
  update nestscout_private.operator_grants set revoked_at = clock_timestamp() where user_id = p_user and revoked_at is null;
  get diagnostics v_revoked = row_count;
  if v_revoked = 0 then
    return false;
  end if;
  insert into nestscout_private.operator_grant_events (user_id, action, reference) values (p_user, 'revoked', v_reference);
  return true;
end;
$$;
revoke all on function nestscout_private.revoke_beta_operator(uuid, text) from public, anon, authenticated;

create function nestscout_private.is_escalation_operator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1 from nestscout_private.operator_grants g
    where g.user_id = p_user and g.revoked_at is null and g.expires_at > clock_timestamp());
$$;
revoke all on function nestscout_private.is_escalation_operator(uuid) from public, anon, authenticated;

create function nestscout_private.require_escalation_operator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_operator uuid := auth.uid();
begin
  if v_operator is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false'
    or not nestscout_private.is_escalation_operator(v_operator) then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  return v_operator;
end;
$$;
revoke all on function nestscout_private.require_escalation_operator() from public, anon, authenticated;

create function nestscout_private.lock_escalation_operator()
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
  perform 1 from nestscout_private.operator_grants g
    where g.user_id = v_operator and g.revoked_at is null and g.expires_at > clock_timestamp() for share;
  if not found then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  return v_operator;
end;
$$;
revoke all on function nestscout_private.lock_escalation_operator() from public, anon, authenticated;

create function nestscout_private.escalation_review_stale(p_reviewed_at timestamptz, p_reviewed_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_reviewed_by is not null and (
    p_reviewed_at + make_interval(mins => (select s.review_timeout_minutes from nestscout_private.auto_dispatch_settings s)) <= clock_timestamp()
    or not nestscout_private.is_escalation_operator(p_reviewed_by));
$$;
revoke all on function nestscout_private.escalation_review_stale(timestamptz, uuid) from public, anon, authenticated;

create function nestscout_private.operator_access()
returns table (expires_at timestamptz, open_cases integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    return;
  end if;
  return query
  select g.expires_at, (select count(*)::integer from public.service_job_escalations x where x.status <> 'resolved')
  from nestscout_private.operator_grants g
  where g.user_id = auth.uid() and g.revoked_at is null and g.expires_at > clock_timestamp();
end;
$$;
revoke all on function nestscout_private.operator_access() from public, anon, authenticated;
grant execute on function nestscout_private.operator_access() to authenticated;

create function public.operator_access()
returns table (expires_at timestamptz, open_cases integer)
language sql
stable
security invoker
set search_path = ''
as $$ select * from nestscout_private.operator_access(); $$;
revoke all on function public.operator_access() from public, anon, authenticated;
grant execute on function public.operator_access() to authenticated;

create or replace function nestscout_private.escalate_service_job(p_request_id uuid, p_key uuid, p_note text)
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
  insert into public.notifications (recipient_id, kind, request_id, title, body)
    select o.user_id, 'escalation_received', v_request.id, 'Có sự cố cần xem xét',
      'Khách báo thợ đã đến nhưng chưa bắt đầu việc “' || coalesce(v_label, '') || '”. Mở Xử lý sự cố để xem xét.'
    from nestscout_private.operator_grants o
    where o.revoked_at is null and o.expires_at > clock_timestamp() and o.user_id <> v_owner and o.user_id <> v_job.worker_id;
  return jsonb_build_object('outcome', 'escalated');
end;
$$;

drop function public.operator_escalation_queue();
drop function nestscout_private.operator_escalation_queue();

create function nestscout_private.operator_escalation_queue()
returns table (escalation_id uuid, request_id uuid, job_id uuid, status text, kind text, note text, created_at timestamptz, reviewed_at timestamptz,
  description text, location text, worker_name text, job_stage text, review_state text, review_expires_at timestamptz, takeover_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_operator uuid := nestscout_private.require_escalation_operator();
  v_timeout integer;
begin
  select s.review_timeout_minutes into v_timeout from nestscout_private.auto_dispatch_settings s;
  return query
  select x.id, x.request_id, x.job_id, x.status, x.kind, x.note, x.created_at, x.reviewed_at,
    left(r.description, 300), r.location, p.display_name, j.stage,
    case
      when x.status = 'open' then 'unclaimed'
      when x.reviewed_by = v_operator then 'mine'
      when nestscout_private.escalation_review_stale(x.reviewed_at, x.reviewed_by) then 'stale'
      else 'held'
    end,
    case when x.status = 'reviewing' then x.reviewed_at + make_interval(mins => v_timeout) end,
    x.takeover_count
  from public.service_job_escalations x
  join public.service_requests r on r.id = x.request_id
  left join public.worker_public_profiles p on p.worker_id = x.worker_id
  left join public.service_jobs j on j.id = x.job_id
  where x.status <> 'resolved'
  order by x.created_at, x.id
  limit 100;
end;
$$;
revoke all on function nestscout_private.operator_escalation_queue() from public, anon, authenticated;
grant execute on function nestscout_private.operator_escalation_queue() to authenticated;

create function public.operator_escalation_queue()
returns table (escalation_id uuid, request_id uuid, job_id uuid, status text, kind text, note text, created_at timestamptz, reviewed_at timestamptz,
  description text, location text, worker_name text, job_stage text, review_state text, review_expires_at timestamptz, takeover_count integer)
language sql
stable
security invoker
set search_path = ''
as $$ select * from nestscout_private.operator_escalation_queue(); $$;
revoke all on function public.operator_escalation_queue() from public, anon, authenticated;
grant execute on function public.operator_escalation_queue() to authenticated;

create or replace function nestscout_private.review_service_escalation(p_escalation_id uuid, p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid;
  v_escalation public.service_job_escalations%rowtype;
  v_request public.service_requests%rowtype;
begin
  v_operator := nestscout_private.lock_escalation_operator();
  if p_escalation_id is null or p_key is null then
    raise exception using errcode = '22023', message = 'invalid review';
  end if;
  select * into v_escalation from public.service_job_escalations x where x.id = p_escalation_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'escalation unavailable';
  end if;
  select * into v_request from public.service_requests r where r.id = v_escalation.request_id;
  if v_operator = v_request.owner_id or v_operator = v_escalation.worker_id then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  if v_escalation.status = 'resolved' then
    return jsonb_build_object('outcome', 'already_resolved');
  end if;
  if v_escalation.status = 'open' then
    update public.service_job_escalations
      set status = 'reviewing', reviewed_by = v_operator, reviewed_at = clock_timestamp(), review_key = p_key
      where id = v_escalation.id;
    return jsonb_build_object('outcome', 'reviewing');
  end if;
  if v_escalation.reviewed_by = v_operator then
    if v_escalation.review_key is distinct from p_key then
      update public.service_job_escalations set reviewed_at = clock_timestamp(), review_key = p_key where id = v_escalation.id;
    end if;
    return jsonb_build_object('outcome', 'already_reviewing');
  end if;
  if not nestscout_private.escalation_review_stale(v_escalation.reviewed_at, v_escalation.reviewed_by) then
    return jsonb_build_object('outcome', 'already_reviewing');
  end if;
  update public.service_job_escalations
    set reviewed_by = v_operator, reviewed_at = clock_timestamp(), review_key = p_key, takeover_count = takeover_count + 1,
      review_history = review_history || jsonb_build_array(jsonb_build_object(
        'operator', v_escalation.reviewed_by, 'claimed_at', v_escalation.reviewed_at, 'ended_at', clock_timestamp(),
        'reason', case when nestscout_private.is_escalation_operator(v_escalation.reviewed_by) then 'timed_out' else 'operator_unavailable' end,
        'taken_by', v_operator))
    where id = v_escalation.id;
  return jsonb_build_object('outcome', 'taken_over');
end;
$$;

create or replace function nestscout_private.resolve_service_escalation(p_escalation_id uuid, p_resolution text, p_note text, p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_escalation public.service_job_escalations%rowtype;
  v_request public.service_requests%rowtype;
  v_release jsonb;
  v_label text;
  v_outcome text;
  v_tail text;
begin
  v_operator := nestscout_private.lock_escalation_operator();
  if p_escalation_id is null or p_key is null or p_resolution is null or p_resolution not in ('proceed', 'replace_worker', 'dismiss')
    or (v_note is not null and char_length(v_note) > 500) then
    raise exception using errcode = '22023', message = 'invalid resolution';
  end if;
  if exists (select 1 from public.service_job_escalations x where x.resolved_by = v_operator and x.resolve_key = p_key) then
    return jsonb_build_object('outcome', 'already_resolved');
  end if;
  select * into v_escalation from public.service_job_escalations x where x.id = p_escalation_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'escalation unavailable';
  end if;
  if v_escalation.status = 'resolved' then
    return jsonb_build_object('outcome', 'already_resolved');
  end if;
  if v_escalation.status <> 'reviewing' then
    raise exception using errcode = '22023', message = 'review required';
  end if;
  select * into v_request from public.service_requests r where r.id = v_escalation.request_id;
  if v_operator = v_request.owner_id or v_operator = v_escalation.worker_id then
    raise exception using errcode = '42501', message = 'operator unavailable';
  end if;
  if v_escalation.reviewed_by is distinct from v_operator then
    raise exception using errcode = '22023', message = 'review held by another operator';
  end if;
  if p_resolution = 'replace_worker' then
    v_release := nestscout_private.release_job(v_escalation.job_id, v_operator, 'operator', 'operator_decision', v_note, p_key, null);
  end if;
  update public.service_job_escalations
    set status = 'resolved', resolved_by = v_operator, resolved_at = clock_timestamp(), resolve_key = p_key, resolution = p_resolution, resolution_note = v_note
    where id = v_escalation.id;
  v_label := left(btrim(split_part(btrim(v_request.description), E'\n', 1)), 48);
  v_tail := case when v_note is null then '' else ' Ghi chú: ' || left(v_note, 300) end;
  if p_resolution = 'replace_worker' then
    v_outcome := v_release -> 'dispatch' ->> 'outcome';
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'escalation_resolved', v_request.id, 'Sự cố đã được xử lý',
        case
          when exists (select 1 from public.service_jobs j where j.request_id = v_request.id)
            then 'Sự cố ở yêu cầu “' || coalesce(v_label, '') || '” đã được xem xét. Một thợ khác đã nhận việc thay.'
          when v_outcome = 'invited'
            then 'Sự cố ở yêu cầu “' || coalesce(v_label, '') || '” đã được xem xét. Hệ thống đã mời thợ khác; bạn sẽ được báo khi có thợ nhận.'
          else 'Sự cố ở yêu cầu “' || coalesce(v_label, '') || '” đã được xem xét. Chưa có thợ khác phù hợp; bạn có thể mời lại hoặc hủy trong Yêu cầu của tôi.'
        end || v_tail);
  else
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_request.owner_id, 'escalation_resolved', v_request.id, 'Sự cố đã được xử lý',
        case when p_resolution = 'proceed'
          then 'Sự cố ở yêu cầu “' || coalesce(v_label, '') || '” đã được xem xét. Thợ sẽ tiếp tục công việc.'
          else 'Sự cố ở yêu cầu “' || coalesce(v_label, '') || '” đã được xem xét và đóng, chưa cần xử lý thêm.'
        end || v_tail),
      (v_escalation.worker_id, 'escalation_resolved', v_request.id, 'Báo sự cố đã được xem xét',
        case when p_resolution = 'proceed'
          then 'Báo sự cố ở việc “' || coalesce(v_label, '') || '” đã được xem xét. Hãy tiếp tục công việc.'
          else 'Báo sự cố ở việc “' || coalesce(v_label, '') || '” đã được đóng.'
        end || v_tail);
  end if;
  return jsonb_build_object('outcome', 'resolved', 'resolution', p_resolution);
end;
$$;

create or replace function nestscout_private.dispatch_state(p_owner uuid, p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz, job_stage text, can_escalate boolean, escalate_at timestamptz, escalated_at timestamptz,
  escalation_status text, escalation_resolution text)
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
      esc.status as esc_status, esc.resolution as esc_resolution,
      d.round_count, d.last_outcome as last_round_outcome, d.manual_used, d.last_invited, d.last_empty
    from public.service_requests r
    left join lateral (select j.id, j.stage from public.service_jobs j where j.request_id = r.id) jj on true
    left join lateral nestscout_private.job_recovery(jj.id) rec on jj.id is not null
    left join lateral (
      select case when x.status = 'reviewing' and nestscout_private.escalation_review_stale(x.reviewed_at, x.reviewed_by) then 'open' else x.status end as status,
        x.resolution
      from public.service_job_escalations x where x.job_id = jj.id
    ) esc on jj.id is not null
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
    case when s.st = 'assigned' and s.rec_action = 'escalate' then s.rec_escalated end,
    case when s.st = 'assigned' then s.esc_status end,
    case when s.st = 'assigned' then s.esc_resolution end
  from s;
end;
$$;
