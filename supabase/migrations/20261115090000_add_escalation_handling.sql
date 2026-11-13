alter table public.service_job_escalations drop constraint service_job_escalations_job_id_fkey;

alter table public.service_job_escalations
  add column status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  add column reviewed_by uuid references auth.users (id),
  add column reviewed_at timestamptz,
  add column review_key uuid,
  add column resolved_by uuid references auth.users (id),
  add column resolved_at timestamptz,
  add column resolve_key uuid,
  add column resolution text check (resolution in ('proceed', 'replace_worker', 'dismiss')),
  add column resolution_note text check (resolution_note is null or char_length(resolution_note) between 1 and 500),
  add constraint service_job_escalations_state_consistent check (
    (status = 'open' and reviewed_by is null and reviewed_at is null and resolved_by is null and resolved_at is null and resolution is null)
    or (status = 'reviewing' and reviewed_by is not null and reviewed_at is not null and resolved_by is null and resolved_at is null and resolution is null)
    or (status = 'resolved' and reviewed_by is not null and reviewed_at is not null and resolved_by is not null and resolved_at is not null and resolution is not null)
  );
create unique index service_job_escalations_review_key on public.service_job_escalations (reviewed_by, review_key) where review_key is not null;
create unique index service_job_escalations_resolve_key on public.service_job_escalations (resolved_by, resolve_key) where resolve_key is not null;
create index service_job_escalations_open on public.service_job_escalations (created_at) where status <> 'resolved';

revoke select on table public.service_job_escalations from authenticated;
grant select (id, job_id, request_id, worker_id, kind, note, status, resolution, resolution_note, created_at, resolved_at)
  on table public.service_job_escalations to authenticated;

alter table public.service_job_releases drop constraint service_job_releases_released_by_role_check;
alter table public.service_job_releases add constraint service_job_releases_released_by_role_check check (released_by_role in ('worker', 'customer', 'operator'));
alter table public.service_job_releases drop constraint service_job_releases_reason_check;
alter table public.service_job_releases add constraint service_job_releases_reason_check
  check (reason in ('unavailable', 'schedule_conflict', 'cannot_reach', 'other', 'no_show', 'operator_decision'));

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('quote_received', 'job_assigned', 'job_progress', 'work_submitted', 'job_completed', 'scope_proposed', 'job_offered', 'work_approved',
    'revision_requested', 'work_disputed', 'scope_approved', 'scope_rejected', 'resume_agreed', 'review_received', 'change_requested', 'change_decided',
    'job_auto_accepted', 'dispatch_exhausted', 'job_released', 'job_withdrawn', 'job_escalated', 'escalation_received', 'escalation_resolved'));

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
  if p_key is null or p_actor is null or p_role is null or p_role not in ('worker', 'customer', 'operator')
    or p_reason is null or p_reason not in ('unavailable', 'schedule_conflict', 'cannot_reach', 'other', 'no_show', 'operator_decision')
    or (p_role = 'operator') <> (p_reason = 'operator_decision')
    or (v_note is not null and char_length(v_note) > 500) then
    raise exception using errcode = '22023', message = 'invalid release';
  end if;
  if exists (select 1 from public.service_job_releases x where x.released_by = p_actor and x.operation_key = p_key) then
    return jsonb_build_object('outcome', 'already_released');
  end if;
  select j.request_id into v_request_id from public.service_jobs j
    where j.id = p_job_id
      and (p_role = 'operator'
        or (p_role = 'worker' and j.worker_id = p_actor)
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
  if v_action is distinct from (case when p_role = 'operator' then 'escalate' else 'reassign' end) then
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
  elsif p_role = 'customer' then
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_job.worker_id, 'job_withdrawn', v_request.id, 'Khách đã mời thợ khác',
        'Khách đã mời thợ khác cho việc “' || coalesce(v_label, '') || '” vì chưa thấy bạn đến. Việc này không còn trong danh sách của bạn.');
  else
    insert into public.notifications (recipient_id, kind, request_id, title, body)
      values (v_job.worker_id, 'job_withdrawn', v_request.id, 'Việc đã được giao cho thợ khác',
        'Sau khi xem xét báo cáo sự cố, việc “' || coalesce(v_label, '') || '” đã được giao cho thợ khác và không còn trong danh sách của bạn.');
  end if;
  return jsonb_build_object('outcome', 'released', 'dispatch', v_dispatch);
end;
$$;

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
    from nestscout_private.fixture_operators o
    where o.active and o.basis = 'local_fixture' and o.user_id <> v_owner and o.user_id <> v_job.worker_id;
  return jsonb_build_object('outcome', 'escalated');
end;
$$;

create function nestscout_private.operator_escalation_queue()
returns table (escalation_id uuid, request_id uuid, job_id uuid, status text, kind text, note text, created_at timestamptz, reviewed_at timestamptz,
  description text, location text, worker_name text, job_stage text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform nestscout_private.require_fixture_operator();
  return query
  select x.id, x.request_id, x.job_id, x.status, x.kind, x.note, x.created_at, x.reviewed_at,
    left(r.description, 300), r.location, p.display_name, j.stage
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
  description text, location text, worker_name text, job_stage text)
language sql
stable
security invoker
set search_path = ''
as $$ select * from nestscout_private.operator_escalation_queue(); $$;
revoke all on function public.operator_escalation_queue() from public, anon, authenticated;
grant execute on function public.operator_escalation_queue() to authenticated;

create function nestscout_private.review_service_escalation(p_escalation_id uuid, p_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator uuid;
  v_escalation public.service_job_escalations%rowtype;
begin
  v_operator := nestscout_private.lock_fixture_operator();
  if p_escalation_id is null or p_key is null then
    raise exception using errcode = '22023', message = 'invalid review';
  end if;
  select * into v_escalation from public.service_job_escalations x where x.id = p_escalation_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'escalation unavailable';
  end if;
  if v_escalation.status = 'resolved' then
    return jsonb_build_object('outcome', 'already_resolved');
  end if;
  if v_escalation.status = 'reviewing' then
    return jsonb_build_object('outcome', 'already_reviewing');
  end if;
  update public.service_job_escalations
    set status = 'reviewing', reviewed_by = v_operator, reviewed_at = clock_timestamp(), review_key = p_key
    where id = v_escalation.id;
  return jsonb_build_object('outcome', 'reviewing');
end;
$$;
revoke all on function nestscout_private.review_service_escalation(uuid, uuid) from public, anon, authenticated;
grant execute on function nestscout_private.review_service_escalation(uuid, uuid) to authenticated;

create function public.review_service_escalation(p_escalation_id uuid, p_key uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.review_service_escalation(p_escalation_id, p_key); $$;
revoke all on function public.review_service_escalation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.review_service_escalation(uuid, uuid) to authenticated;

create function nestscout_private.resolve_service_escalation(p_escalation_id uuid, p_resolution text, p_note text, p_key uuid)
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
  v_operator := nestscout_private.lock_fixture_operator();
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
  if p_resolution = 'replace_worker' then
    v_release := nestscout_private.release_job(v_escalation.job_id, v_operator, 'operator', 'operator_decision', v_note, p_key, null);
  end if;
  update public.service_job_escalations
    set status = 'resolved', resolved_by = v_operator, resolved_at = clock_timestamp(), resolve_key = p_key, resolution = p_resolution, resolution_note = v_note
    where id = v_escalation.id;
  select * into v_request from public.service_requests r where r.id = v_escalation.request_id;
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
revoke all on function nestscout_private.resolve_service_escalation(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function nestscout_private.resolve_service_escalation(uuid, text, text, uuid) to authenticated;

create function public.resolve_service_escalation(p_escalation_id uuid, p_resolution text, p_note text, p_key uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select nestscout_private.resolve_service_escalation(p_escalation_id, p_resolution, p_note, p_key); $$;
revoke all on function public.resolve_service_escalation(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_service_escalation(uuid, text, text, uuid) to authenticated;

drop function public.get_dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_summary(uuid[]);
drop function nestscout_private.dispatch_state(uuid, uuid[]);

create function nestscout_private.dispatch_state(p_owner uuid, p_request_ids uuid[])
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
    left join lateral (select x.status, x.resolution from public.service_job_escalations x where x.job_id = jj.id) esc on jj.id is not null
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
revoke all on function nestscout_private.dispatch_state(uuid, uuid[]) from public, anon, authenticated;

create function nestscout_private.dispatch_summary(p_request_ids uuid[])
returns table (request_id uuid, state text, open_invites integer, earliest_expiry timestamptz, rounds integer, can_retry boolean,
  can_cancel boolean, can_reclassify boolean, next_retry_at timestamptz, retries_left integer, last_outcome text,
  can_reassign boolean, reassign_at timestamptz, job_stage text, can_escalate boolean, escalate_at timestamptz, escalated_at timestamptz,
  escalation_status text, escalation_resolution text)
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
  can_reassign boolean, reassign_at timestamptz, job_stage text, can_escalate boolean, escalate_at timestamptz, escalated_at timestamptz,
  escalation_status text, escalation_resolution text)
language sql
security invoker
set search_path = ''
as $$ select * from nestscout_private.dispatch_summary(p_request_ids); $$;
revoke all on function public.get_dispatch_summary(uuid[]) from public, anon, authenticated;
grant execute on function public.get_dispatch_summary(uuid[]) to authenticated;
